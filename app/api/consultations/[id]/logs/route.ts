import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, AuthError } from "@/lib/auth/verify";

// ─── 허용 status_snapshot 값 ─────────────────────────────────

const ALLOWED_STATUS_SNAPSHOTS = [
  "new",
  "consulting",
  "vehicle_waiting",
  "rejected",
] as const;

// ─── Zod 스키마 ───────────────────────────────────────────────

const CreateLogSchema = z.object({
  content: z
    .string()
    .min(1, "내용은 필수입니다.")
    .max(2000, "내용은 2000자 이하여야 합니다."),
  status_snapshot: z.enum(ALLOWED_STATUS_SNAPSHOTS, {
    errorMap: () => ({
      message:
        "유효하지 않은 상태값입니다. (new, consulting, vehicle_waiting, rejected 중 하나)",
    }),
  }),
});

// ─── 헬퍼 ────────────────────────────────────────────────────

function extractToken(request: NextRequest): string {
  const authHeader = request.headers.get("Authorization") ?? "";
  return authHeader.replace(/^Bearer\s+/i, "");
}

type RouteContext = { params: Promise<{ id: string }> };

// ─── GET /api/consultations/[id]/logs — 상담 기록 조회 ───────

/**
 * 상담 기록 목록 조회 (오래된 순).
 *
 * - 인증 필수
 * - consultation_logs + 딜러 이름 JOIN
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const token = extractToken(request);
    const user = await verifyUser(token);

    const serviceClient = createServiceClient();

    // 상담 존재 + 접근 권한 확인
    const { data: consultation, error: consultError } = await serviceClient
      .from("consultations")
      .select("id, assigned_dealer_id")
      .eq("id", id)
      .single();

    if (consultError || !consultation) {
      return NextResponse.json(
        { error: "상담을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    // dealer는 본인 배정 상담만 조회 가능
    if (
      user.role === "dealer" &&
      consultation.assigned_dealer_id !== user.id
    ) {
      return NextResponse.json(
        { error: "접근 권한이 없습니다." },
        { status: 403 },
      );
    }

    // 상담 기록 조회 (오래된 순)
    const { data: logs, error: logsError } = await serviceClient
      .from("consultation_logs")
      .select("*")
      .eq("consultation_id", id)
      .order("created_at", { ascending: true });

    if (logsError) {
      return NextResponse.json(
        { error: "상담 기록을 불러오지 못했습니다." },
        { status: 500 },
      );
    }

    // 딜러 이름 조회 (unique dealer_id 목록으로 배치 조회)
    const dealerIds = [...new Set((logs ?? []).map((log) => log.dealer_id))];
    let dealerMap: Record<string, string> = {};

    if (dealerIds.length > 0) {
      const { data: dealers } = await serviceClient
        .from("profiles")
        .select("id, name")
        .in("id", dealerIds);

      dealerMap = Object.fromEntries(
        (dealers ?? []).map((d) => [d.id, d.name]),
      );
    }

    // 딜러 이름 병합
    const logsWithDealer = (logs ?? []).map((log) => ({
      ...log,
      dealer_name: dealerMap[log.dealer_id] ?? null,
    }));

    return NextResponse.json({ data: logsWithDealer });
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

// ─── POST /api/consultations/[id]/logs — 상담 기록 작성 ──────

/**
 * 상담 기록 작성.
 *
 * - 딜러: 본인 배정 상담만 기록 가능
 * - admin/staff: 모든 상담 기록 가능
 * - status_snapshot 'sold' 차단 (DB CHECK + API 이중 방어)
 * - 트리거(sync_consultation_status)가 자동으로 consultations.status 업데이트
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const token = extractToken(request);
    const user = await verifyUser(token);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "요청 데이터 형식이 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const parsed = CreateLogSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.errors[0]?.message ?? "입력 데이터가 올바르지 않습니다.",
        },
        { status: 400 },
      );
    }

    const { content, status_snapshot } = parsed.data;
    const serviceClient = createServiceClient();

    // 상담 존재 확인
    const { data: consultation, error: consultError } = await serviceClient
      .from("consultations")
      .select("id, assigned_dealer_id, status")
      .eq("id", id)
      .single();

    if (consultError || !consultation) {
      return NextResponse.json(
        { error: "상담을 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    // sold 상담에는 기록 추가 불가
    if (consultation.status === "sold") {
      return NextResponse.json(
        { error: "판매 완료된 상담에는 기록을 추가할 수 없습니다." },
        { status: 400 },
      );
    }

    // dealer: 본인 배정 상담인지 확인
    if (
      user.role === "dealer" &&
      consultation.assigned_dealer_id !== user.id
    ) {
      return NextResponse.json(
        { error: "본인이 담당하는 상담에만 기록을 작성할 수 있습니다." },
        { status: 403 },
      );
    }

    // 상담 기록 INSERT
    const { data: log, error: insertError } = await serviceClient
      .from("consultation_logs")
      .insert({
        consultation_id: id,
        dealer_id: user.id,
        content,
        status_snapshot,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: "상담 기록 작성에 실패했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json({ data: log }, { status: 201 });
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
