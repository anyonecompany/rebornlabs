import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, AuthError, getAuthErrorMessage} from "@/lib/auth/verify";

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/contracts/[id]/regenerate-pdf — 서버 사이드 PDF 재생성
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const token = extractToken(request);
    await verifyUser(token);

    const serviceClient = createServiceClient();

    // 계약서 조회
    const { data: contract, error } = await serviceClient
      .from("contracts")
      .select("id, status, customer_name, customer_phone, customer_address, customer_id_number, vehicle_info, selling_price, deposit, signature_url, created_by, contract_type")
      .eq("id", id)
      .single();

    if (error || !contract) {
      return NextResponse.json({ error: "계약서를 찾을 수 없습니다." }, { status: 404 });
    }

    if (contract.status !== "signed") {
      return NextResponse.json({ error: "서명 완료된 계약서만 PDF를 생성할 수 있습니다." }, { status: 400 });
    }

    const vi = (contract.vehicle_info ?? {}) as Record<string, unknown>;

    // 서명 이미지 로드
    let signatureImage: Buffer | undefined;
    if (contract.signature_url) {
      try {
        // signature_url에서 path 추출
        const match = (contract.signature_url as string).match(/\/signatures\/(.+?)(?:\?|$)/);
        if (match?.[1]) {
          const { data } = await serviceClient.storage.from("signatures").download(decodeURIComponent(match[1]));
          if (data) {
            const buf = await data.arrayBuffer();
            signatureImage = Buffer.from(buf);
          }
        }
      } catch {
        // 서명 없이 진행
      }
    }

    // PDF 생성
    const { generateContractPDFServer } = await import("@/src/lib/contract-pdf-server");
    const pdfBuffer = await generateContractPDFServer({
      make: (vi.make as string) ?? "",
      model: (vi.model as string) ?? "",
      year: (vi.year as number) ?? 0,
      mileage: (vi.mileage as number) ?? 0,
      sellingPrice: contract.selling_price,
      deposit: contract.deposit,
      customerName: contract.customer_name,
      customerPhone: contract.customer_phone,
      customerAddress: contract.customer_address ?? undefined,
      plateNumber: (vi.plate_number as string) ?? undefined,
      vin: (vi.vin as string) ?? undefined,
      color: (vi.color as string) ?? undefined,
      customerIdNumber: contract.customer_id_number ?? undefined,
      signatureImage,
      contractType: contract.contract_type ?? "accident",
    });

    // Storage 업로드
    const pdfPath = `contracts/${contract.id}/contract.pdf`;
    const { error: upErr } = await serviceClient.storage
      .from("contracts")
      .upload(pdfPath, pdfBuffer, { contentType: "application/pdf", upsert: true });

    if (upErr) {
      return NextResponse.json({ error: `PDF 저장 실패: ${upErr.message}` }, { status: 500 });
    }

    const { data: urlData } = await serviceClient.storage
      .from("contracts")
      .createSignedUrl(pdfPath, 86400);

    const pdfUrl = urlData?.signedUrl ?? null;

    await serviceClient
      .from("contracts")
      .update({ pdf_url: pdfUrl })
      .eq("id", contract.id);

    // 문서함 자동 연동 — 재생성 PDF를 documents 테이블에 upsert
    if (pdfUrl) {
      const vi2 = (contract.vehicle_info ?? {}) as Record<string, unknown>;
      const model = (vi2.model as string) ?? "";
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const docTitle = `[계약서] ${contract.customer_name} - ${model} (${dateStr})`;

      // 기존 문서가 있으면 URL만 업데이트, 없으면 새로 생성
      const { data: existingDoc } = await serviceClient
        .from("documents")
        .select("id")
        .eq("category", "contract")
        .like("file_name", `[계약서] ${contract.customer_name} - ${model}%`)
        .limit(1)
        .single();

      if (existingDoc) {
        await serviceClient
          .from("documents")
          .update({ file_url: pdfUrl, file_name: docTitle })
          .eq("id", existingDoc.id);
        console.log("[regenerate-pdf] 문서함 업데이트:", docTitle);
      } else {
        await serviceClient
          .from("documents")
          .insert({
            uploaded_by: contract.created_by,
            category: "contract" as const,
            file_name: docTitle,
            file_url: pdfUrl,
          });
        console.log("[regenerate-pdf] 문서함 신규 등록:", docTitle);
      }
    }

    return NextResponse.json({ url: pdfUrl });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.code === "NO_TOKEN" || err.code === "INVALID_TOKEN" ? 401 : 403;
      return NextResponse.json({ error: getAuthErrorMessage(err.code) }, { status });
    }
    console.error("[regenerate-pdf] 오류:", err); return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
