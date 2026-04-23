import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, AuthError } from "@/lib/auth/verify";

// ─── 헬퍼 ────────────────────────────────────────────────────

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

type RouteContext = { params: Promise<{ id: string }> };

/** Storage 파일 정보 */
interface FileInfo {
  name: string;
  id: string | null;
  updated_at: string | null;
  created_at: string | null;
  last_accessed_at: string | null;
  metadata: Record<string, unknown> | null;
}

// ─── GET /api/sales/[id] — 판매 상세 ─────────────────────────

/**
 * 판매 상세 조회.
 *
 * - dealer: 본인 건만 (sale.dealer_id !== user.id → 403)
 * - 판매 정보 + 차량 + 딜러 + 상담 (있으면) 반환
 * - 서명 파일 존재 여부: Storage signatures 버킷에서 확인
 * - 계약서 파일 목록: Storage contracts 버킷에서 확인
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const token = extractToken(request);
    const user = await verifyUser(token);

    const serviceClient = createServiceClient();

    // 판매 정보 조회
    const { data: sale, error: saleError } = await serviceClient
      .from("sales")
      .select("*")
      .eq("id", id)
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

    // 차량, 딜러, 상담, 출고확인자 병렬 조회
    const [
      vehicleResult,
      dealerResult,
      consultationResult,
      deliveryConfirmedByResult,
    ] = await Promise.all([
      serviceClient.from("vehicles").select("*").eq("id", sale.vehicle_id).single(),
      serviceClient
        .from("profiles")
        .select("id, email, name, phone, role")
        .eq("id", sale.dealer_id)
        .single(),
      sale.consultation_id
        ? serviceClient
            .from("consultations")
            .select("*")
            .eq("id", sale.consultation_id)
            .single()
        : Promise.resolve({ data: null, error: null }),
      sale.delivery_confirmed_by
        ? serviceClient
            .from("profiles")
            .select("id, name")
            .eq("id", sale.delivery_confirmed_by)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    // Storage 서명 + 계약서 목록 병렬 조회
    const [signaturesResult, contractsResult] = await Promise.all([
      serviceClient.storage.from("signatures").list(id),
      serviceClient.storage.from("contracts").list(id),
    ]);

    // 서명 URL (signature.png가 있으면 publicUrl 반환)
    const signatureFiles = signaturesResult.data ?? [];
    const signatureFile = signatureFiles.find(
      (f) => f.name === "signature.png",
    );
    let signatureUrl: string | null = null;
    if (signatureFile) {
      const { data: urlData } = await serviceClient.storage
        .from("signatures")
        .createSignedUrl(`${id}/signature.png`, 3600);
      signatureUrl = urlData?.signedUrl ?? null;
    }

    // 계약서 파일 목록 (signed URL — 비공개 버킷)
    const contractFilesList = contractsResult.data ?? [];
    const contractFiles: (FileInfo & { url: string })[] = [];
    for (const file of contractFilesList) {
      const { data: urlData } = await serviceClient.storage
        .from("contracts")
        .createSignedUrl(`${id}/${file.name}`, 3600);
      contractFiles.push({
        ...file,
        url: urlData?.signedUrl ?? "",
      });
    }

    return NextResponse.json({
      data: sale,
      vehicle: vehicleResult.data ?? null,
      dealer: dealerResult.data ?? null,
      consultation: consultationResult.data ?? null,
      deliveryConfirmedBy: deliveryConfirmedByResult.data ?? null,
      signatureUrl,
      contractFiles,
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
