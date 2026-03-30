import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, AuthError } from "@/lib/auth/verify";

// ─── 헬퍼 ────────────────────────────────────────────────────

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

type RouteContext = { params: Promise<{ id: string }> };

/** 허용 MIME 타입 */
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

/** 파일 크기 제한: 20MB */
const MAX_FILE_SIZE = 20 * 1024 * 1024;

// ─── POST /api/sales/[id]/contracts — 계약서 업로드 ──────────

/**
 * 계약서 파일(PDF/이미지) 업로드.
 *
 * - 인증 필수
 * - dealer: 본인 판매 건만, admin/staff: 모든 건
 * - FormData "file" 필드에 파일 수신
 * - contracts 버킷: {sale_id}/{timestamp}_{filename}
 * - 허용 타입: PDF, JPEG, PNG, WebP
 * - 최대 크기: 20MB
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: saleId } = await context.params;
    const token = extractToken(request);
    const user = await verifyUser(token);

    const serviceClient = createServiceClient();

    // 판매 존재 및 권한 확인
    const { data: sale, error: saleError } = await serviceClient
      .from("sales")
      .select("id, dealer_id, cancelled_at")
      .eq("id", saleId)
      .single();

    if (saleError || !sale) {
      return NextResponse.json(
        { error: "판매 정보를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    // dealer: 본인 건만
    if (user.role === "dealer" && sale.dealer_id !== user.id) {
      return NextResponse.json(
        { error: "접근 권한이 없습니다." },
        { status: 403 },
      );
    }

    // 취소된 판매에는 계약서 업로드 불가
    if (sale.cancelled_at !== null) {
      return NextResponse.json(
        { error: "취소된 판매에는 계약서를 업로드할 수 없습니다." },
        { status: 400 },
      );
    }

    // FormData 파싱
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
    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "계약서 파일(file)이 필요합니다." },
        { status: 400 },
      );
    }

    // 파일 크기 확인
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "파일 크기는 20MB를 초과할 수 없습니다." },
        { status: 400 },
      );
    }

    // 파일 타입 확인
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "PDF, JPEG, PNG, WebP 형식의 파일만 업로드 가능합니다." },
        { status: 400 },
      );
    }

    // 파일명 생성: {timestamp}_{원본파일명}
    const timestamp = Date.now();
    const safeFileName = file.name.replace(/[^a-zA-Z0-9._\-가-힣]/g, "_");
    const storagePath = `${saleId}/${timestamp}_${safeFileName}`;

    // Storage 업로드
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await serviceClient.storage
      .from("contracts")
      .upload(storagePath, uint8Array, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: "계약서 업로드에 실패했습니다." },
        { status: 500 },
      );
    }

    const { data: urlData } = serviceClient.storage
      .from("contracts")
      .getPublicUrl(storagePath);

    return NextResponse.json({
      fileUrl: urlData.publicUrl,
      fileName: file.name,
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
