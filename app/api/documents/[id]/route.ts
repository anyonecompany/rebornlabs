import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, requireRole, AuthError, getAuthErrorMessage} from "@/lib/auth/verify";

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

    // Storage 파일 먼저 삭제 — 실패 시 DB는 건드리지 않아 재시도 가능.
    // 버킷은 file_url 에서 추출한 값 사용 (documents/contracts 등 다중 버킷 지원).
    if (storageBucket && storagePath) {
      const { error: storageError } = await serviceClient.storage
        .from(storageBucket)
        .remove([storagePath]);

      if (storageError) {
        console.error("[documents DELETE] Storage 삭제 실패:", storageError);
        return NextResponse.json(
          { error: "파일 삭제에 실패했습니다. 다시 시도해 주세요." },
          { status: 500 },
        );
      }
    }

    // Storage 삭제 성공 후 DB row 삭제.
    // 이 시점에서 Storage는 이미 삭제되었으므로 실패 시 orphan DB row가 남을 수 있음.
    // orphan DB row는 운영자가 수동 처리 (Storage 없는 row는 기능적으로 무해).
    const { error: deleteError } = await serviceClient
      .from("documents")
      .delete()
      .eq("id", id);

    if (deleteError) {
      console.error("[documents DELETE] DB 삭제 실패 (Storage는 이미 삭제됨):", deleteError);
      return NextResponse.json(
        { error: "문서 삭제에 실패했습니다." },
        { status: 500 },
      );
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
