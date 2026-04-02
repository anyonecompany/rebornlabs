import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, AuthError } from "@/lib/auth/verify";

// ─── Zod 스키마 ───────────────────────────────────────────────

const CreateContractSchema = z.object({
  sale_id: z.string().uuid("올바른 UUID 형식이 아닙니다."),
  customer_name: z.string().min(1, "고객명은 필수입니다."),
  customer_phone: z.string().min(1, "고객 전화번호는 필수입니다."),
  customer_email: z.string().email("올바른 이메일 형식이 아닙니다."),
  customer_address: z.string().optional(),
  customer_id_number: z.string().optional(),
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

    // dealer: 본인 판매 건인지 확인
    if (user.role === "dealer") {
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

      if (sale.dealer_id !== user.id) {
        return NextResponse.json(
          { error: "접근 권한이 없습니다." },
          { status: 403 },
        );
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

    // signature_url, pdf_url → on-demand signed URL 생성
    const resolved = [];
    for (const c of contracts ?? []) {
      const updated = { ...c };
      if (c.signature_url) {
        const match = (c.signature_url as string).match(/\/signatures\/(.+?)(?:\?|$)/);
        if (match?.[1]) {
          const { data: d } = await serviceClient.storage.from("signatures").createSignedUrl(decodeURIComponent(match[1]), 3600);
          updated.signature_url = d?.signedUrl ?? c.signature_url;
        }
      }
      if (c.pdf_url) {
        const match = (c.pdf_url as string).match(/\/contracts\/(.+?)(?:\?|$)/);
        if (match?.[1]) {
          const { data: d } = await serviceClient.storage.from("contracts").createSignedUrl(decodeURIComponent(match[1]), 3600);
          updated.pdf_url = d?.signedUrl ?? c.pdf_url;
        }
      }
      resolved.push(updated);
    }

    return NextResponse.json({ data: resolved });
  } catch (err) {
    if (err instanceof AuthError) {
      const status =
        err.code === "NO_TOKEN" || err.code === "INVALID_TOKEN" ? 401 : 403;
      return NextResponse.json({ error: err.message }, { status });
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

    // dealer: 본인 판매 건만
    if (user.role === "dealer" && sale.dealer_id !== user.id) {
      return NextResponse.json(
        { error: "본인의 판매 건에만 계약서를 생성할 수 있습니다." },
        { status: 403 },
      );
    }

    // 차량 정보 조회
    const { data: vehicle, error: vehicleError } = await serviceClient
      .from("vehicles")
      .select("id, vehicle_code, make, model, year, mileage, selling_price, deposit")
      .eq("id", sale.vehicle_id)
      .single();

    if (vehicleError || !vehicle) {
      return NextResponse.json(
        { error: "차량 정보를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    const contractToken = crypto.randomUUID();
    const vehicleInfo = {
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      mileage: vehicle.mileage,
      vehicle_code: vehicle.vehicle_code,
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
      return NextResponse.json({ error: err.message }, { status });
    }
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
