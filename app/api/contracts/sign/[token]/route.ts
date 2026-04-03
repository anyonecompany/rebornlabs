import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";

// ─── CORS 헬퍼 ────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function corsResponse(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...CORS_HEADERS,
      ...(init?.headers ?? {}),
    },
  });
}

// ─── Zod 스키마 ───────────────────────────────────────────────

const SignSubmitSchema = z.object({
  signature: z.string().min(1, "서명 데이터가 없습니다."),
  idNumber: z.string().optional(), // 앞 6자리 + 마스킹, 예: "880101-1******"
});

type RouteContext = { params: Promise<{ token: string }> };

// ─── OPTIONS — CORS preflight ─────────────────────────────────

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// ─── GET /api/contracts/sign/[token] — 공개 계약서 조회 ───────

/**
 * 서명 링크를 통한 계약서 공개 조회.
 *
 * - 인증 불필요 (공개 엔드포인트)
 * - token으로 계약서 조회
 * - status === 'signed'면 { signed: true, signedAt } 반환
 * - 주민등록번호는 반환하지 않음 (보안)
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    const serviceClient = createServiceClient();

    const { data: contract, error } = await serviceClient
      .from("contracts")
      .select(
        "id, status, customer_name, customer_phone, customer_email, vehicle_info, selling_price, deposit, signed_at",
      )
      .eq("token", token)
      .single();

    if (error || !contract) {
      return corsResponse(
        { error: "계약서를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    if (contract.status === "signed") {
      return corsResponse({
        signed: true,
        signedAt: contract.signed_at,
        contract: {
          id: contract.id,
          customer_name: contract.customer_name,
          customer_phone: contract.customer_phone,
          customer_email: contract.customer_email,
          vehicle_info: contract.vehicle_info,
          selling_price: contract.selling_price,
          deposit: contract.deposit,
          status: contract.status,
        },
      });
    }

    return corsResponse({
      signed: false,
      contract: {
        customer_name: contract.customer_name,
        customer_phone: contract.customer_phone,
        vehicle_info: contract.vehicle_info,
        selling_price: contract.selling_price,
        deposit: contract.deposit,
        status: contract.status,
      },
    });
  } catch {
    return corsResponse(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

// ─── POST /api/contracts/sign/[token] — 서명 제출 ────────────

/**
 * 고객 서명 제출.
 *
 * - 인증 불필요 (공개 엔드포인트)
 * - body: { signature: string (base64 PNG) }
 * - status가 이미 'signed'면 400
 * - base64 → Buffer → Storage signatures 버킷 업로드
 * - PDF 생성 → Storage contracts 버킷 업로드
 * - contracts UPDATE: status, signed_at, signature_url, pdf_url
 * - GAS 웹훅으로 완료 알림 (fire-and-forget)
 * - 성공: 200 { message }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return corsResponse(
        { error: "요청 데이터 형식이 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const parsed = SignSubmitSchema.safeParse(body);
    if (!parsed.success) {
      return corsResponse(
        {
          error:
            parsed.error.errors[0]?.message ?? "입력 데이터가 올바르지 않습니다.",
        },
        { status: 400 },
      );
    }

    const { signature, idNumber } = parsed.data;

    const serviceClient = createServiceClient();

    // 계약서 조회
    const { data: contract, error: contractError } = await serviceClient
      .from("contracts")
      .select(
        "id, status, customer_name, customer_phone, vehicle_info, selling_price, deposit",
      )
      .eq("token", token)
      .single();

    if (contractError || !contract) {
      return corsResponse(
        { error: "계약서를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    if (contract.status === "signed") {
      return corsResponse(
        { error: "이미 서명 완료된 계약서입니다." },
        { status: 400 },
      );
    }

    // base64 → Uint8Array
    const base64Data = signature.replace(/^data:image\/png;base64,/, "");
    const signatureBytes = Buffer.from(base64Data, "base64");

    // Storage signatures 버킷에 업로드
    const signaturePath = `contracts/${contract.id}/signature.png`;
    const { error: signatureUploadError } = await serviceClient.storage
      .from("signatures")
      .upload(signaturePath, signatureBytes, {
        contentType: "image/png",
        upsert: true,
      });

    if (signatureUploadError) {
      return corsResponse(
        { error: "서명 이미지 저장에 실패했습니다." },
        { status: 500 },
      );
    }

    const { data: signatureUrlData } = await serviceClient.storage
      .from("signatures")
      .createSignedUrl(signaturePath, 86400); // 24시간
    const signatureUrl = signatureUrlData?.signedUrl ?? null;

    // 서버 사이드 PDF 생성 (jsPDF)
    const vehicleInfo = contract.vehicle_info as Record<string, unknown> ?? {};
    let pdfUrl: string | null = null;

    try {
      const { generateContractPDFServer } = await import("@/src/lib/contract-pdf-server");
      const pdfBuffer = await generateContractPDFServer({
        make: (vehicleInfo.make as string) ?? "",
        model: (vehicleInfo.model as string) ?? "",
        year: (vehicleInfo.year as number) ?? 0,
        mileage: (vehicleInfo.mileage as number) ?? 0,
        sellingPrice: contract.selling_price,
        deposit: contract.deposit,
        customerName: contract.customer_name,
        customerPhone: contract.customer_phone,
        plateNumber: (vehicleInfo.plate_number as string) ?? undefined,
        vin: (vehicleInfo.vin as string) ?? undefined,
        color: (vehicleInfo.color as string) ?? undefined,
        customerIdNumber: idNumber,
        signatureImage: signatureBytes.length > 0 ? Buffer.from(signatureBytes) : undefined,
      });

      // Storage 업로드
      const pdfPath = `contracts/${contract.id}/contract.pdf`;
      const { error: pdfUpErr } = await serviceClient.storage
        .from("contracts")
        .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true });

      if (!pdfUpErr) {
        const { data: pdfUrlData } = await serviceClient.storage
          .from("contracts")
          .createSignedUrl(pdfPath, 86400);
        pdfUrl = pdfUrlData?.signedUrl ?? null;
      }
    } catch (pdfErr) {
      console.error("[contract-sign] PDF 생성 실패:", pdfErr instanceof Error ? pdfErr.message : pdfErr);
    }

    console.log("[contract-sign] PDF URL:", pdfUrl ? "생성됨" : "null (실패)");

    // contracts UPDATE
    const { error: updateError } = await serviceClient
      .from("contracts")
      .update({
        status: "signed",
        signed_at: new Date().toISOString(),
        signature_url: signatureUrl,
        pdf_url: pdfUrl,
        ...(idNumber !== undefined && { customer_id_number: idNumber }),
      })
      .eq("id", contract.id);

    if (updateError) {
      return corsResponse(
        { error: "계약서 상태 업데이트에 실패했습니다." },
        { status: 500 },
      );
    }

    // GAS 웹훅 — 딜러/경영진 알림 + 고객 완료 이메일 (fire-and-forget)
    const gasWebhookUrl = process.env.GAS_WEBHOOK_URL;
    console.log("[contract-sign] GAS_WEBHOOK_URL:", gasWebhookUrl ? "설정됨" : "미설정");
    if (gasWebhookUrl) {
      // 딜러/경영진 알림
      fetch(gasWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "contract_signed",
          customerName: contract.customer_name,
          vehicleInfo: contract.vehicle_info,
          contractId: contract.id,
        }),
      }).then(r => console.log("[contract-sign] GAS 딜러알림:", r.status))
        .catch(e => console.error("[contract-sign] GAS 딜러알림 실패:", e.message));

      // 고객에게 완료 이메일
      // customer_email 조회
      const { data: fullContract } = await serviceClient
        .from("contracts")
        .select("customer_email")
        .eq("id", contract.id)
        .single();

      if (fullContract?.customer_email) {
        console.log("[contract-sign] 고객 이메일 발송:", fullContract.customer_email, "pdfUrl:", pdfUrl ? "있음" : "없음");
        fetch(gasWebhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "contract_complete_customer",
            email: fullContract.customer_email,
            customerName: contract.customer_name,
            vehicleInfo: contract.vehicle_info,
            pdfUrl: pdfUrl ?? undefined,
          }),
        }).then(r => console.log("[contract-sign] GAS 고객이메일:", r.status))
          .catch(e => console.error("[contract-sign] GAS 고객이메일 실패:", e.message));
      }
    }

    return corsResponse({ message: "서명이 완료되었습니다." });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "서버 오류가 발생했습니다.";
    return corsResponse(
      { error: msg },
      { status: 500 },
    );
  }
}
