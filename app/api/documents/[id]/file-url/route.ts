import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, AuthError } from "@/lib/auth/verify";

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/documents/[id]/file-url — 문서 다운로드용 단기 signed URL.
 *
 * 계약서(e610b02)와 동일한 패턴: documents.file_url 에 저장된 signed URL 은
 * JWT exp 로 만료되지만, 요청 시점마다 새 URL을 발급해 JSON으로 응답한다.
 *
 * 계약서와의 차이:
 *   계약서는 contract.id 로 storage path 가 결정적이었지만, documents 는
 *   업로드 시점의 `${category}/${timestamp}_${safeFilename}` 로 path가 정해져
 *   DB 행에 파일명 컬럼이 따로 없다. 따라서 기존 file_url(만료돼도 포맷은 유지)을
 *   정규식으로 파싱해 storage path 를 복원한 뒤 재발급한다.
 *
 * 저장 URL 포맷 (documents/route.ts:207):
 *   .../storage/v1/object/sign/documents/{category}/{timestamp}_{filename}?token=...
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const token = extractToken(request);
    await verifyUser(token);

    const serviceClient = createServiceClient();

    const { data: doc, error } = await serviceClient
      .from("documents")
      .select("id, file_url")
      .eq("id", id)
      .maybeSingle();

    if (error || !doc) {
      return NextResponse.json(
        { error: "문서를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    // file_url 에서 documents 버킷 내부 path 추출.
    // sign/public 두 포맷 모두 허용 (운영 중 혼재 가능성 방어).
    const match =
      doc.file_url?.match(/\/object\/(?:sign|public)\/documents\/([^?]+)/) ??
      null;
    const storagePath = match?.[1] ? decodeURIComponent(match[1]) : null;

    if (!storagePath) {
      return NextResponse.json(
        { error: "문서 저장 경로를 확인할 수 없습니다." },
        { status: 500 },
      );
    }

    const { data: urlData, error: urlErr } = await serviceClient.storage
      .from("documents")
      .createSignedUrl(storagePath, 300);

    if (urlErr || !urlData?.signedUrl) {
      return NextResponse.json(
        { error: "파일이 스토리지에 존재하지 않습니다." },
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
