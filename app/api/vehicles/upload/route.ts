import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, requireRole, AuthError } from "@/lib/auth/verify";

// ─── Zod 스키마 ───────────────────────────────────────────────

const UploadUrlSchema = z.object({
  fileName: z.string().min(1, "파일명은 필수입니다."),
  contentType: z
    .string()
    .regex(/^image\/(jpeg|jpg|png|webp|gif)$/, "이미지 파일만 업로드 가능합니다.")
    .optional()
    .default("image/jpeg"),
});

// ─── 헬퍼 ────────────────────────────────────────────────────

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

// ─── POST /api/vehicles/upload — 이미지 업로드 signed URL 생성 ─

/**
 * Supabase Storage signed upload URL 생성 (admin/staff 전용).
 *
 * 클라이언트는 이 URL로 직접 Storage에 PUT 요청하여 업로드한다.
 * 업로드 완료 후 반환된 publicUrl을 vehicles.photos 배열에 추가하면 된다.
 *
 * 버킷명: "vehicle-photos"
 * 경로: "vehicles/{timestamp}_{fileName}"
 */
export async function POST(request: NextRequest) {
  try {
    const token = extractToken(request);
    const user = await verifyUser(token);
    requireRole(user, ["admin", "staff"]);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "요청 데이터 형식이 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const parsed = UploadUrlSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.errors[0]?.message ??
            "입력 데이터가 올바르지 않습니다.",
        },
        { status: 400 },
      );
    }

    const { fileName, contentType } = parsed.data;
    const timestamp = Date.now();
    // 파일명 sanitize: 알파뉴메릭, 점, 하이픈, 언더스코어만 허용
    const sanitizedName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const storagePath = `vehicles/${timestamp}_${sanitizedName}`;
    const BUCKET_NAME = "vehicle-photos";

    const serviceClient = createServiceClient();

    const { data, error } = await serviceClient.storage
      .from(BUCKET_NAME)
      .createSignedUploadUrl(storagePath);

    if (error) {
      return NextResponse.json(
        { error: "업로드 URL 생성에 실패했습니다." },
        { status: 500 },
      );
    }

    // 업로드 후 공개 URL
    const {
      data: { publicUrl },
    } = serviceClient.storage.from(BUCKET_NAME).getPublicUrl(storagePath);

    return NextResponse.json({
      signedUrl: data.signedUrl,
      token: data.token,
      path: storagePath,
      publicUrl,
      contentType,
    });
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
