import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import { resolveCompanyName } from "@/src/lib/source-ref";
import { voidGasWebhook } from "@/src/lib/gas-webhook";

// ─── Zod 스키마 ───────────────────────────────────────────────

const SubmitSchema = z.object({
  name: z.string().min(1, "이름은 필수입니다.").max(50, "이름은 50자 이하여야 합니다."),
  phone: z.string().min(1, "전화번호는 필수입니다.").max(20, "전화번호는 20자 이하여야 합니다."),
  vehicle: z.string().optional(),
  message: z.string().max(1000, "메시지는 1000자 이하여야 합니다.").optional(),
  ref: z.string().optional(),
  // 보증금/월납입료 (만원 단위). /apply 폼에서 선택 입력.
  available_deposit: z.number().int().nonnegative().max(999_999).optional(),
  desired_monthly_payment: z.number().int().nonnegative().max(999_999).optional(),
  // UTM 추가 필드. utm_source는 `ref` 로 이미 받음. (20260422_apply_utm.sql)
  utm_medium: z.string().max(100).optional(),
  utm_campaign: z.string().max(100).optional(),
  utm_content: z.string().max(200).optional(),
  website: z.string().optional(), // honeypot 필드
});

// ─── CAPTCHA 검증 stub ─────────────────────────────────────

async function validateCaptcha(_token?: string): Promise<boolean> {
  // TODO: CAPTCHA 제공업체 연동 (예: hCaptcha, Turnstile)
  return true;
}

// ─── CORS ──────────────────────────────────────────────────

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function corsJson(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, { ...init, headers: CORS });
}

/** OPTIONS preflight */
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

// ─── POST /api/consultations/submit — 상담 접수 (공개 API) ───

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return corsJson({ error: "요청 데이터 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const parsed = SubmitSchema.safeParse(body);
  if (!parsed.success) {
    return corsJson(
      { error: parsed.error.errors[0]?.message ?? "입력 데이터가 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const {
    name,
    phone,
    vehicle,
    message,
    ref,
    available_deposit,
    desired_monthly_payment,
    utm_medium,
    utm_campaign,
    utm_content,
    website,
  } = parsed.data;

  // 1. honeypot
  if (website && website.trim() !== "") {
    return corsJson({ message: "상담 접수가 완료되었습니다." });
  }

  // 2. IP 추출
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "0.0.0.0";

  const serviceClient = createServiceClient();

  // 3. IP rate limit
  const { count, error: rateError } = await serviceClient
    .from("rate_limits")
    .select("*", { count: "exact", head: true })
    .eq("ip_address", ip)
    .eq("endpoint", "consultation_submit")
    .gte("requested_at", new Date(Date.now() - 60 * 1000).toISOString());

  if (rateError) {
    return corsJson({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }

  if ((count ?? 0) >= 5) {
    return corsJson({ error: "너무 많은 요청입니다. 잠시 후 다시 시도해주세요." }, { status: 429 });
  }

  await serviceClient.from("rate_limits").insert({
    ip_address: ip,
    endpoint: "consultation_submit",
    requested_at: new Date().toISOString(),
  });

  // 4. CAPTCHA stub
  const captchaValid = await validateCaptcha();
  if (!captchaValid) {
    return corsJson({ error: "CAPTCHA 검증에 실패했습니다." }, { status: 400 });
  }

  // 5. DB 저장
  const { data: consultationId, error: insertError } = await serviceClient.rpc(
    "insert_consultation_from_gas",
    {
      p_customer_name: name,
      p_phone: phone,
      p_interested_vehicle: vehicle ?? null,
      p_message: message ?? null,
      p_source_ref: ref ?? "direct",
    },
  );

  if (insertError) {
    return corsJson({ error: "상담 접수 중 오류가 발생했습니다." }, { status: 500 });
  }

  // 5-a. 보증금/월납입료 + UTM 추가 필드 — RPC가 받지 않으므로 UPDATE로 별도 저장
  if (consultationId) {
    const patch: Record<string, string | number> = {};
    if (available_deposit !== undefined) patch.available_deposit = available_deposit;
    if (desired_monthly_payment !== undefined) {
      patch.desired_monthly_payment = desired_monthly_payment;
    }
    if (utm_medium) patch.utm_medium = utm_medium;
    if (utm_campaign) patch.utm_campaign = utm_campaign;
    if (utm_content) patch.utm_content = utm_content;

    if (Object.keys(patch).length > 0) {
      await serviceClient
        .from("consultations")
        .update(patch)
        .eq("id", consultationId);
    }
  }

  // 5-1. ref → 마케팅업체 자동 매칭
  // source_ref 별칭(예: 'ig' → '인스타그램')을 resolveCompanyName으로 변환 후 조회.
  // 별칭 매핑에 없으면 원본 값으로 기존 업체명 직접 매칭.
  if (ref && consultationId) {
    const decoded = decodeURIComponent(ref);
    const companyName = resolveCompanyName(decoded);
    const { data: mc } = await serviceClient
      .from("marketing_companies")
      .select("name")
      .eq("name", companyName)
      .eq("is_active", true)
      .single();

    if (mc) {
      await serviceClient
        .from("consultations")
        .update({ marketing_company: mc.name })
        .eq("id", consultationId);
    }
  }

  // 6. GAS 병렬 호출 (fire-and-forget, Bearer 인증 + 5s 타임아웃)
  voidGasWebhook(
    { name, phone, vehicle, message, ref },
    { label: "consultations/submit" },
  );

  return corsJson({ message: "상담 접수가 완료되었습니다." });
}
