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
    //    quoted_* 컬럼: 발행 시점 가격 snapshot (vehicles 가격 변경에 영향받지 않음)
    //    주의: Supabase 자동생성 타입이 재생성되기 전까지 quoted_* 컬럼이 타입에 없으므로
    //    로컬 타입으로 단언 처리 (DB 마이그레이션 적용 후 타입 재생성 시 제거 가능)
    type QuoteRow = {
      id: string;
      token: string;
      quote_number: string;
      expires_at: string | null;
      view_count: number | null;
      first_viewed_at: string | null;
      last_viewed_at: string | null;
      created_at: string;
      quoted_selling_price: number | null;
      quoted_deposit: number | null;
      quoted_monthly_payment: number | null;
      vehicle: unknown;
      dealer: unknown;
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rawQuote, error: quoteError } = await (serviceClient as any)
      .from("quotes")
      .select(
        `
          id, token, quote_number, expires_at,
          view_count, first_viewed_at, last_viewed_at, created_at,
          quoted_selling_price, quoted_deposit, quoted_monthly_payment,
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

    const quote = rawQuote as QuoteRow | null;

    if (quoteError || !quote) {
      return corsJson({ error: "견적서를 찾을 수 없습니다." }, { status: 404 });
    }

    // 차량 소프트 삭제 시에도 접근 차단
    const vehicle = (Array.isArray(quote.vehicle) ? (quote.vehicle as unknown[])[0] : quote.vehicle) as
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

    // 가격 우선순위: snapshot(발행 시점) > vehicles 현재값 (기존 견적 호환)
    const frozenSellingPrice = quote.quoted_selling_price ?? vehicle?.selling_price ?? 0;
    const frozenDeposit = quote.quoted_deposit !== undefined
      ? quote.quoted_deposit
      : (vehicle?.deposit ?? null);
    const frozenMonthlyPayment = quote.quoted_monthly_payment !== undefined
      ? quote.quoted_monthly_payment
      : (vehicle?.monthly_payment ?? null);

    if (!vehicle || vehicle.deleted_at) {
      return corsJson({ error: "차량 정보가 더 이상 제공되지 않습니다." }, { status: 404 });
    }

    const dealer = (Array.isArray(quote.dealer) ? (quote.dealer as unknown[])[0] : quote.dealer) as
      | { id: string; name: string; phone: string | null }
      | null;

    // 2. 만료 체크
    const now = Date.now();
    const isExpired =
      quote.expires_at && new Date(quote.expires_at).getTime() < now;

    if (isExpired) {
      return corsJson(
        {
          expired: true,
          expiresAt: quote.expires_at,
          quoteNumber: quote.quote_number,
          dealerName: dealer?.name ?? null,
          dealerPhone: dealer?.phone ?? null,
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
        // snapshot 우선 사용 — 발행 후 차량 가격 변경에 영향받지 않음
        sellingPrice: frozenSellingPrice,
        deposit: frozenDeposit,
        monthlyPayment: frozenMonthlyPayment,
        images: (vehicle.photos ?? []).map((url, idx) => ({ url, order: idx })),
        primaryImageUrl: vehicle.photos?.[0] ?? null,
        status: vehicle.status,
      },
      dealer: dealer
        ? { name: dealer.name, phone: dealer.phone }
        : null,
    });
  } catch {
    return corsJson({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
