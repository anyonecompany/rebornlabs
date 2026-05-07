import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, requireRole, AuthError, getAuthErrorMessage } from "@/lib/auth/verify";
// admin-only DELETE — `users:write` 와 동일하게 admin only이므로 매핑

// ─── 헬퍼: Authorization 헤더에서 토큰 추출 ───────────────────

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

// ─── DELETE /api/documents/[id] — 문서 삭제 ──────────────────

/**
 * 공통 문서 삭제 (admin 전용).
 *
 * - admin만 삭제 가능
 * - 테이블에서 DELETE + 스토리지에서 파일 삭제
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const token = extractToken(request);
    const user = await verifyUser(token);
    requireRole(user, ["admin"]);

    const { id } = await params;

    const serviceClient = createServiceClient();

    // 존재 여부 및 file_url 확인
    const { data: existing, error: fetchError } = await serviceClient
      .from("documents")
      .select("id, file_url, category")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: "문서를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    // 스토리지 경로 추출: URL에서 버킷명 + 내부 path 파싱.
    // documents 테이블은 다중 버킷(documents/contracts/…)을 저장하므로 버킷 하드코딩 금지.
    // sign/public 두 포맷 모두 허용.
    const storagePathMatch = existing.file_url.match(
      /\/object\/(?:sign|public)\/([^/]+)\/(.+?)(?:\?|$)/,
    );
    const storageBucket = storagePathMatch?.[1] ?? null;
    const storagePath = storagePathMatch?.[2]
      ? decodeURIComponent(storagePathMatch[2])
      : null;

    // 테이블에서 삭제
    const { error: deleteError } = await serviceClient
      .from("documents")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return NextResponse.json(
        { error: "문서 삭제에 실패했습니다." },
        { status: 500 },
      );
    }

    // 스토리지 파일 삭제 (실패해도 응답은 200 — 고아 파일은 추후 정리).
    // 버킷은 file_url 에서 추출한 값 사용 (documents/contracts 등 다중 버킷 지원).
    if (storageBucket && storagePath) {
      await serviceClient.storage
        .from(storageBucket)
        .remove([storagePath]);
    }

    return NextResponse.json({ success: true }, { status: 200 });
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
