#!/usr/bin/env tsx
/**
 * API 라우트 RBAC 가드 정합성 lint.
 *
 * 검사:
 *   1) `app/api/**\/route.ts` 가 `createServiceClient()` 를 사용하면서
 *      `dataScope`/`requireCapability`/`requireRole` 중 하나도 호출하지 않으면 FAIL.
 *   2) 직접 `user.role === "..."` 비교 → WARN (capability/dataScope 권장).
 *
 * 화이트리스트:
 *   - 공개 라우트 (cron, 공개 토큰 기반): 명시적 면책.
 *
 * 신규 ESLint 9 flat config 커스텀 룰 작성은 무거우므로 가벼운 정적 분석으로 대체.
 * pre-commit 또는 CI에서 실행.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const API_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  "app",
  "api",
);

// 가드 검사 면책 라우트 (공개/cron/내부 시스템 또는 RPC 자체 검사)
const EXEMPT_PATHS = [
  "consultations/submit",
  "auth/login",
  "auth/logout",
  "auth/reset-password",
  "cron/",
  "quotes/[token]",
  "contracts/sign/[token]",
  "contracts/public-pdf/",
  "vehicle-models/public", // 공개 카탈로그
  "dashboard/route.ts", // SECURITY DEFINER RPC (get_dashboard_stats)에 검사 위임
  "profile/route.ts", // verifyUser만으로 본인 데이터 조회/수정 충분
  "documents/[id]/file-url", // 자체 권한 검사 + signed URL 짧은 만료
];

interface Issue {
  file: string;
  severity: "error" | "warn";
  message: string;
}

async function* walk(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir);
  for (const entry of entries) {
    const full = path.join(dir, entry);
    const s = await stat(full);
    if (s.isDirectory()) {
      yield* walk(full);
    } else if (entry === "route.ts") {
      yield full;
    }
  }
}

function relPath(absolute: string): string {
  return path.relative(path.resolve(API_DIR, "..", ".."), absolute);
}

function isExempt(file: string): boolean {
  return EXEMPT_PATHS.some((p) => file.includes(p));
}

function checkFile(file: string, source: string): Issue[] {
  const issues: Issue[] = [];

  if (isExempt(file)) return issues;

  const usesServiceClient = /createServiceClient\s*\(/.test(source);
  const hasGuard =
    /requireCapability\s*\(/.test(source) ||
    /requireRole\s*\(/.test(source) ||
    /dataScope\s*\(/.test(source) ||
    /\bcan\s*\(\s*user\.role\s*,/.test(source);

  if (usesServiceClient && !hasGuard) {
    issues.push({
      file: relPath(file),
      severity: "error",
      message:
        "service_role 사용 라우트에 가드(requireCapability/requireRole/dataScope) 없음 — RLS 우회 위험",
    });
  }

  // user.role === 직접 비교는 warn — capability/dataScope 권장
  const directRoleCompare =
    /user\.role\s*===\s*['"](admin|staff|director|team_leader|dealer|pending)['"]/g;
  const matches = source.match(directRoleCompare);
  if (matches && matches.length > 0) {
    issues.push({
      file: relPath(file),
      severity: "warn",
      message: `직접 user.role 비교 ${matches.length}건 — can()/dataScope() 권장`,
    });
  }

  return issues;
}

async function main() {
  const allIssues: Issue[] = [];
  let fileCount = 0;

  for await (const file of walk(API_DIR)) {
    fileCount++;
    const src = await readFile(file, "utf8");
    allIssues.push(...checkFile(file, src));
  }

  const errors = allIssues.filter((i) => i.severity === "error");
  const warns = allIssues.filter((i) => i.severity === "warn");

  if (errors.length === 0 && warns.length === 0) {
    console.log(
      `[rbac-guards] ${fileCount}개 라우트 검사 — 모두 통과. PASS.`,
    );
    return;
  }

  if (errors.length > 0) {
    console.error(`[rbac-guards] ERROR ${errors.length}건:\n`);
    for (const issue of errors) {
      console.error(`  ✗ ${issue.file}`);
      console.error(`    ${issue.message}\n`);
    }
  }

  if (warns.length > 0) {
    console.warn(`[rbac-guards] WARN ${warns.length}건:\n`);
    for (const issue of warns) {
      console.warn(`  ⚠ ${issue.file}`);
      console.warn(`    ${issue.message}\n`);
    }
  }

  if (errors.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[rbac-guards] 실행 중 에러:", err);
  process.exit(1);
});
