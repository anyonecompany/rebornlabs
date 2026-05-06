import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyTurnstile } from "@/src/lib/captcha";
import { isRefCode, resolveCompanyName } from "@/src/lib/source-ref";
import { voidGasWebhook } from "@/src/lib/gas-webhook";
import { sendAlimtalk } from "@/lib/alimtalk/send";
import { maskCustomerName } from "@/lib/alimtalk/templates";

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
  // Cloudflare Turnstile CAPTCHA 토큰 (클라이언트 위젯이 삽입, 후속 PR)
  captchaToken: z.string().optional(),
});

// ─── CORS 헬퍼 ────────────────────────────────────────────────

/**
 * 허용 Origin 목록.
 * ALLOWED_ORIGINS 환경변수(콤마 구분)가 없으면 NEXT_PUBLIC_APP_URL 단일 도메인으로 폴백.
 * 둘 다 미설정이면 same-origin만 허용 (헤더 없음).
 */
function getAllowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  return raw
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

function buildCorsHeaders(requestOrigin: string | null): Record<string, string> {
  const allowed = getAllowedOrigins();
  // 화이트리스트 매칭 시 해당 origin echo, 그 외/미설정 시 * 로 폴백 (공개 API).
  // 후속: ALLOWED_ORIGINS 환경변수 설정 시 자동으로 화이트리스트만 허용으로 전환.
  const origin =
    requestOrigin && allowed.length > 0 && allowed.includes(requestOrigin)
      ? requestOrigin
      : "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function corsJson(body: unknown, request: NextRequest, init?: { status?: number }) {
  const corsHeaders = buildCorsHeaders(request.headers.get("origin"));
  return NextResponse.json(body, { ...init, headers: corsHeaders });
}

