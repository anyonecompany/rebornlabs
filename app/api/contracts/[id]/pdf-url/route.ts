import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, AuthError } from "@/lib/auth/verify";

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/contracts/[id]/pdf-url — 계약서 PDF 다운로드용 단기 signed URL.
 *
 * Supabase Storage signed URL은 JWT exp로 만료되는데, 과거에는 만료 URL을
 * contracts.pdf_url 컬럼에 영구 저장해 재사용하려다 실패했다.
 * 이 엔드포인트는 요청 시점마다 60초짜리 새 URL을 발급해 JSON으로 응답한다.
 * 클라이언트는 받자마자 window.open 으로 즉시 다운로드한다.
 *
 * Storage 경로 규칙(sign/[token]/route.ts 및 regenerate-pdf/route.ts 참조):
 *   bucket = "contracts"
 *   path   = `contracts/${contract.id}/contract.pdf`
 * contract.id 만으로 path를 재계산할 수 있어 기존 pdf_url 파싱이 불필요하다
 * (만료된 URL 혹은 NULL 인 레코드도 이 엔드포인트로 새 URL을 받을 수 있다).
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const token = extractToken(request);
    await verifyUser(token);

    const serviceClient = createServiceClient();

    const { data: contract, error } = await serviceClient
      .from("contracts")
      .select("id, status")
      .eq("id", id)
      .maybeSingle();

    if (error || !contract) {
      return NextResponse.json(
        { error: "계약서를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    const pdfPath = `contracts/${contract.id}/contract.pdf`;

    const { data: urlData, error: urlErr } = await serviceClient.storage
      .from("contracts")
      .createSignedUrl(pdfPath, 60);

    if (urlErr || !urlData?.signedUrl) {
      // 파일이 아직 Storage에 없는 경우 (서명 전 등)
      return NextResponse.json(
        {
          error:
            "계약서 PDF가 아직 생성되지 않았습니다. PDF 재생성을 먼저 실행해주세요.",
        },
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
