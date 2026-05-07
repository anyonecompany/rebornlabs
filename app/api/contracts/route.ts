import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, AuthError, getAuthErrorMessage } from "@/lib/auth/verify";
import { dataScope } from "@/lib/auth/capabilities";
import { fetchSubordinateIds } from "@/lib/auth/subordinate";

// ─── Zod 스키마 ───────────────────────────────────────────────

const VehicleInfoOverrideSchema = z.object({
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.number().optional(),
  mileage: z.number().optional(),
  plate_number: z.string().optional(),
  vin: z.string().optional(),
  color: z.string().optional(),
}).optional();

const CreateContractSchema = z.object({
  sale_id: z.string().uuid("올바른 UUID 형식이 아닙니다."),
  customer_name: z.string().min(1, "고객명은 필수입니다."),
  customer_phone: z.string().min(1, "고객 전화번호는 필수입니다."),
  customer_email: z.string().email("올바른 이메일 형식이 아닙니다."),
  customer_address: z.string().optional(),
  customer_id_number: z.string().optional(),
  vehicle_info: VehicleInfoOverrideSchema,
  contract_type: z.enum(["accident", "safe"]).optional(),
});

// ─── 헬퍼 ────────────────────────────────────────────────────

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

// ─── GET /api/contracts — 계약서 목록 조회 ───────────────────

/**
 * 계약서 목록 조회.
 *
 * - 인증 필수
 * - query: sale_id (필수) — 해당 판매 건의 계약서 목록
 * - dealer: 본인 판매 건만 조회 가능
 */
