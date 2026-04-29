import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, requireRole, AuthError, getAuthErrorMessage} from "@/lib/auth/verify";

// ─── Zod 스키마 ───────────────────────────────────────────────

const CreateExpenseSchema = z.object({
  expense_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜 형식은 YYYY-MM-DD여야 합니다."),
  amount: z.number().int().positive("금액은 0보다 커야 합니다."),
  purpose: z
    .string()
    .min(1, "지출 목적은 필수입니다.")
    .max(500, "지출 목적은 500자 이내여야 합니다."),
  receipt_urls: z.array(z.string().url("올바른 URL 형식이 아닙니다.")).optional(),
});

// ─── 헬퍼: Authorization 헤더에서 토큰 추출 ───────────────────

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

// ─── GET /api/expenses — 지출 목록 조회 ──────────────────────

/**
 * 지출 목록 조회 (커서 기반 페이지네이션).
 *
 * - admin/staff만 접근 가능
 * - query: month (YYYY-MM, 기본 이번 달), user_id (optional, 작성자 필터)
 * - 커서: "expense_date__id" 형식, 20건씩
 * - 응답: { data: Expense[], nextCursor: string|null, totalAmount: number }
 */
export async function GET(request: NextRequest) {
  try {
    const token = extractToken(request);
    const user = await verifyUser(token);
    requireRole(user, ["admin", "staff"]);

    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor"); // 레거시 호환
    const monthParam = searchParams.get("month"); // "YYYY-MM" 형식
    const userIdParam = searchParams.get("user_id");

    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(
      100,
      Math.max(1, Number(searchParams.get("pageSize") ?? 20)),
    );

    // 기간 필터: 이번 달 기본값
    const now = new Date();
    const month =
      monthParam && /^\d{4}-\d{2}$/.test(monthParam)
        ? monthParam
        : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    const [year, mon] = month.split("-").map(Number);
    const startDate = `${month}-01`;
    const nextMonth =
      mon === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(mon + 1).padStart(2, "0")}-01`;

    const serviceClient = createServiceClient();

    // 월별 총액 집계 (페이지네이션과 별도)
    let totalQuery = serviceClient
      .from("expenses")
      .select("amount")
      .gte("expense_date", startDate)
      .lt("expense_date", nextMonth);

    if (userIdParam) {
      totalQuery = totalQuery.eq("user_id", userIdParam);
    }

    const { data: totalData, error: totalError } = await totalQuery;
    if (totalError) {
      return NextResponse.json(
        { error: "총액 집계에 실패했습니다." },
        { status: 500 },
      );
    }

    const totalAmount = (totalData ?? []).reduce(
      (sum, row) => sum + row.amount,
      0,
    );

    // 목록 조회 (page 번호 기본, cursor 레거시 호환)
    let listQuery = serviceClient
      .from("expenses")
      .select("*", { count: "exact" })
      .gte("expense_date", startDate)
      .lt("expense_date", nextMonth)
      .order("expense_date", { ascending: false })
      .order("id", { ascending: false });

    if (userIdParam) {
      listQuery = listQuery.eq("user_id", userIdParam);
    }

    if (cursor) {
      listQuery = listQuery.limit(pageSize + 1);
      const [cursorDate, cursorId] = cursor.split("__");
      if (cursorDate && cursorId) {
        listQuery = listQuery.or(
          `expense_date.lt.${cursorDate},and(expense_date.eq.${cursorDate},id.lt.${cursorId})`,
        );
      }
    } else {
      const offset = (page - 1) * pageSize;
      listQuery = listQuery.range(offset, offset + pageSize - 1);
    }

    const { data: expenses, error: listError, count } = await listQuery;
    if (listError) {
      return NextResponse.json(
        { error: "지출 목록을 불러오지 못했습니다." },
        { status: 500 },
      );
    }

    const total = count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const hasMore = cursor ? (expenses?.length ?? 0) > pageSize : false;
    const items =
      cursor && hasMore ? expenses!.slice(0, pageSize) : (expenses ?? []);

    if (items.length === 0) {
      return NextResponse.json({
        data: [],
        total,
        page,
        pageSize,
        totalPages,
        nextCursor: null,
        totalAmount,
      });
    }

    // 작성자 이름 join
    const userIds = [...new Set(items.map((e) => e.user_id))];
    const { data: profiles } = await serviceClient
      .from("profiles")
      .select("id, name")
      .in("id", userIds);

    const profileMap = new Map(
      (profiles ?? []).map((p) => [p.id, p.name]),
    );

    const merged = items.map((expense) => ({
      ...expense,
      user_name: profileMap.get(expense.user_id) ?? null,
    }));

    const lastItem = items[items.length - 1];
    const nextCursor =
      cursor && hasMore && lastItem
        ? `${lastItem.expense_date}__${lastItem.id}`
        : null;

    return NextResponse.json({
      data: merged,
      total,
      page,
      pageSize,
      totalPages,
      nextCursor,
      totalAmount,
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

// ─── POST /api/expenses — 지출 등록 ──────────────────────────

/**
 * 지출 등록 (admin/staff 전용).
 * user_id는 인증된 사용자로 자동 설정된다.
 */
export async function POST(request: NextRequest) {
  try {
    const token = extractToken(request);
    const user = await verifyUser(token);
    requireRole(user, ["admin", "staff"]);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "요청 데이터 형식이 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const parsed = CreateExpenseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.errors[0]?.message ?? "입력 데이터가 올바르지 않습니다.",
        },
        { status: 400 },
      );
    }

    const serviceClient = createServiceClient();

    const insertData = {
      user_id: user.id,
      expense_date: parsed.data.expense_date,
      amount: parsed.data.amount,
      purpose: parsed.data.purpose,
      receipt_urls: parsed.data.receipt_urls ?? [],
    };

    const { data: expense, error } = await serviceClient
      .from("expenses")
      .insert(insertData)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: "지출 등록에 실패했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json({ data: expense }, { status: 201 });
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
