import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";

// ─── CORS ────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

type RouteContext = { params: Promise<{ token: string }> };

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// ─── GET /api/contracts/public-pdf/[token] ────────────────────

/**
 * 고객 완료 이메일용 "영구 유효" 계약서 PDF 다운로드 중계 엔드포인트.
 *
 * 왜 이 엔드포인트가 필요한가:
 *   이전에는 GAS 웹훅이 고객 이메일에 Supabase Storage signed URL 을 직접 박았다.
 *   해당 URL은 24시간 JWT exp 를 가지므로 고객이 메일을 하루 뒤 열면 InvalidJWT 400
 *   을 받아 계약서를 영영 받을 수 없다. 이 엔드포인트가 고객 이메일에 박히는
 *   "영구 링크" 가 되어, 클릭 시점에 fresh 60s signed URL 로 302 리디렉트한다.
 *
 * 보안:
 *   - token 은 contracts.token (엔트로피 충분, 유추 불가) 을 권한 증명으로 사용
 *   - status = 'signed' 인 계약서만 허용 (미서명 계약서는 PDF 자체가 없음)
 *   - 서명 완료된 계약서는 영구 유효 — 서명 전 24시간 만료는 서명 창구용 규칙이므로
 *     이 엔드포인트에는 적용하지 않는다 (대표 결정, 2026-04-23)
 *   - audit_logs 에 익명 access 기록 (actor_id=null)
 *
 * 후속 권고 (범위 밖):
 *   - rate_limits 테이블 연동으로 토큰당 IP/시간 창 내 요청 수 제한
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const { token } = await context.params;

  if (!token) {
    return NextResponse.json(
      { error: "잘못된 요청입니다." },
      { status: 400, headers: CORS_HEADERS },
    );
  }

  const serviceClient = createServiceClient();

  const { data: contract, error: fetchErr } = await serviceClient
    .from("contracts")
    .select("id, status")
    .eq("token", token)
    .maybeSingle();

  if (fetchErr || !contract) {
    return NextResponse.json(
      { error: "계약서를 찾을 수 없습니다." },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  if (contract.status !== "signed") {
    return NextResponse.json(
      { error: "아직 서명이 완료되지 않은 계약서입니다." },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  // 쓰기 경로(sign/[token]/route.ts:222)가 쓰는 결정적 path 규칙을 그대로 재계산.
  // DB 에 저장된 signed URL 은 사용하지 않는다 (만료 가능).
  const pdfPath = `contracts/${contract.id}/contract.pdf`;

  const { data: urlData, error: urlErr } = await serviceClient.storage
    .from("contracts")
    .createSignedUrl(pdfPath, 60);

  if (urlErr || !urlData?.signedUrl) {
    return NextResponse.json(
      { error: "계약서 PDF 파일을 찾을 수 없습니다." },
      { status: 404, headers: CORS_HEADERS },
    );
  }

  // 비차단 access 기록 (실패해도 다운로드는 진행).
  void (async () => {
    try {
      await serviceClient.from("audit_logs").insert({
        actor_id: null,
        action: "contract.public_pdf_access",
        target_type: "contract",
        target_id: contract.id,
        metadata: { token_prefix: token.slice(0, 8) },
      });
    } catch {
      // 감사 로그 실패는 삼킨다
    }
  })();

  return NextResponse.redirect(urlData.signedUrl, { status: 302 });
}
