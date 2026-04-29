import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, AuthError } from "@/lib/auth/verify";

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/contracts/[id]/signature-url — 서명 이미지 단기 signed URL.
 *
 * 동기 부여는 pdf-url 과 동일: contracts.signature_url 에 저장된 signed URL 이
 * 24시간 뒤 JWT exp 로 만료되면서 <img> 가 403/InvalidJWT 로 깨지는 현상을 해결.
 *
 * Storage 경로 규칙(sign/[token]/route.ts:178 참조):
 *   bucket = "signatures"
 *   path   = `contracts/${contract.id}/signature.png`
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const token = extractToken(request);
    const user = await verifyUser(token);

    const serviceClient = createServiceClient();

    const { data: contract, error } = await serviceClient
      .from("contracts")
      .select("id, sale_id")
      .eq("id", id)
      .maybeSingle();

    if (error || !contract) {
      return NextResponse.json(
        { error: "계약서를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    // 인가 검증 — dealer: 본인 판매 건만 허용
    if (user.role === "dealer") {
      const { data: sale, error: saleError } = await serviceClient
        .from("sales")
        .select("dealer_id")
        .eq("id", contract.sale_id)
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

    const signaturePath = `contracts/${contract.id}/signature.png`;

    const { data: urlData, error: urlErr } = await serviceClient.storage
      .from("signatures")
      .createSignedUrl(signaturePath, 300);

    if (urlErr || !urlData?.signedUrl) {
      return NextResponse.json(
        { error: "서명 이미지가 아직 생성되지 않았습니다." },
        { status: 404 },
      );
    }

    return NextResponse.json({ url: urlData.signedUrl });
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
