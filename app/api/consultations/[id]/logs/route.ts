import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createServiceClient } from "@/lib/supabase/server";
import { verifyUser, AuthError, getAuthErrorMessage } from "@/lib/auth/verify";

// ─── 공통 헬퍼 ───────────────────────────────────────────────

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

/**
 * director/team_leader의 산하 dealer UUID 목록 조회.
 * 실패 또는 0명이면 [ZERO_UUID]로 폴백 → 0건 매칭 (fail-closed).
 */
async function getSubordinateIds(
  serviceClient: ReturnType<typeof createServiceClient>,
  userId: string,
): Promise<string[]> {
  type SubResult = { get_subordinate_ids: string } | string;
  const { data: subData, error: subError } = await serviceClient.rpc(
    "get_subordinate_ids" as never,
    { p_user_id: userId } as never,
  );
  if (!subError && subData) {
    const rows = subData as unknown as SubResult[];
    const ids = rows.map((r) =>
      typeof r === "string"
        ? r
        : (r as { get_subordinate_ids: string }).get_subordinate_ids,
    );
    if (ids.length > 0) return ids;
  }
  return [ZERO_UUID];
}

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
  // 프론트엔드에서 'status' 키로도 전송하므로 두 필드 모두 수용하고 status_snapshot으로 통일
  status: z
    .enum(ALLOWED_STATUS_SNAPSHOTS, {
      errorMap: () => ({
        message:
          "유효하지 않은 상태값입니다. (new, consulting, vehicle_waiting, rejected 중 하나)",
      }),
    })
    .optional(),
  status_snapshot: z
    .enum(ALLOWED_STATUS_SNAPSHOTS, {
      errorMap: () => ({
        message:
          "유효하지 않은 상태값입니다. (new, consulting, vehicle_waiting, rejected 중 하나)",
      }),
    })
    .optional(),
}).transform((data) => ({
  content: data.content,
  // status_snapshot이 있으면 우선, 없으면 status 사용
  status_snapshot: data.status_snapshot ?? data.status ?? null,
}));

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

    // ── 역할별 접근 권한 검증 ─────────────────────────────────────
    // 권한 매트릭스:
    //   admin/staff:          모든 상담
    //   director/team_leader: get_subordinate_ids에 포함된 dealer의 상담만
    //   dealer:               assigned_dealer_id === user.id
    if (user.role === "dealer") {
      if (consultation.assigned_dealer_id !== user.id) {
        return NextResponse.json(
          { error: "접근 권한이 없습니다." },
          { status: 403 },
        );
      }
    } else if (user.role === "director" || user.role === "team_leader") {
      // manager 가시 범위: 산하 dealer 배정 + 미배정. 그 외는 403.
      const subordinateIds = await getSubordinateIds(serviceClient, user.id);
      const isAssignedToSubordinate =
        consultation.assigned_dealer_id !== null &&
        subordinateIds.includes(consultation.assigned_dealer_id);
      const isUnassigned = consultation.assigned_dealer_id === null;
      if (!isAssignedToSubordinate && !isUnassigned) {
        return NextResponse.json(
          { error: "접근 권한이 없습니다." },
          { status: 403 },
        );
      }
    }
    // admin/staff: 추가 필터 없음

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
      return NextResponse.json({ error: getAuthErrorMessage(err.code) }, { status });
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
    // status_snapshot: 현재 상담 상태를 스냅샷으로 사용
    // DB 타입이 consultation_status enum일 수 있으므로 명시적 값 사용
    const snapshot = status_snapshot ?? consultation.status;

    // consultation_status enum에 속하는 값만 허용
    const validStatuses = ["new", "consulting", "vehicle_waiting", "rejected"];
    const safeSnapshot = validStatuses.includes(snapshot) ? snapshot : consultation.status;

    const { data: log, error: insertError } = await serviceClient
      .from("consultation_logs")
      .insert({
        consultation_id: id,
        dealer_id: user.id,
        content,
        status_snapshot: safeSnapshot,
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
      return NextResponse.json({ error: getAuthErrorMessage(err.code) }, { status });
    }
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
