/**
 * TS CAPABILITIES ↔ SQL has_capability() 정합 통합 테스트.
 *
 * 실행 조건:
 *   - 로컬 Supabase 인스턴스 가동 (`supabase start`)
 *   - 환경변수: SUPABASE_TEST_URL, SUPABASE_TEST_SERVICE_ROLE_KEY
 *
 * 환경변수 미설정 시 자동 skip (로컬/CI 모두 안전).
 *
 * 검증:
 *   6 역할 × 모든 capability 조합(=300+ 케이스)에서
 *   `can(role, cap)` (TS) === `has_capability(role, cap)` (SQL)
 */

import { describe, expect, test, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  CAPABILITIES,
  ALL_CAPABILITIES_LIST,
  can,
  type Capability,
} from "@/lib/auth/capabilities";
import type { UserRole } from "@/types/database";

const TEST_URL = process.env.SUPABASE_TEST_URL;
const TEST_KEY = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const ENABLED = Boolean(TEST_URL && TEST_KEY);

const ROLES: UserRole[] = [
  "admin",
  "staff",
  "director",
  "team_leader",
  "dealer",
  "pending",
];

describe.skipIf(!ENABLED)("TS CAPABILITIES ↔ SQL has_capability() sync", () => {
  let client: SupabaseClient;

  beforeAll(() => {
    client = createClient(TEST_URL!, TEST_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });

  test.each(ROLES)(
    "role=%s — TS can() and SQL has_capability() return identical results for all capabilities",
    async (role) => {
      const mismatches: Array<{ cap: Capability; ts: boolean; sql: boolean }> = [];

      for (const cap of ALL_CAPABILITIES_LIST) {
        const tsResult = can(role, cap);
        const { data, error } = await client.rpc("has_capability" as never, {
          p_role: role,
          p_capability: cap,
        } as never);

        if (error) {
          throw new Error(`SQL has_capability RPC error for (${role}, ${cap}): ${error.message}`);
        }

        const sqlResult = data as unknown as boolean;
        if (tsResult !== sqlResult) {
          mismatches.push({ cap, ts: tsResult, sql: sqlResult });
        }
      }

      if (mismatches.length > 0) {
        const msg = mismatches
          .map((m) => `  ${m.cap}: TS=${m.ts}, SQL=${m.sql}`)
          .join("\n");
        throw new Error(`Mismatch for role=${role}:\n${msg}`);
      }

      expect(mismatches.length).toBe(0);
    },
  );

  test("CAPABILITIES Record covers every UserRole (compile-time enforced)", () => {
    for (const role of ROLES) {
      expect(CAPABILITIES[role]).toBeDefined();
    }
  });
});

// 환경변수 미설정 시에도 minimum 단위 검증 (TS 자체)
describe("TS-only matrix sanity", () => {
  test("ALL_CAPABILITIES_LIST contains 50+ entries", () => {
    expect(ALL_CAPABILITIES_LIST.length).toBeGreaterThanOrEqual(50);
  });

  test("admin holds the largest capability set", () => {
    const sizes = ROLES.map((r) => ({ role: r, size: CAPABILITIES[r].size }));
    const max = Math.max(...sizes.map((s) => s.size));
    expect(CAPABILITIES.admin.size).toBe(max);
  });

  test("pending holds zero capabilities", () => {
    expect(CAPABILITIES.pending.size).toBe(0);
  });
});
