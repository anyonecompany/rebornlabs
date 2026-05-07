import { NextRequest, NextResponse } from "next/server";

import {
  createAuthedClient,
  createServiceClient,
} from "@/lib/supabase/server";
import { verifyUser, AuthError, getAuthErrorMessage } from "@/lib/auth/verify";
import { can } from "@/lib/auth/capabilities";

// ─── 헬퍼 ────────────────────────────────────────────────────

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

interface MonthBounds {
  month: string;
  start: string;
  end: string;
}

/**
 * YYYY-MM을 Asia/Seoul 기준 월 경계로 변환.
 * Supabase에는 UTC로 저장되므로 KST 월의 시작/끝을 UTC ISO 문자열로 반환.
 * (예: 2026-04 KST → 2026-03-31T15:00:00Z ~ 2026-04-30T15:00:00Z)
 */
function resolveMonthBounds(monthParam: string | null): MonthBounds | null {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const month = monthParam ?? defaultMonth;
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const m = Number(match[2]);
  if (m < 1 || m > 12) return null;

  // KST(UTC+9) 월 시작 = UTC 전월 말일 15:00
  const startUtc = new Date(Date.UTC(year, m - 1, 1, -9, 0, 0));
  const endUtc = new Date(Date.UTC(year, m, 1, -9, 0, 0));

  return {
    month,
    start: startUtc.toISOString(),
    end: endUtc.toISOString(),
  };
}

// ─── 타입 ────────────────────────────────────────────────────

interface CommissionDetail {
  id: string;
  confirmed_at: string;
  sale_id: string;
  recipient_id: string;
  recipient_name: string;
  recipient_role: "dealer" | "team_leader" | "director";
  amount: number;
  commission_type: string;
  case_type: string;
  customer_name: string | null;
  vehicle_summary: string | null;
  sale_cancelled: boolean;
}

interface EmployeeAggregate {
  recipient_id: string;
  recipient_name: string;
  recipient_role: "dealer" | "team_leader" | "director";
  count: number;
  total_amount: number;
}

// ─── GET /api/settlements/commissions — 월별 수당 집계 ────────

/**
 * 월별 수당 집계 (역할별 RLS 위임).
 *
 * - query: month=YYYY-MM (Asia/Seoul, 기본=이번 달)
 * - admin/staff: 전체 + byEmployee 집계 동봉
 * - director/team_leader: 본인 + 산하 (RLS 자동 필터)
 * - dealer: 본인만 (RLS 자동 필터)
 *
 * 설계:
 *   Authorization Bearer 토큰으로 createAuthedClient 생성 → commissions 조회 시
 *   commissions_select_* 정책이 역할별 범위 필터를 자동 적용한다.
 *   profiles/sales join은 RLS의 직접 대상이 아니므로 service_role로 enrich하되,
 *   노출 대상은 이미 필터된 commissions row에 국한된다.
 */
