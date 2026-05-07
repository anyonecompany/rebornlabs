import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, AuthError, getAuthErrorMessage } from "@/lib/auth/verify";
import { dataScope } from "@/lib/auth/capabilities";
import { fetchSubordinateIds } from "@/lib/auth/subordinate";

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
    const user = await verifyUser(token);

    const serviceClient = createServiceClient();

    // 계약서 조회
    const { data: contract, error } = await serviceClient
      .from("contracts")
      .select("id, sale_id, status, customer_name, customer_phone, customer_address, customer_id_number, vehicle_info, selling_price, deposit, signature_url, created_by, contract_type")
      .eq("id", id)
      .single();

    if (error || !contract) {
      return NextResponse.json({ error: "계약서를 찾을 수 없습니다." }, { status: 404 });
    }

    // 역할별 단건 권한 — capabilities.ts SSOT
    const scope = dataScope(user.role, "contracts");
    if (scope === "none") {
      return NextResponse.json({ error: "접근 권한이 없습니다." }, { status: 403 });
    }
    if (scope !== "all") {
      const { data: sale, error: saleError } = await serviceClient
        .from("sales")
        .select("dealer_id")
        .eq("id", contract.sale_id)
        .single();

      if (saleError || !sale) {
        return NextResponse.json({ error: "판매 정보를 찾을 수 없습니다." }, { status: 404 });
      }

      if (scope === "self" && sale.dealer_id !== user.id) {
        return NextResponse.json({ error: "접근 권한이 없습니다." }, { status: 403 });
      }
      if (scope === "subordinate") {
        const subordinateIds = await fetchSubordinateIds(serviceClient, user.id);
        if (!subordinateIds.includes(sale.dealer_id)) {
          return NextResponse.json({ error: "접근 권한이 없습니다." }, { status: 403 });
        }
      }
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
      console.error("[contracts/regenerate-pdf] Storage 업로드 실패:", upErr.message);
      return NextResponse.json({ error: "PDF 저장 중 오류가 발생했습니다." }, { status: 500 });
    }

    // DB에는 storage path만 저장. 조회 시점마다 새 signed URL을 발급하여 만료 문제를 방지.
    // upErr는 위에서 early return 처리됨 — 이 시점에서 업로드는 반드시 성공.
    const pdfUrl: string = pdfPath;

    // 클라이언트에게는 즉시 사용 가능한 단기 signed URL 발급 (DB 저장값과 별개)
    const { data: freshUrlData } = await serviceClient.storage
      .from("contracts")
      .createSignedUrl(pdfPath, 3600); // 1시간 — 화면에서 즉시 열기용
    const freshPdfUrl = freshUrlData?.signedUrl ?? null;

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
        .eq("category", "contract_template")
        .like("file_name", `[계약서] ${contract.customer_name} - ${model}%`)
        .limit(1)
        .single();

      if (existingDoc) {
        await serviceClient
          .from("documents")
          .update({ file_url: pdfUrl, file_name: docTitle })
          .eq("id", existingDoc.id);
        console.log("[regenerate-pdf] 문서함 업데이트 contract=", contract.id);
      } else {
        await serviceClient
          .from("documents")
          .insert({
            uploaded_by: contract.created_by,
            category: "contract_template" as const,
            file_name: docTitle,
            file_url: pdfUrl,
          });
        console.log("[regenerate-pdf] 문서함 신규 등록 contract=", contract.id);
      }
    }

    return NextResponse.json({ url: freshPdfUrl });
  } catch (err) {
    if (err instanceof AuthError) {
      const status = err.code === "NO_TOKEN" || err.code === "INVALID_TOKEN" ? 401 : 403;
      return NextResponse.json({ error: getAuthErrorMessage(err.code) }, { status });
    }
    console.error("[regenerate-pdf] 오류:", err); return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
