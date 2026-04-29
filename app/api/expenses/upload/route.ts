import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, requireRole, AuthError, getAuthErrorMessage } from "@/lib/auth/verify";

// ─── 헬퍼: Authorization 헤더에서 토큰 추출 ───────────────────

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

// ─── POST /api/expenses/upload — 증빙 파일 업로드 ─────────────

/**
 * 영수증/증빙 파일 업로드 (admin/staff 전용).
 *
 * - FormData: file
 * - receipts 버킷에 업로드: {user_id}/{timestamp}_{filename}
 * - 응답: { fileUrl: publicUrl }
 */
export async function POST(request: NextRequest) {
  try {
    const token = extractToken(request);
    const user = await verifyUser(token);
    requireRole(user, ["admin", "staff", "director", "team_leader"]);

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "요청 데이터 형식이 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "파일이 없습니다." },
        { status: 400 },
      );
    }

    // 파일 크기 확인 (10MB 제한)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "파일 크기는 10MB 이하여야 합니다." },
        { status: 400 },
      );
    }

    // 파일명 생성: {user_id}/{timestamp}_{filename}
    const timestamp = Date.now();
    const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `${user.id}/${timestamp}_${safeFilename}`;

    const fileBuffer = await file.arrayBuffer();

    const serviceClient = createServiceClient();

    const { error: uploadError } = await serviceClient.storage
      .from("receipts")
      .upload(storagePath, fileBuffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: "파일 업로드에 실패했습니다." },
        { status: 500 },
      );
    }

    // storage path를 반환 — 조회 시점마다 새 signed URL을 발급하므로
    // 만료 문제가 없음. 클라이언트는 fileUrl 대신 storagePath를 expenses에 저장해야 함.
    // 하위 호환: fileUrl은 path 값으로 채워 기존 클라이언트도 동작하도록 유지.
    return NextResponse.json(
      { fileUrl: storagePath, storagePath },
      { status: 200 },
    );
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
