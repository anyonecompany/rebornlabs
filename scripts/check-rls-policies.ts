#!/usr/bin/env tsx
/**
 * RLS 정책 정합성 lint.
 *
 * supabase/migrations/*.sql 의 신규 CREATE POLICY 가:
 *   1) `has_capability(...)` 기반(SSOT 통합) 또는
 *   2) 명시적 모든 6 역할(admin/staff/director/team_leader/dealer/pending) 검사
 * 중 하나를 만족하는지 확인.
 *
 * 미달 시 exit 1 + 위치/이유 출력.
 *
 * 신규 RLS 정책 추가 시 본 lint를 통과해야 PR 머지 가능 (CI 통합).
 *
 * 검출 대상:
 *   - 단일 역할만 검사하고 다른 역할 정책이 없는 신규 마이그레이션
 *   - capability 기반이 아닌 직접 역할 비교 (`role = 'admin'` 등)
 *
 * 면책 (legacy):
 *   - 본 lint 도입 전 (2026-05-07 이전) 마이그레이션은 검사 제외.
 *   - LEGACY_BASELINE_DATE 이후 마이그레이션만 검사.
 */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const MIGRATIONS_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  "supabase",
  "migrations",
);

// 본 lint 도입 시점 — 이 날짜 이후 마이그레이션만 검사 (legacy 제외)
const LEGACY_BASELINE_DATE = "20260507";

const ALL_ROLES = [
  "admin",
  "staff",
  "director",
  "team_leader",
  "dealer",
  "pending",
] as const;

interface PolicyIssue {
  file: string;
  policyName: string;
  reason: string;
}

function extractPolicies(sql: string): Array<{ name: string; body: string }> {
  // 단순 정규식 — `CREATE POLICY <name> ON <table>` 캡처. 본문은 다음 정책/끝까지.
  const regex = /CREATE\s+POLICY\s+([a-zA-Z0-9_]+)\s+ON\s+\w[\w.]*[\s\S]*?(?=CREATE\s+POLICY|\Z|;)/gi;
  const policies: Array<{ name: string; body: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(sql)) !== null) {
    policies.push({ name: m[1], body: m[0] });
  }
  return policies;
}

function checkPolicy(
  file: string,
  policy: { name: string; body: string },
): PolicyIssue | null {
  const body = policy.body;

  // 1) capability 기반 정책 — has_capability() 호출 포함 → PASS
  if (/has_capability\s*\(/i.test(body)) {
    return null;
  }

  // 2) 6개 역할 모두 명시 검사 → PASS (legacy 호환)
  const allRolesMentioned = ALL_ROLES.every((role) =>
    new RegExp(`\\b${role}\\b`, "i").test(body),
  );
  if (allRolesMentioned) {
    return null;
  }

  // 3) auth/system 정책 (anon, service_role 등 — capability 무관) → PASS
  if (
    /TO\s+anon\b/i.test(body) ||
    /TO\s+service_role\b/i.test(body) ||
    /TO\s+postgres\b/i.test(body)
  ) {
    return null;
  }

  // 4) WITH CHECK (false) 같은 명시적 차단 → PASS
  if (/WITH\s+CHECK\s*\(\s*false\s*\)/i.test(body)) {
    return null;
  }

  // 그 외 — 일부 역할만 다루는 정책 → FAIL
  const mentionedRoles = ALL_ROLES.filter((role) =>
    new RegExp(`\\b${role}\\b`, "i").test(body),
  );
  return {
    file,
    policyName: policy.name,
    reason: `정책이 ${mentionedRoles.length}/6 역할만 다룹니다 (${
      mentionedRoles.join(", ") || "0"
    }). has_capability() 사용 또는 6개 역할 모두 명시하세요.`,
  };
}

async function main() {
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => {
      // YYYYMMDD_*.sql 형식만 검사. 그 미만 (001_, 002_ 등 legacy)은 제외.
      const match = f.match(/^(\d{8})_/);
      if (!match) return false;
      return match[1] >= LEGACY_BASELINE_DATE;
    })
    .sort();

  if (files.length === 0) {
    console.log(
      `[rls-lint] 검사할 신규 마이그레이션 없음 (>= ${LEGACY_BASELINE_DATE}). PASS.`,
    );
    return;
  }

  const issues: PolicyIssue[] = [];

  for (const file of files) {
    const fullPath = path.join(MIGRATIONS_DIR, file);
    const sql = await readFile(fullPath, "utf8");
    const policies = extractPolicies(sql);

    for (const policy of policies) {
      const issue = checkPolicy(file, policy);
      if (issue) issues.push(issue);
    }
  }

  if (issues.length === 0) {
    console.log(
      `[rls-lint] ${files.length}개 마이그레이션 검사 — 모든 정책이 capability 기반 또는 6개 역할 모두 명시. PASS.`,
    );
    return;
  }

  console.error(`[rls-lint] FAIL — ${issues.length}건 위반:\n`);
  for (const issue of issues) {
    console.error(`  ✗ ${issue.file} :: ${issue.policyName}`);
    console.error(`    ${issue.reason}\n`);
  }
  console.error(
    "해결: lib/auth/capabilities.ts에 capability 추가 + has_capability() SQL 함수에 매핑 + 정책에서 (SELECT has_capability(...)) 호출.",
  );
  process.exit(1);
}

main().catch((err) => {
  console.error("[rls-lint] 실행 중 에러:", err);
  process.exit(1);
});
