import { describe, expect, test } from "vitest";
import {
  CAPABILITIES,
  ALL_CAPABILITIES_LIST,
  can,
  dataScope,
  type Capability,
} from "./capabilities";
import type { UserRole } from "@/types/database";

const ROLES: UserRole[] = [
  "admin",
  "staff",
  "director",
  "team_leader",
  "dealer",
  "pending",
];

describe("CAPABILITIES matrix exhaustiveness", () => {
  test("every UserRole has a defined capability set", () => {
    for (const role of ROLES) {
      expect(CAPABILITIES[role]).toBeDefined();
      expect(CAPABILITIES[role]).toBeInstanceOf(Set);
    }
  });

  test("admin holds every capability", () => {
    for (const cap of ALL_CAPABILITIES_LIST) {
      expect(can("admin", cap)).toBe(true);
    }
  });

  test("pending holds zero capabilities", () => {
    expect(CAPABILITIES.pending.size).toBe(0);
    for (const cap of ALL_CAPABILITIES_LIST) {
      expect(can("pending", cap)).toBe(false);
    }
  });

  test("null/undefined role yields false for any capability", () => {
    expect(can(null, "sales:read:all")).toBe(false);
    expect(can(undefined, "consultations:write:status")).toBe(false);
  });
});

describe("can() — domain access", () => {
  test("dealer can only read self-scope, not subordinate or all", () => {
    expect(can("dealer", "sales:read:self")).toBe(true);
    expect(can("dealer", "sales:read:subordinate")).toBe(false);
    expect(can("dealer", "sales:read:all")).toBe(false);
  });

  test("director/team_leader can read subordinate, not all", () => {
    expect(can("director", "consultations:read:subordinate")).toBe(true);
    expect(can("director", "consultations:read:all")).toBe(false);
    expect(can("team_leader", "sales:read:subordinate")).toBe(true);
    expect(can("team_leader", "sales:read:all")).toBe(false);
  });

  test("staff cannot manage users / audit logs / vehicle-models", () => {
    expect(can("staff", "users:write")).toBe(false);
    expect(can("staff", "audit-logs:read")).toBe(false);
    expect(can("staff", "team-structure:manage")).toBe(false);
    expect(can("staff", "vehicle-models:write")).toBe(true); // staff는 차량 모델 관리 가능 (admin/staff)
  });

  test("dealer cannot access expenses or documents", () => {
    expect(can("dealer", "expenses:read")).toBe(false);
    expect(can("dealer", "documents:read")).toBe(false);
  });

  test("manager (director/team_leader) can access expenses/documents", () => {
    expect(can("director", "expenses:read")).toBe(true);
    expect(can("director", "expenses:write")).toBe(true);
    expect(can("team_leader", "documents:write")).toBe(true);
  });
});

describe("can() — menu visibility", () => {
  test("admin sees all 13 menu items", () => {
    const menuCaps = ALL_CAPABILITIES_LIST.filter((c) => c.startsWith("menu:"));
    for (const m of menuCaps) {
      expect(can("admin", m)).toBe(true);
    }
  });

  test("dealer sees only 6 menu items", () => {
    const dealerMenus = ALL_CAPABILITIES_LIST.filter(
      (c): c is Capability => c.startsWith("menu:") && can("dealer", c),
    );
    expect(dealerMenus.length).toBe(6);
  });

  test("manager sees no admin menus (users/team-structure/audit-logs/vehicle-models)", () => {
    expect(can("director", "menu:users")).toBe(false);
    expect(can("director", "menu:team-structure")).toBe(false);
    expect(can("director", "menu:audit-logs")).toBe(false);
    expect(can("director", "menu:vehicle-models")).toBe(false);
  });

  test("pending sees zero menus", () => {
    const pendingMenus = ALL_CAPABILITIES_LIST.filter(
      (c) => c.startsWith("menu:") && can("pending", c),
    );
    expect(pendingMenus.length).toBe(0);
  });
});

describe("dataScope() — data filtering", () => {
  test("admin/staff get 'all' scope", () => {
    expect(dataScope("admin", "sales")).toBe("all");
    expect(dataScope("admin", "consultations")).toBe("all");
    expect(dataScope("staff", "sales")).toBe("all");
  });

  test("director/team_leader get 'subordinate' scope", () => {
    expect(dataScope("director", "sales")).toBe("subordinate");
    expect(dataScope("director", "consultations")).toBe("subordinate");
    expect(dataScope("team_leader", "contracts")).toBe("subordinate");
    expect(dataScope("team_leader", "commissions")).toBe("subordinate");
  });

  test("dealer gets 'self' scope", () => {
    expect(dataScope("dealer", "sales")).toBe("self");
    expect(dataScope("dealer", "consultations")).toBe("self");
    expect(dataScope("dealer", "quotes")).toBe("self");
  });

  test("pending gets 'none' scope", () => {
    expect(dataScope("pending", "sales")).toBe("none");
    expect(dataScope("pending", "consultations")).toBe("none");
  });

  test("null/undefined yields 'none'", () => {
    expect(dataScope(null, "sales")).toBe("none");
    expect(dataScope(undefined, "consultations")).toBe("none");
  });
});

// ────────────────────────────────────────────────────────────
// 사고 회귀 테스트 — 본 SSOT 도입 전에 발생한 P0 사고가 재발하지 않음을 박제
// ────────────────────────────────────────────────────────────

describe("regression: incidents from git history", () => {
  test("hotfix 268d6c5 — director/team_leader 상담 권한이 산하로만 한정되어야", () => {
    // 사고: RLS 우회로 본부 외 데이터까지 조회
    expect(dataScope("director", "consultations")).toBe("subordinate");
    expect(dataScope("team_leader", "consultations")).toBe("subordinate");
    expect(can("director", "consultations:read:all")).toBe(false);
  });

  test("hotfix 5928926 — dealer가 타인 계약서 접근 차단", () => {
    expect(can("dealer", "contracts:read:self")).toBe(true);
    expect(can("dealer", "contracts:read:all")).toBe(false);
    expect(can("dealer", "contracts:read:subordinate")).toBe(false);
  });

  test("hotfix 122de1a — manager에게 미배정 상담 노출 (subordinate scope)", () => {
    expect(can("director", "consultations:read:subordinate")).toBe(true);
    expect(can("team_leader", "consultations:read:subordinate")).toBe(true);
  });

  test("hotfix 854a369 — manager에게 영업 핵심 기능(sales/quotes/settlements)", () => {
    expect(can("director", "sales:read:subordinate")).toBe(true);
    expect(can("director", "quotes:read:subordinate")).toBe(true);
    expect(can("director", "menu:settlements")).toBe(true);
    expect(can("team_leader", "menu:expenses")).toBe(true);
  });

  test("hotfix c2c9ee3 — UserRole 타입에 'none' 부재", () => {
    // CAPABILITIES는 UserRole만 키로 가짐 (none 미포함)
    const keys = Object.keys(CAPABILITIES) as UserRole[];
    expect(keys).not.toContain("none");
    expect(keys.sort()).toEqual(
      ["admin", "dealer", "director", "pending", "staff", "team_leader"].sort(),
    );
  });

  test("hotfix 7fbff1f — pending 사용자는 어떤 권한도 없음", () => {
    for (const cap of ALL_CAPABILITIES_LIST) {
      expect(can("pending", cap)).toBe(false);
    }
  });
});
