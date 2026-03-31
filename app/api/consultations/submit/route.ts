import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";

// ─── Zod 스키마 ───────────────────────────────────────────────

const SubmitSchema = z.object({
  name: z.string().min(1, "이름은 필수입니다.").max(50, "이름은 50자 이하여야 합니다."),
  phone: z.string().min(1, "전화번호는 필수입니다.").max(20, "전화번호는 20자 이하여야 합니다."),
  vehicle: z.string().optional(),
  message: z.string().max(1000, "메시지는 1000자 이하여야 합니다.").optional(),
  ref: z.string().optional(),
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

  const { name, phone, vehicle, message, ref, website } = parsed.data;

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

  // 5-1. ref → 마케팅업체 자동 매칭
  if (ref && consultationId) {
    const decoded = decodeURIComponent(ref);
    const { data: mc } = await serviceClient
      .from("marketing_companies")
      .select("name")
      .eq("name", decoded)
      .eq("is_active", true)
      .single();

    if (mc) {
      await serviceClient
        .from("consultations")
        .update({ marketing_company: mc.name })
        .eq("id", consultationId);
    }
  }

  // 6. GAS 병렬 호출 (fire-and-forget)
  const gasUrl = process.env.GAS_WEBHOOK_URL;
  if (gasUrl) {
    fetch(gasUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, vehicle, message, ref }),
    }).catch(() => {});
  }

  return corsJson({ message: "상담 접수가 완료되었습니다." });
}
