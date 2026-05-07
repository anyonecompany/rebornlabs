/**
 * 매니저(director/team_leader) 산하 딜러 ID 조회 헬퍼.
 *
 * `get_subordinate_ids(p_user_id)` SECURITY DEFINER 함수를 호출해
 * 본인 + 1단계 + 2단계 산하 사용자 UUID 집합을 반환한다.
 *
 * **fail-closed**: RPC 실패 또는 산하 0명일 때 `[ZERO_UUID]` 반환 → `IN (...)` 절에서 0건 매칭.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

type SubordinateRow = { get_subordinate_ids: string } | string;

/**
 * 매니저 본인 + 산하 사용자 UUID 배열 반환.
 *
 * @param client - service_role Supabase 클라이언트 (RLS 우회 필요)
 * @param userId - 조회 대상 매니저 UUID (보통 verifyUser 결과의 user.id)
 * @returns UUID 배열. 산하 0명이거나 RPC 실패 시 `[ZERO_UUID]` 반환 (fail-closed).
 */
export async function fetchSubordinateIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: SupabaseClient<any, "public", any>,
  userId: string,
): Promise<string[]> {
  const { data, error } = await client.rpc(
    "get_subordinate_ids" as never,
    { p_user_id: userId } as never,
  );

  if (error || !data) {
    return [ZERO_UUID];
  }

  const rows = data as unknown as SubordinateRow[];
  const ids = rows.map((r) =>
    typeof r === "string" ? r : r.get_subordinate_ids,
  );

  return ids.length > 0 ? ids : [ZERO_UUID];
}

export const SUBORDINATE_ZERO_UUID = ZERO_UUID;
