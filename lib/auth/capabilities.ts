/**
 * RBAC 단일 진실 원천 (Single Source of Truth)
 *
 * 6개 Layer가 모두 이 파일을 import 한다:
 *   L2 hooks      → src/lib/use-user-role.ts
 *   L3 proxy      → proxy.ts (PATH_CAPABILITY 매핑)
 *   L3'' sidebar  → components/sidebar.tsx (메뉴 필터링)
 *   L4 API        → app/api/**\/route.ts (requireCapability)
 *   L5 RLS        → supabase has_capability() SQL 함수와 동기화 (수동)
 *
 * **신규 역할 / capability 추가 시 갱신 위치:**
 *   1. types/database.ts UserRole (도메인 타입)
 *   2. 본 파일 Capability 유니언 + CAPABILITIES Record
 *   3. supabase/migrations/.../has_capability.sql (SQL 함수)
 *   4. lib/auth/capabilities.test.ts (회귀 테스트)
 *
 * 누락 시 컴파일러가 Record<UserRole, ...> exhaustiveness check로 자동 검출.
 */

import type { UserRole } from "@/types/database";

// ────────────────────────────────────────────────────────────
// Capability 정의 — 도메인:액션:스코프
// ────────────────────────────────────────────────────────────

export type Capability =
  // consultations
  | "consultations:read:all"
  | "consultations:read:subordinate"
  | "consultations:read:self"
  | "consultations:write:status"
  | "consultations:write:assign"
  // sales
  | "sales:read:all"
  | "sales:read:subordinate"
  | "sales:read:self"
  | "sales:write:create"
  | "sales:write:cancel"
  | "sales:write:complete"
  // vehicles
  | "vehicles:read:all"
  | "vehicles:read:dealer-view"
  | "vehicles:write"
  // vehicle-models
  | "vehicle-models:read"
  | "vehicle-models:write"
  // contracts
  | "contracts:read:all"
  | "contracts:read:subordinate"
  | "contracts:read:self"
  | "contracts:write"
  // quotes
  | "quotes:read:all"
  | "quotes:read:subordinate"
  | "quotes:read:self"
  | "quotes:write"
  // commissions
  | "commissions:read:all"
  | "commissions:read:subordinate"
  | "commissions:read:self"
  // expenses
  | "expenses:read"
  | "expenses:write"
  // documents
  | "documents:read"
  | "documents:write"
  // users / 관리
  | "users:read"
  | "users:write"
  | "team-structure:manage"
  | "audit-logs:read"
  // marketing
  | "marketing-companies:read"
  | "marketing-companies:write"
  // 메뉴 노출 (UI 전용 — proxy/sidebar 동기화)
  | "menu:dashboard"
  | "menu:vehicles"
  | "menu:vehicle-models"
  | "menu:cars-public"
  | "menu:consultations"
  | "menu:sales"
  | "menu:quotes"
  | "menu:settlements"
  | "menu:expenses"
  | "menu:documents"
  | "menu:users"
  | "menu:team-structure"
  | "menu:audit-logs";

// ────────────────────────────────────────────────────────────
// Capability 매트릭스 — 역할별 권한 집합
// ────────────────────────────────────────────────────────────

const ALL_CAPABILITIES: ReadonlyArray<Capability> = [
  "consultations:read:all",
  "consultations:read:subordinate",
  "consultations:read:self",
  "consultations:write:status",
  "consultations:write:assign",
  "sales:read:all",
  "sales:read:subordinate",
  "sales:read:self",
  "sales:write:create",
  "sales:write:cancel",
  "sales:write:complete",
  "vehicles:read:all",
  "vehicles:read:dealer-view",
  "vehicles:write",
  "vehicle-models:read",
  "vehicle-models:write",
  "contracts:read:all",
  "contracts:read:subordinate",
  "contracts:read:self",
  "contracts:write",
  "quotes:read:all",
  "quotes:read:subordinate",
  "quotes:read:self",
  "quotes:write",
  "commissions:read:all",
  "commissions:read:subordinate",
  "commissions:read:self",
  "expenses:read",
  "expenses:write",
  "documents:read",
  "documents:write",
  "users:read",
  "users:write",
  "team-structure:manage",
  "audit-logs:read",
  "marketing-companies:read",
  "marketing-companies:write",
  "menu:dashboard",
  "menu:vehicles",
  "menu:vehicle-models",
  "menu:cars-public",
  "menu:consultations",
  "menu:sales",
  "menu:quotes",
  "menu:settlements",
  "menu:expenses",
  "menu:documents",
  "menu:users",
  "menu:team-structure",
  "menu:audit-logs",
];

