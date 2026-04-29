import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, requireRole, AuthError, getAuthErrorMessage } from "@/lib/auth/verify";

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

/**
 * POST /api/vehicles/upload — 차량 이미지 직접 업로드
 *
 * FormData로 file 수신 → service_role로 Storage vehicles 버킷에 업로드
 * RLS 우회하여 admin/staff만 업로드 가능
 */
export async function POST(request: NextRequest) {
  try {
    const token = extractToken(request);
    const user = await verifyUser(token);
    requireRole(user, ["admin", "staff"]);

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { error: "FormData 형식이 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const file = formData.get("file");
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "이미지 파일(file)이 필요합니다." }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "이미지는 5MB 이하여야 합니다." }, { status: 400 });
    }

    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    const storagePath = `temp/${timestamp}_${random}.webp`;

    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const serviceClient = createServiceClient();

    const { error: uploadError } = await serviceClient.storage
      .from("vehicles")
      .upload(storagePath, uint8Array, {
        contentType: "image/webp",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: "파일 업로드에 실패했습니다." },
        { status: 500 },
      );
    }

    // public URL 반환 (vehicles 버킷은 public — 만료 없음)
    const { data: urlData } = serviceClient.storage
      .from("vehicles")
      .getPublicUrl(storagePath);

    return NextResponse.json({
      url: urlData.publicUrl,
      path: storagePath,
    });
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
