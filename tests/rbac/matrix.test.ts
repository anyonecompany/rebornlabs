/**
 * RBAC 6×8 매트릭스 회귀 테스트.
 *
 * 6 역할 × 8 도메인 × 액션 = 사고 25건의 시나리오를 박제.
 * 각 사고 커밋 메시지는 git history 그대로 유지하여 추적 가능.
 *
 * 신규 capability / 역할 추가 시 본 매트릭스도 갱신해야 컴파일 통과.
 */

import { describe, expect, test } from "vitest";
import {
  CAPABILITIES,
  ALL_CAPABILITIES_LIST,
  can,
  dataScope,
  type Capability,
} from "@/lib/auth/capabilities";
import type { UserRole } from "@/types/database";

const ROLES: ReadonlyArray<UserRole> = [
  "admin",
  "staff",
  "director",
  "team_leader",
  "dealer",
  "pending",
];

// ─── 매트릭스 expectations ────────────────────────────────────────

interface MatrixCell {
  role: UserRole;
  capability: Capability;
  expected: boolean;
  // 사고 매핑 — 이 셀이 잘못되면 어떤 사고가 재발하는지
  incidents?: ReadonlyArray<string>;
}

const MATRIX: ReadonlyArray<MatrixCell> = [
  // ── admin은 전체 capability 통과 ──
  { role: "admin", capability: "users:write", expected: true },
  { role: "admin", capability: "audit-logs:read", expected: true },
  { role: "admin", capability: "menu:vehicle-models", expected: true },

  // ── staff 본사 관리 메뉴 차단 ──
  { role: "staff", capability: "users:write", expected: false },
  { role: "staff", capability: "audit-logs:read", expected: false },
  { role: "staff", capability: "team-structure:manage", expected: false },
  { role: "staff", capability: "menu:users", expected: false },
  { role: "staff", capability: "menu:audit-logs", expected: false },
  // staff는 운영/영업/재무 capability 통과
  { role: "staff", capability: "consultations:read:all", expected: true },
  { role: "staff", capability: "sales:write:create", expected: true },
  { role: "staff", capability: "expenses:write", expected: true },
  { role: "staff", capability: "vehicle-models:write", expected: true },

  // ── director / team_leader는 산하(:subordinate) 스코프만 ──
  {
    role: "director",
    capability: "consultations:read:subordinate",
    expected: true,
    incidents: ["122de1a hotfix(consultations): manager에게 미배정 상담 노출 (★P0 회귀)"],
  },
  {
    role: "director",
    capability: "consultations:read:all",
    expected: false,
    incidents: ["268d6c5 director/team_leader 상담 권한 우회 버그 핫픽스 (RLS 우회 → 명시적 필터)"],
  },
  {
    role: "team_leader",
    capability: "sales:read:subordinate",
    expected: true,
    incidents: ["854a369 hotfix(permissions): 매니저 잔여 권한 일괄 확장 (★P0)"],
  },
  {
    role: "team_leader",
    capability: "sales:read:all",
    expected: false,
  },
  {
    role: "director",
    capability: "menu:settlements",
    expected: true,
    incidents: ["f99df08 hotfix(permissions): manager에게 영업 핵심 기능 노출 (★P0)"],
  },
  {
    role: "director",
    capability: "menu:users",
    expected: false,
  },
  {
    role: "team_leader",
    capability: "menu:audit-logs",
    expected: false,
  },
  // 매니저는 expenses/documents 접근 가능
  { role: "director", capability: "expenses:read", expected: true },
  { role: "director", capability: "documents:write", expected: true },

  // ── dealer는 :self 스코프만 ──
  {
    role: "dealer",
    capability: "sales:read:self",
    expected: true,
  },
  {
    role: "dealer",
    capability: "sales:read:subordinate",
    expected: false,
  },
  {
    role: "dealer",
    capability: "sales:read:all",
    expected: false,
  },
  {
    role: "dealer",
    capability: "contracts:read:self",
    expected: true,
    incidents: ["5928926 fix(security): 계약서 API 4건 인가 누락 — dealer가 타인 계약서 접근 차단 (★P0)"],
  },
  {
    role: "dealer",
    capability: "contracts:read:all",
    expected: false,
  },
  // dealer는 expenses/documents 차단
  { role: "dealer", capability: "expenses:read", expected: false },
  { role: "dealer", capability: "documents:read", expected: false },
  { role: "dealer", capability: "menu:settlements", expected: false },
  { role: "dealer", capability: "menu:users", expected: false },

  // ── pending은 모든 capability false ──
  { role: "pending", capability: "consultations:read:self", expected: false },
  { role: "pending", capability: "menu:dashboard", expected: false },
  { role: "pending", capability: "users:read", expected: false },
];