export async function GET(request: NextRequest) {
  try {
    const token = extractToken(request);
    const user = await verifyUser(token);

    const { searchParams } = new URL(request.url);
    const saleId = searchParams.get("sale_id");

    if (!saleId) {
      return NextResponse.json(
        { error: "sale_id는 필수입니다." },
        { status: 400 },
      );
    }

    const serviceClient = createServiceClient();

    // 역할별 단건 권한 — capabilities.ts SSOT
    const scope = dataScope(user.role, "contracts");
    if (scope === "none") {
      return NextResponse.json(
        { error: "접근 권한이 없습니다." },
        { status: 403 },
      );
    }
    if (scope !== "all") {
      const { data: sale, error: saleError } = await serviceClient
        .from("sales")
        .select("dealer_id")
        .eq("id", saleId)
        .single();

      if (saleError || !sale) {
        return NextResponse.json(
          { error: "판매 정보를 찾을 수 없습니다." },
          { status: 404 },
        );
      }

      if (scope === "self" && sale.dealer_id !== user.id) {
        return NextResponse.json(
          { error: "접근 권한이 없습니다." },
          { status: 403 },
        );
      }
      if (scope === "subordinate") {
        const subordinateIds = await fetchSubordinateIds(serviceClient, user.id);
        if (!subordinateIds.includes(sale.dealer_id)) {
          return NextResponse.json(
            { error: "접근 권한이 없습니다." },
            { status: 403 },
          );
        }
      }
    }

    const { data: contracts, error } = await serviceClient
      .from("contracts")
      .select(
        "id, sale_id, token, status, customer_name, customer_phone, customer_email, customer_address, vehicle_info, selling_price, deposit, signature_url, signed_at, pdf_url, created_at, created_by",
      )
      .eq("sale_id", saleId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: "계약서 목록을 불러오지 못했습니다." },
        { status: 500 },
      );
    }

    // signature_url, pdf_url → on-demand signed URL 생성 (Promise.all 병렬화)
    const resolved = await Promise.all(
      (contracts ?? []).map(async (c) => {
        const sigMatch = (c.signature_url as string | null)?.match(/\/signatures\/(.+?)(?:\?|$)/);
        const pdfMatch = (c.pdf_url as string | null)?.match(/\/contracts\/(.+?)(?:\?|$)/);

        const [sigResult, pdfResult] = await Promise.all([
          sigMatch?.[1]
            ? serviceClient.storage.from("signatures").createSignedUrl(decodeURIComponent(sigMatch[1]), 3600)
            : Promise.resolve(null),
          pdfMatch?.[1]
            ? serviceClient.storage.from("contracts").createSignedUrl(decodeURIComponent(pdfMatch[1]), 3600)
            : Promise.resolve(null),
        ]);

        return {
          ...c,
          signature_url: sigResult?.data?.signedUrl ?? c.signature_url,
          pdf_url: pdfResult?.data?.signedUrl ?? c.pdf_url,
        };
      }),
    );

    return NextResponse.json({ data: resolved });
  } catch (err) {
    if (err instanceof AuthError) {
      const status =
        err.code === "NO_TOKEN" || err.code === "INVALID_TOKEN" ? 401 : 403;
      return NextResponse.json({ error: getAuthErrorMessage(err.code) }, { status });
    }
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

// ─── POST /api/contracts — 계약서 생성 ───────────────────────

/**
 * 계약서 생성.
 *
 * - 인증 필수 (딜러/직원/경영진)
 * - sale_id로 판매 정보 조회 → vehicle 정보, selling_price, deposit 추출
 * - dealer: 본인 판매 건만 (sale.dealer_id === user.id)
 * - token: crypto.randomUUID()
 * - 성공: 201 { data: contract, token }
 */
export async function POST(request: NextRequest) {
  try {
    const token = extractToken(request);
    const user = await verifyUser(token);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "요청 데이터 형식이 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const parsed = CreateContractSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.errors[0]?.message ?? "입력 데이터가 올바르지 않습니다.",
        },
        { status: 400 },
      );
    }

    const {
      sale_id,
      customer_name,
      customer_phone,
      customer_email,
      customer_address,
      customer_id_number,
      vehicle_info: vehicleInfoOverride,
      contract_type,
    } = parsed.data;

    const serviceClient = createServiceClient();

    // 판매 정보 조회 (차량 정보 포함)
    const { data: sale, error: saleError } = await serviceClient
      .from("sales")
      .select("id, dealer_id, vehicle_id, cancelled_at")
      .eq("id", sale_id)
      .single();

    if (saleError || !sale) {
      return NextResponse.json(
        { error: "판매 정보를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    if (sale.cancelled_at) {
      return NextResponse.json(
        { error: "취소된 판매 건에는 계약서를 생성할 수 없습니다." },
        { status: 400 },
      );
    }

    // POST 역할별 권한 — capabilities.ts SSOT
    const writeScope = dataScope(user.role, "contracts");
    if (writeScope === "none") {
      return NextResponse.json(
        { error: "이 작업을 수행할 권한이 없습니다." },
        { status: 403 },
      );
    }
    if (writeScope === "self" && sale.dealer_id !== user.id) {
      return NextResponse.json(
        { error: "본인의 판매 건에만 계약서를 생성할 수 있습니다." },
        { status: 403 },
      );
    }
    if (writeScope === "subordinate") {
      const subordinateIds = await fetchSubordinateIds(serviceClient, user.id);
      if (!subordinateIds.includes(sale.dealer_id)) {
        return NextResponse.json(
          { error: "산하 딜러의 판매 건에만 계약서를 생성할 수 있습니다." },
          { status: 403 },
        );
      }
    }
    // writeScope === "all" → 검증 없음

    // 차량 정보 조회
    const { data: vehicle, error: vehicleError } = await serviceClient
      .from("vehicles")
      .select("id, vehicle_code, make, model, year, mileage, selling_price, deposit, plate_number, vin, color")
      .eq("id", sale.vehicle_id)
      .single();

    if (vehicleError || !vehicle) {
      return NextResponse.json(
        { error: "차량 정보를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    const contractToken = crypto.randomUUID();
    // body에 vehicle_info가 있으면 해당 값 우선 사용, 없으면 DB 조회값 사용
    const vehicleInfo = {
      make: vehicleInfoOverride?.make ?? vehicle.make,
      model: vehicleInfoOverride?.model ?? vehicle.model,
      year: vehicleInfoOverride?.year ?? vehicle.year,
      mileage: vehicleInfoOverride?.mileage ?? vehicle.mileage,
      vehicle_code: vehicle.vehicle_code,
      plate_number: vehicleInfoOverride?.plate_number ?? vehicle.plate_number ?? undefined,
      vin: vehicleInfoOverride?.vin ?? vehicle.vin ?? undefined,
      color: vehicleInfoOverride?.color ?? vehicle.color ?? undefined,
    };

    const { data: contract, error: insertError } = await serviceClient
      .from("contracts")
      .insert({
        sale_id,
        token: contractToken,
        status: "draft",
        customer_name,
        customer_phone,
        customer_email,
        customer_address: customer_address ?? null,
        customer_id_number: customer_id_number ?? null,
        vehicle_info: vehicleInfo,
        selling_price: vehicle.selling_price,
        deposit: vehicle.deposit,
        signature_url: null,
        signed_at: null,
        pdf_url: null,
        created_by: user.id,
        contract_type: contract_type ?? "accident",
      })
      .select()
      .single();

    if (insertError || !contract) {
      return NextResponse.json(
        { error: "계약서 생성에 실패했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { data: contract, token: contractToken },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof AuthError) {
      const status =
        err.code === "NO_TOKEN" || err.code === "INVALID_TOKEN" ? 401 : 403;
      return NextResponse.json({ error: getAuthErrorMessage(err.code) }, { status });
    }
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
