import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, AuthError, getAuthErrorMessage} from "@/lib/auth/verify";

// ─── 헬퍼 ────────────────────────────────────────────────────

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

type RouteContext = { params: Promise<{ id: string }> };

/** 최대 파일 크기: 10MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// ─── POST /api/sales/[id]/contract-pdf — 계약서 PDF Storage 저장 ──

/**
 * 생성된 계약서 PDF를 contracts 버킷에 저장한다.
 *
 * - 인증 필수
 * - dealer: 본인 판매 건만, admin/staff: 모든 건
 * - FormData "pdf" 필드에 PDF Blob 수신
 * - contracts 버킷: {sale_id}/contract.pdf (기존 파일 덮어쓰기)
 * - 성공: { url: publicUrl }
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

    // 취소된 판매에는 계약서 생성 불가
    if (sale.cancelled_at !== null) {
      return NextResponse.json(
        { error: "취소된 판매에는 계약서를 생성할 수 없습니다." },
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

    const pdfBlob = formData.get("pdf");
    if (!pdfBlob || !(pdfBlob instanceof Blob)) {
      return NextResponse.json(
        { error: "PDF 파일(pdf)이 필요합니다." },
        { status: 400 },
      );
    }

    // 파일 크기 확인
    if (pdfBlob.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "파일 크기는 10MB를 초과할 수 없습니다." },
        { status: 400 },
      );
    }

    // Storage 업로드 ({sale_id}/contract.pdf, upsert=true로 덮어쓰기)
    const storagePath = `${saleId}/contract.pdf`;
    const arrayBuffer = await pdfBlob.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const { error: uploadError } = await serviceClient.storage
      .from("contracts")
      .upload(storagePath, uint8Array, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: "계약서 PDF 저장에 실패했습니다." },
        { status: 500 },
      );
    }

    const { data: urlData } = await serviceClient.storage
      .from("contracts")
      .createSignedUrl(storagePath, 3600);

    return NextResponse.json({ url: urlData?.signedUrl ?? "" });
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