/** OPTIONS preflight */
export function OPTIONS(request: NextRequest) {
  const corsHeaders = buildCorsHeaders(request.headers.get("origin"));
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// ─── POST /api/consultations/submit — 상담 접수 (공개 API) ───

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return corsJson({ error: "요청 데이터 형식이 올바르지 않습니다." }, request, { status: 400 });
  }

  const parsed = SubmitSchema.safeParse(body);
  if (!parsed.success) {
    return corsJson(
      { error: parsed.error.errors[0]?.message ?? "입력 데이터가 올바르지 않습니다." },
      request,
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
    captchaToken,
  } = parsed.data;

  // 1. honeypot
  if (website && website.trim() !== "") {
    return corsJson({ message: "상담 접수가 완료되었습니다." }, request);
  }

  // 2. IP 추출
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "0.0.0.0";

  // 3. CAPTCHA 검증 (Cloudflare Turnstile)
  const captchaValid = await verifyTurnstile(captchaToken, ip);
  if (!captchaValid) {
    return corsJson({ error: "CAPTCHA 검증에 실패했습니다." }, request, { status: 400 });
  }

  const serviceClient = createServiceClient();

  // 4. IP rate limit
  const { count, error: rateError } = await serviceClient
    .from("rate_limits")
    .select("*", { count: "exact", head: true })
    .eq("ip_address", ip)
    .eq("endpoint", "consultation_submit")
    .gte("requested_at", new Date(Date.now() - 60 * 1000).toISOString());

  if (rateError) {
    return corsJson({ error: "서버 오류가 발생했습니다." }, request, { status: 500 });
  }

  if ((count ?? 0) >= 5) {
    return corsJson({ error: "너무 많은 요청입니다. 잠시 후 다시 시도해주세요." }, request, { status: 429 });
  }

  await serviceClient.from("rate_limits").insert({
    ip_address: ip,
    endpoint: "consultation_submit",
    requested_at: new Date().toISOString(),
  });

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
    // 중복 차단 트리거(block_recent_duplicate_consultations) — 23505 + HINT 'duplicate_recent_consultation'
    // 사용자에게는 200 류로 위장하지 않고 409 로 명확히 알림.
    const isDuplicate =
      insertError.code === "23505" ||
      insertError.message?.includes("duplicate_recent_consultation") ||
      insertError.message?.includes("중복 상담 차단");
    if (isDuplicate) {
      return corsJson(
        { error: "이미 신청이 접수되었습니다. 곧 담당자가 연락드릴 예정입니다." },
        request,
        { status: 409 },
      );
    }
    return corsJson({ error: "상담 접수 중 오류가 발생했습니다." }, request, { status: 500 });
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
  // 우선순위:
  //   1) ref 가 6자 영숫자(/^[a-f0-9]{6}$/)면 marketing_companies.ref_code 로 조회 (신규 표준)
  //   2) 그 외에는 별칭(SOURCE_REF_TO_COMPANY: ig→인스타그램 등) 또는 원본명으로 marketing_companies.name 직접 매칭 (기존 한글 ref 호환)
  // 어느 경로든 실패하면 marketing_company 미기록 (consultations.source_ref 원본은 이미 저장됨).
  if (ref && consultationId) {
    const decoded = decodeURIComponent(ref);
    let matchedName: string | null = null;

    if (isRefCode(decoded)) {
      const { data: mc } = await serviceClient
        .from("marketing_companies")
        .select("name")
        .eq("ref_code", decoded.toLowerCase())
        .eq("is_active", true)
        .maybeSingle();
      matchedName = mc?.name ?? null;
    }

    if (!matchedName) {
      const companyName = resolveCompanyName(decoded);
      const { data: mc } = await serviceClient
        .from("marketing_companies")
        .select("name")
        .eq("name", companyName)
        .eq("is_active", true)
        .maybeSingle();
      matchedName = mc?.name ?? null;
    }

    if (matchedName) {
      await serviceClient
        .from("consultations")
        .update({ marketing_company: matchedName })
        .eq("id", consultationId);
    }
  }

  // 6. GAS 병렬 호출 (fire-and-forget, Bearer 인증 + 5s 타임아웃)
  voidGasWebhook(
    { name, phone, vehicle, message, ref },
    { label: "consultations/submit" },
  );

  // 7. 운영자 알림톡 (fire-and-forget) — GAS 의존 격하의 영구 fix.
  //    ADMIN_PHONE_NUMBERS 미설정 시 전체 스킵.
  //    알리고 사전심사 미완료여도 failover=Y 로 SMS 자동 대체 발송.
  notifyAdminsAsync({
    consultationId: consultationId as string | null,
    customerName: name,
    vehicle: vehicle ?? null,
    serviceClient,
  });

  return corsJson({ message: "상담 접수가 완료되었습니다." }, request);
}

/**
 * 운영자(들)에게 신규 상담 알림톡 발송. fire-and-forget.
 * 폼 제출 직후 그 상담의 정보(고객명/차량)를 즉시 발송 → 박우빈 같은 응대 누락 차단.
 * ADMIN_PHONE_NUMBERS 콤마 구분 다수 지정 가능. 미설정 시 silent skip.
 */
function notifyAdminsAsync(input: {
  consultationId: string | null;
  customerName: string;
  vehicle: string | null;
  serviceClient: ReturnType<typeof createServiceClient>;
}): void {
  const raw = process.env.ADMIN_PHONE_NUMBERS ?? process.env.ADMIN_PHONE_NUMBER ?? "";
  const phones = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (phones.length === 0) return;

  const adminLink = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://rebornlabs-admin.vercel.app"}/consultations`;
  const masked = maskCustomerName(input.customerName);
  const vehicleText = input.vehicle?.trim() || "관심 차량 미지정";

  void (async () => {
    // SMS 폴백 본문 — 90자 이내 LMS 변환 회피. 사전심사 통과 전까지 이걸로 발송됨.
    const fmessage = `[리본랩스] ${masked}님 ${vehicleText} 상담 접수. 응대 ${adminLink}`;

    await Promise.all(
      phones.map((to) =>
        sendAlimtalk({
          template: "consultation.new_to_admin",
          to,
          variables: {
            "#{customer_name}": masked,
            "#{vehicle}": vehicleText,
            "#{admin_link}": adminLink,
          },
          fmessage,
          auditContext: {
            consultation_id: input.consultationId,
            customer_name_masked: masked,
          },
        }, input.serviceClient),
      ),
    );
  })();
}