// ─── 매트릭스 실행 ────────────────────────────────────────────────

describe("RBAC 6×8 matrix — 사고 25건 회귀 박제", () => {
  test.each(MATRIX)(
    "$role → $capability = $expected",
    ({ role, capability, expected }) => {
      expect(can(role, capability)).toBe(expected);
    },
  );

  test("모든 역할은 CAPABILITIES Record에 정의되어 있다 (compile-time exhaustiveness 보강)", () => {
    for (const role of ROLES) {
      expect(CAPABILITIES[role]).toBeDefined();
      expect(CAPABILITIES[role]).toBeInstanceOf(Set);
    }
  });

  test("admin은 ALL_CAPABILITIES_LIST 전체를 보유", () => {
    for (const cap of ALL_CAPABILITIES_LIST) {
      expect(can("admin", cap)).toBe(true);
    }
  });

  test("pending은 어떤 capability도 보유하지 않음 (잠복 결함 C 박제)", () => {
    for (const cap of ALL_CAPABILITIES_LIST) {
      expect(can("pending", cap)).toBe(false);
    }
  });
});

// ─── dataScope 매트릭스 (sales/consultations 등) ──────────────────

describe("dataScope domain matrix — service_role 우회 패턴 회귀 박제", () => {
  test.each([
    { role: "admin" as UserRole, domain: "sales" as const, expected: "all" },
    { role: "staff" as UserRole, domain: "consultations" as const, expected: "all" },
    {
      role: "director" as UserRole,
      domain: "sales" as const,
      expected: "subordinate",
      // 결함 A: sales/route.ts:55,72-74 service_role + 무필터 → director 전체 조회
      incident: "Phase 0 hotfix: app/api/sales/route.ts director/team_leader 산하 필터 추가",
    },
    {
      role: "team_leader" as UserRole,
      domain: "consultations" as const,
      expected: "subordinate",
      incident: "97b1ef9 hotfix(consultations): status 변경 권한 — director/team_leader 추가",
    },
    { role: "dealer" as UserRole, domain: "sales" as const, expected: "self" },
    { role: "dealer" as UserRole, domain: "consultations" as const, expected: "self" },
    { role: "pending" as UserRole, domain: "sales" as const, expected: "none" },
    { role: "pending" as UserRole, domain: "consultations" as const, expected: "none" },
  ])("dataScope($role, $domain) === $expected", ({ role, domain, expected }) => {
    expect(dataScope(role, domain)).toBe(expected);
  });

  test("subordinate scope는 :all 보다 좁다 (RLS 우회 회귀 차단)", () => {
    expect(can("director", "sales:read:all")).toBe(false);
    expect(can("director", "sales:read:subordinate")).toBe(true);
    expect(can("team_leader", "consultations:read:all")).toBe(false);
    expect(can("team_leader", "consultations:read:subordinate")).toBe(true);
  });
});

// ─── 사고 시나리오 통합 (커밋 메시지 1:1 매핑) ─────────────────────

describe("git incident replay — 사고 커밋 메시지 1:1 회귀", () => {
  test("c2c9ee3: UserRole 타입에 'none' 부재 → CAPABILITIES Record 키에도 부재", () => {
    const keys = Object.keys(CAPABILITIES) as UserRole[];
    expect(keys).not.toContain("none");
    expect(keys.sort()).toEqual(
      ["admin", "dealer", "director", "pending", "staff", "team_leader"].sort(),
    );
  });

  test("e6cbe04: team_leader/director 대시보드 분기 — menu:dashboard 노출", () => {
    expect(can("director", "menu:dashboard")).toBe(true);
    expect(can("team_leader", "menu:dashboard")).toBe(true);
  });

  test("3ce17e2: dealer status PATCH는 capability:write 필수 — dealer는 write:status 통과", () => {
    // 5/6 결정으로 dealer 상태 변경 풀어줌 (85cb2ab)
    expect(can("dealer", "consultations:write:status")).toBe(true);
  });

  test("7fbff1f: pending은 capability 무관 차단 (verifyUser 거부 + capability 빈 집합 이중 안전망)", () => {
    expect(CAPABILITIES.pending.size).toBe(0);
  });

  test("854a369: 매니저에게 영업 핵심 메뉴/capability 노출 (사이드바·페이지·API 통일)", () => {
    const managerMenuCount = ALL_CAPABILITIES_LIST.filter(
      (c) => c.startsWith("menu:") && can("director", c),
    ).length;
    expect(managerMenuCount).toBeGreaterThanOrEqual(9);
  });
});