export async function GET(request: NextRequest) {
  try {
    const token = extractToken(request);
    const user = await verifyUser(token);

    const { searchParams } = new URL(request.url);
    const bounds = resolveMonthBounds(searchParams.get("month"));
    if (!bounds) {
      return NextResponse.json(
        { error: "month 형식이 올바르지 않습니다. YYYY-MM 형식으로 보내주세요." },
        { status: 400 },
      );
    }

    // 1. RLS 기반 commissions 조회 (역할별 범위 자동 적용)
    const authedClient = createAuthedClient(token);
    const { data: commissions, error: commErr } = await authedClient
      .from("commissions")
      .select(
        "id, sale_id, recipient_id, recipient_role, amount, commission_type, case_type, confirmed_at",
      )
      .gte("confirmed_at", bounds.start)
      .lt("confirmed_at", bounds.end)
      .order("confirmed_at", { ascending: false });

    if (commErr) {
      // authedClient 경로는 RLS 가 권한 경계이므로, 에러는 대부분 토큰/정책 문제.
      // fail-closed 로 403 반환 — 이후 enrich 단계로 넘어가 service_role 로 추가 노출되는 것을 방지.
      console.error(
        "[settlements/commissions] authed commissions 쿼리 실패:",
        commErr.message,
      );
      return NextResponse.json(
        { error: "수당 데이터 접근 권한이 없습니다." },
        { status: 403 },
      );
    }

    const rows = commissions ?? [];

    // 2. enrich: sales(판매 취소 여부), consultation(고객명), vehicle(차량)
    //    이미 RLS로 필터된 rows에 대해서만 join → service_role 사용은 정보 유출 없음.
    const serviceClient = createServiceClient();

    const saleIds = [...new Set(rows.map((r) => r.sale_id))];
    const recipientIds = [...new Set(rows.map((r) => r.recipient_id))];

    const [salesRes, recipientsRes] = await Promise.all([
      saleIds.length
        ? serviceClient
            .from("sales")
            .select("id, consultation_id, vehicle_id, cancelled_at")
            .in("id", saleIds)
        : Promise.resolve({ data: [], error: null }),
      recipientIds.length
        ? serviceClient
            .from("profiles")
            .select("id, name, role")
            .in("id", recipientIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const salesData = salesRes.data ?? [];
    const recipientMap = new Map(
      (recipientsRes.data ?? []).map((p) => [p.id, p]),
    );
    const saleMap = new Map(salesData.map((s) => [s.id, s]));

    const vehicleIds = [
      ...new Set(salesData.map((s) => s.vehicle_id).filter(Boolean)),
    ];
    const consultationIds = [
      ...new Set(
        salesData
          .map((s) => s.consultation_id)
          .filter((v): v is string => !!v),
      ),
    ];

    const [vehiclesRes, consultationsRes] = await Promise.all([
      vehicleIds.length
        ? serviceClient
            .from("vehicles")
            .select("id, make, model, year")
            .in("id", vehicleIds)
        : Promise.resolve({ data: [], error: null }),
      consultationIds.length
        ? serviceClient
            .from("consultations")
            .select("id, customer_name")
            .in("id", consultationIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const vehicleMap = new Map(
      (vehiclesRes.data ?? []).map((v) => [v.id, v]),
    );
    const consultationMap = new Map(
      (consultationsRes.data ?? []).map((c) => [c.id, c]),
    );

    // 3. details 조립
    const details: CommissionDetail[] = rows.map((r) => {
      const sale = saleMap.get(r.sale_id);
      const recipient = recipientMap.get(r.recipient_id);
      const vehicle = sale?.vehicle_id ? vehicleMap.get(sale.vehicle_id) : null;
      const consultation = sale?.consultation_id
        ? consultationMap.get(sale.consultation_id)
        : null;
      return {
        id: r.id,
        confirmed_at: r.confirmed_at,
        sale_id: r.sale_id,
        recipient_id: r.recipient_id,
        recipient_name: recipient?.name ?? "—",
        recipient_role: r.recipient_role,
        amount: r.amount,
        commission_type: r.commission_type,
        case_type: r.case_type,
        customer_name: consultation?.customer_name ?? null,
        vehicle_summary: vehicle
          ? `${vehicle.make} ${vehicle.model} ${vehicle.year}`
          : null,
        sale_cancelled: !!sale?.cancelled_at,
      };
    });

    // 4. 요약
    const activeDetails = details.filter((d) => !d.sale_cancelled);
    const myDetails = activeDetails.filter(
      (d) => d.recipient_id === user.id,
    );
    const my_total_amount = myDetails.reduce((s, d) => s + d.amount, 0);
    const my_count = myDetails.length;
    const my_average = my_count > 0 ? Math.round(my_total_amount / my_count) : 0;

    const all_total_amount = activeDetails.reduce((s, d) => s + d.amount, 0);
    const all_count = activeDetails.length;

    // 본인 외 전체 집계 권한 — capabilities.ts SSOT (admin/staff만 commissions:read:all)
    const isPrivileged = can(user.role, "commissions:read:all");

    // 5. admin/staff: byEmployee 집계
    let byEmployee: EmployeeAggregate[] | undefined;
    if (isPrivileged) {
      const grouped = new Map<string, EmployeeAggregate>();
      for (const d of activeDetails) {
        const key = d.recipient_id;
        const existing = grouped.get(key);
        if (existing) {
          existing.count += 1;
          existing.total_amount += d.amount;
        } else {
          grouped.set(key, {
            recipient_id: d.recipient_id,
            recipient_name: d.recipient_name,
            recipient_role: d.recipient_role,
            count: 1,
            total_amount: d.amount,
          });
        }
      }
      byEmployee = Array.from(grouped.values()).sort(
        (a, b) => b.total_amount - a.total_amount,
      );
    }

    return NextResponse.json({
      month: bounds.month,
      summary: {
        my_total_amount,
        my_count,
        my_average,
        all_total_amount: isPrivileged ? all_total_amount : undefined,
        all_count: isPrivileged ? all_count : undefined,
      },
      details,
      byEmployee,
    });
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
