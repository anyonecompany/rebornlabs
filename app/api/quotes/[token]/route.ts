import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";

// ─── CORS ─────────────────────────────────────────────────────

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function corsJson(body: unknown, init?: { status?: number }) {
  return NextResponse.json(body, { ...init, headers: CORS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

type RouteContext = { params: Promise<{ token: string }> };

// ─── GET /api/quotes/[token] — 공개 조회 ─────────────────────
//
// 인증 없이 토큰으로 견적서 조회.
// - 만료: 410 Gone + 딜러 정보만 반환
// - 유효: 차량/딜러/회사 정보 JOIN 응답 (민감 필드 제외)
// - 조회 시 view_count 증가 + last_viewed_at 갱신

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;

    if (!token || typeof token !== "string" || token.length < 16) {
      return corsJson({ error: "유효하지 않은 견적서입니다." }, { status: 404 });
    }

    const serviceClient = createServiceClient();

    // 1. quotes + vehicles + dealer profile JOIN
    const { data: quote, error: quoteError } = await serviceClient
      .from("quotes")
      .select(
        `
          id, token, quote_number, expires_at,
          view_count, first_viewed_at, last_viewed_at, created_at,
          vehicle:vehicles!inner (
            id, vehicle_code, make, model, year, mileage,
            selling_price, deposit, monthly_payment, photos,
            vin, color, status, deleted_at
          ),
          dealer:profiles!dealer_id (
            id, name, phone
          )
        `,
      )
      .eq("token", token)
      .maybeSingle();

    if (quoteError || !quote) {
      return corsJson({ error: "견적서를 찾을 수 없습니다." }, { status: 404 });
    }

    // 차량 소프트 삭제 시에도 접근 차단
    const vehicle = (Array.isArray(quote.vehicle) ? quote.vehicle[0] : quote.vehicle) as
      | {
          id: string;
          vehicle_code: string;
          make: string;
          model: string;
          year: number;
          mileage: number | null;
          selling_price: number;
          deposit: number | null;
          monthly_payment: number | null;
          photos: string[] | null;
          vin: string | null;
          color: string | null;
          status: string;
          deleted_at: string | null;
        }
      | null;

    if (!vehicle || vehicle.deleted_at) {
      return corsJson({ error: "차량 정보가 더 이상 제공되지 않습니다." }, { status: 404 });
    }

    const dealer = (Array.isArray(quote.dealer) ? quote.dealer[0] : quote.dealer) as
      | { id: string; name: string; phone: string | null }
      | null;

    // 회사 정보 (env)
    const company = {
      name: "리본랩스",
      businessNumber: process.env.REBORNLABS_BUSINESS_NUMBER ?? null,
      address: process.env.REBORNLABS_ADDRESS ?? null,
      phone: process.env.REBORNLABS_PHONE ?? null,
    };

    // 2. 만료 체크
    const now = Date.now();
    const isExpired =
      quote.expires_at && new Date(quote.expires_at).getTime() < now;

    if (isExpired) {
      return corsJson(
        {
          error: "expired",
          message: "견적서 유효기간이 만료되었습니다.",
          quote: {
            quoteNumber: quote.quote_number,
            expiresAt: quote.expires_at,
          },
          dealer: dealer
            ? { name: dealer.name, phone: dealer.phone }
            : null,
          company,
        },
        { status: 410 },
      );
    }

    // 3. 조회수 갱신 (fire-and-forget)
    const nowIso = new Date().toISOString();
    serviceClient
      .from("quotes")
      .update({
        view_count: (quote.view_count ?? 0) + 1,
        last_viewed_at: nowIso,
        first_viewed_at: quote.first_viewed_at ?? nowIso,
      })
      .eq("id", quote.id)
      .then(() => {})
      .then(undefined, () => {});

    // 4. 응답 (민감 필드 제외)
    return corsJson({
      quote: {
        quoteNumber: quote.quote_number,
        createdAt: quote.created_at,
        expiresAt: quote.expires_at,
        viewCount: quote.view_count ?? 0,
      },
      vehicle: {
        vehicleCode: vehicle.vehicle_code,
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        mileage: vehicle.mileage,
        color: vehicle.color,
        vin: vehicle.vin,
        sellingPrice: vehicle.selling_price,
        deposit: vehicle.deposit,
        monthlyPayment: vehicle.monthly_payment,
        images: (vehicle.photos ?? []).map((url, idx) => ({ url, order: idx })),
        primaryImageUrl: vehicle.photos?.[0] ?? null,
        status: vehicle.status,
      },
      dealer: dealer
        ? { name: dealer.name, phone: dealer.phone }
        : null,
      company,
    });
  } catch {
    return corsJson({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
