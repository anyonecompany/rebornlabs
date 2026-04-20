import { NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";

// Route Segment Config — 5분 재검증 (ISR-like for Route Handler)
export const revalidate = 300;

// ─── CORS ─────────────────────────────────────────────────────

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

// ─── GET /api/vehicle-models/public — 공개 계층 조회 ────────
// 인증 불필요. is_active=true 행만 brand→model→trim 계층으로 응답.

export async function GET() {
  try {
    const serviceClient = createServiceClient();

    const { data, error } = await serviceClient
      .from("vehicle_models")
      .select("id, brand, model, trim, car_price, max_deposit, display_order")
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: "카탈로그를 불러오지 못했습니다." },
        { status: 500, headers: CORS },
      );
    }

    // brand → model → trim 계층 구성 (정렬은 display_order 기준 자연스럽게 유지)
    type Trim = {
      id: string;
      trim: string;
      carPrice: number;
      maxDeposit: number;
      displayOrder: number;
    };
    type Model = { name: string; trimCount: number; trims: Trim[] };
    type Brand = { name: string; modelCount: number; models: Model[] };

    const brandMap = new Map<string, Map<string, Trim[]>>();

    for (const row of data ?? []) {
      const modelMap =
        brandMap.get(row.brand) ??
        (() => {
          const m = new Map<string, Trim[]>();
          brandMap.set(row.brand, m);
          return m;
        })();
      const trims =
        modelMap.get(row.model) ??
        (() => {
          const arr: Trim[] = [];
          modelMap.set(row.model, arr);
          return arr;
        })();
      trims.push({
        id: row.id,
        trim: row.trim,
        carPrice: row.car_price,
        maxDeposit: row.max_deposit,
        displayOrder: row.display_order,
      });
    }

    const brands: Brand[] = [];
    for (const [brandName, modelMap] of brandMap.entries()) {
      const models: Model[] = [];
      for (const [modelName, trims] of modelMap.entries()) {
        models.push({
          name: modelName,
          trimCount: trims.length,
          trims,
        });
      }
      brands.push({
        name: brandName,
        modelCount: models.length,
        models,
      });
    }

    return NextResponse.json({ brands }, { headers: CORS });
  } catch {
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500, headers: CORS },
    );
  }
}
