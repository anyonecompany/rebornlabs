import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, AuthError, getAuthErrorMessage} from "@/lib/auth/verify";

// ─── 헬퍼 ────────────────────────────────────────────────────

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

type RouteContext = { params: Promise<{ id: string }> };

// ─── POST /api/sales/[id]/signature — 전자서명 업로드 ─────────

/**
 * 전자서명 이미지(PNG) 업로드.
 *
 * - 인증 필수
 * - dealer: 본인 판매 건만, admin/staff: 모든 건
 * - 재서명 차단: 이미 signature.png가 있으면 400
 * - Supabase Storage signatures 버킷: {sale_id}/signature.png
 * - FormData로 "signature" 필드에 PNG Blob 수신
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

    // 취소된 판매에는 서명 불가
    if (sale.cancelled_at !== null) {
      return NextResponse.json(
        { error: "취소된 판매에는 서명할 수 없습니다." },
        { status: 400 },
      );
    }

    // 재서명 차단: 이미 서명 파일이 있으면 400
    const { data: existingFiles } = await serviceClient.storage
      .from("signatures")
      .list(saleId);

    const alreadySigned =
      (existingFiles ?? []).some((f) => f.name === "signature.png");
    if (alreadySigned) {
      return NextResponse.json(
        { error: "이미 서명이 완료되었습니다." },
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

    const signatureBlob = formData.get("signature");
    if (!signatureBlob || !(signatureBlob instanceof Blob)) {
      return NextResponse.json(
        { error: "서명 이미지(signature)가 필요합니다." },
        { status: 400 },
      );
    }

    // PNG 여부 확인
    if (
      signatureBlob.type !== "image/png" &&
      signatureBlob.type !== "application/octet-stream"
    ) {
      return NextResponse.json(
        { error: "서명 이미지는 PNG 형식이어야 합니다." },
        { status: 400 },
      );
    }

    // Storage 업로드
    const arrayBuffer = await signatureBlob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await serviceClient.storage
      .from("signatures")
      .upload(`${saleId}/signature.png`, uint8Array, {
        contentType: "image/png",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: "서명 업로드에 실패했습니다." },
        { status: 500 },
      );
    }

    const { data: urlData } = await serviceClient.storage
      .from("signatures")
      .createSignedUrl(`${saleId}/signature.png`, 3600);

    return NextResponse.json({ signatureUrl: urlData?.signedUrl ?? null });
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