const STAFF_CAPABILITIES: ReadonlyArray<Capability> = [
  "consultations:read:all",
  "consultations:write:status",
  "consultations:write:assign",
  "sales:read:all",
  "sales:write:create",
  "sales:write:cancel",
  "sales:write:complete",
  "vehicles:read:all",
  "vehicles:write",
  "vehicle-models:read",
  "vehicle-models:write",
  "contracts:read:all",
  "contracts:write",
  "quotes:read:all",
  "quotes:write",
  "commissions:read:all",
  "expenses:read",
  "expenses:write",
  "documents:read",
  "documents:write",
  "marketing-companies:read",
  "menu:dashboard",
  "menu:vehicles",
  "menu:vehicle-models",
  "menu:cars-public",
  "menu:consultations",
  "menu:sales",
  "menu:quotes",
  "menu:settlements",
  "menu:expenses",
  "menu:documents",
];

const MANAGER_CAPABILITIES: ReadonlyArray<Capability> = [
  // director / team_leader 공용 — 산하 스코프
  "consultations:read:subordinate",
  "consultations:write:status",
  "consultations:write:assign",
  "sales:read:subordinate",
  "sales:write:cancel",
  "vehicles:read:all",
  "contracts:read:subordinate",
  "quotes:read:subordinate",
  "commissions:read:subordinate",
  "expenses:read",
  "expenses:write",
  "documents:read",
  "documents:write",
  "marketing-companies:read",
  // 메뉴 — 본사 관리 메뉴 제외
  "menu:dashboard",
  "menu:vehicles",
  "menu:cars-public",
  "menu:consultations",
  "menu:sales",
  "menu:quotes",
  "menu:settlements",
  "menu:expenses",
  "menu:documents",
];

const DEALER_CAPABILITIES: ReadonlyArray<Capability> = [
  "consultations:read:self",
  "consultations:write:status",
  "sales:read:self",
  "vehicles:read:dealer-view",
  "contracts:read:self",
  "quotes:read:self",
  "quotes:write",
  "commissions:read:self",
  "menu:dashboard",
  "menu:vehicles",
  "menu:cars-public",
  "menu:consultations",
  "menu:sales",
  "menu:quotes",
];

export const CAPABILITIES: Record<UserRole, ReadonlySet<Capability>> = {
  admin: new Set(ALL_CAPABILITIES),
  staff: new Set(STAFF_CAPABILITIES),
  director: new Set(MANAGER_CAPABILITIES),
  team_leader: new Set(MANAGER_CAPABILITIES),
  dealer: new Set(DEALER_CAPABILITIES),
  pending: new Set([]),
};

// ────────────────────────────────────────────────────────────
// 헬퍼 함수
// ────────────────────────────────────────────────────────────

/**
 * 역할이 특정 capability를 가지는지 검사.
 *
 * @example
 * if (!can(user.role, "sales:write:cancel")) throw new AuthError("FORBIDDEN", "...");
 */
export function can(
  role: UserRole | null | undefined,
  capability: Capability,
): boolean {
  if (!role) return false;
  return CAPABILITIES[role].has(capability);
}

export type DataScope = "all" | "subordinate" | "self" | "none";

export type ScopedDomain =
  | "consultations"
  | "sales"
  | "contracts"
  | "commissions"
  | "quotes";

/**
 * 도메인별 데이터 스코프 (가장 큰 권한 우선).
 *
 * API 라우트에서 GET 쿼리 필터링 시 사용:
 *   const scope = dataScope(user.role, "sales");
 *   if (scope === "self")        query = query.eq("dealer_id", user.id);
 *   else if (scope === "subordinate") query = query.in("dealer_id", subordinateIds);
 *   else if (scope === "none")   throw new AuthError("FORBIDDEN", ...);
 *   // "all" 인 경우 필터 없음
 */
export function dataScope(
  role: UserRole | null | undefined,
  domain: ScopedDomain,
): DataScope {
  if (!role) return "none";
  if (can(role, `${domain}:read:all` as Capability)) return "all";
  if (can(role, `${domain}:read:subordinate` as Capability)) return "subordinate";
  if (can(role, `${domain}:read:self` as Capability)) return "self";
  return "none";
}

// 테스트와 SQL 동기화 검증에서 사용
export const ALL_CAPABILITIES_LIST = ALL_CAPABILITIES;
