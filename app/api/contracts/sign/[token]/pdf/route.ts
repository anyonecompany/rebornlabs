import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ token: string }> };

/**
 * POST /api/contracts/sign/[token]/pdf — 서명 완료 후 PDF 업로드 (공개)
 * 클라이언트에서 생성한 PDF를 Storage에 저장하고 contracts.pdf_url 업데이트.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;
    const serviceClient = createServiceClient();

    // token으로 계약서 조회
    const { data: contract, error } = await serviceClient
      .from("contracts")
      .select("id, status")
      .eq("token", token)
      .single();

    if (error || !contract) {
      return NextResponse.json({ error: "계약서를 찾을 수 없습니다." }, { status: 404 });
    }

    if (contract.status !== "signed") {
      return NextResponse.json({ error: "서명 완료된 계약서만 PDF를 업로드할 수 있습니다." }, { status: 400 });
    }

    // FormData에서 PDF 추출
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: "FormData 형식이 올바르지 않습니다." }, { status: 400 });
    }

    const pdfFile = formData.get("pdf");
    if (!pdfFile || !(pdfFile instanceof Blob)) {
      return NextResponse.json({ error: "PDF 파일이 필요합니다." }, { status: 400 });
    }

    // Storage 업로드
    const pdfPath = `contracts/${contract.id}/contract.pdf`;
    const buffer = await pdfFile.arrayBuffer();

    const { error: uploadError } = await serviceClient.storage
      .from("contracts")
      .upload(pdfPath, new Uint8Array(buffer), {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ error: "PDF 저장에 실패했습니다." }, { status: 500 });
    }

    // signed URL 생성 + DB 업데이트
    const { data: urlData } = await serviceClient.storage
      .from("contracts")
      .createSignedUrl(pdfPath, 86400);

    await serviceClient
      .from("contracts")
      .update({ pdf_url: urlData?.signedUrl ?? null })
      .eq("id", contract.id);

    return NextResponse.json({ url: urlData?.signedUrl ?? "" });
  } catch {
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
