import { NextRequest, NextResponse } from "next/server";

import { createServiceClient } from "@/lib/supabase/server";
import { callGasWebhookOnce } from "@/src/lib/gas-webhook";

/**
 * GAS 웹훅 재시도 Cron.
 *
 * 호출 경로:
 *   Vercel Cron(1분 간격) → GET /api/cron/gas-retry
 *   Authorization: Bearer ${CRON_SECRET} 헤더가 일치할 때만 실행.
 *
 * 동작:
 *   1) gas_failures 에서 status='pending' 인 행을 created_at 오름차순으로 BATCH_SIZE 만큼 가져온다.
 *   2) 각 행을 callGasWebhookOnce(payload, RETRY_TIMEOUT_MS) 로 재호출.
 *   3) 성공 → status='succeeded', last_attempt_at 갱신.
 *   4) 실패 → retry_count + 1, last_error 갱신.
 *      retry_count 가 MAX_RETRIES 에 도달하면 status='dead' 로 격리.
 *
 * 주의:
 *   - Vercel Cron 은 같은 라우트가 진행 중이어도 다음 분에 또 호출한다 (중첩 실행).
 *     batch 가 작고 각 fetch 가 RETRY_TIMEOUT_MS 안에 끝나도록 보장.
 *   - GAS 응답이 17분 걸리는 케이스 (2026-05-06 박우빈 건) 가 다시 와도 fetch 는 abort 되며
 *     retry_count 만 증가. 5 분 후 dead 로 가서 운영자가 수동 처리.
 */

// 한 번 실행에 처리할 최대 행 수.
const BATCH_SIZE = 25;

// 재시도 시 GAS 응답 대기 시간. 본 호출(5초)보다 다소 길게.
// Vercel Cron 인스턴스가 중첩되더라도 25 * 15s = 375s 로 다음 분 cron 이전 종료 가능.
const RETRY_TIMEOUT_MS = 15_000;

// 이 횟수만큼 실패하면 dead 로 격리. 운영자가 어드민에서 수동 확인.
const MAX_RETRIES = 5;

interface GasFailureRow {
  id: string;
  label: string;
  payload: Record<string, unknown>;
  retry_count: number;
}

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // ── 1. Vercel Cron 인증 ──
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // ── 2. pending 행 조회 ──
  const sc = createServiceClient();
  const { data: rows, error: selectError } = await sc
    .from("gas_failures")
    .select("id, label, payload, retry_count")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (selectError) {
    console.error("[cron:gas-retry] select 실패:", selectError.message);
    return NextResponse.json({ error: "select failed" }, { status: 500 });
  }

  const pending = (rows ?? []) as GasFailureRow[];

  if (pending.length === 0) {
    return NextResponse.json({ processed: 0, succeeded: 0, failed: 0, dead: 0 });
  }

  // ── 3. 각 행 재시도 ──
  let succeeded = 0;
  let failed = 0;
  let dead = 0;

  for (const row of pending) {
    const result = await callGasWebhookOnce(row.payload, RETRY_TIMEOUT_MS);
    const now = new Date().toISOString();

    if (!result.ok) {
      const errorMessage = result.error;
      const nextRetryCount = row.retry_count + 1;
      const willDie = nextRetryCount >= MAX_RETRIES;

      const { error } = await sc
        .from("gas_failures")
        .update({
          retry_count: nextRetryCount,
          last_error: errorMessage,
          last_attempt_at: now,
          status: willDie ? "dead" : "pending",
        })
        .eq("id", row.id);

      if (error) {
        console.error(
          `[cron:gas-retry] failed update 실패 id=${row.id}:`,
          error.message,
        );
      }

      if (willDie) {
        console.error(
          `[cron:gas-retry] DEAD label=${row.label} id=${row.id} reason=${errorMessage}`,
        );
        dead += 1;
      } else {
        failed += 1;
      }
      continue;
    }

    const { error } = await sc
      .from("gas_failures")
      .update({
        status: "succeeded",
        last_attempt_at: now,
        last_error: null,
      })
      .eq("id", row.id);

    if (error) {
      console.error(
        `[cron:gas-retry] succeeded update 실패 id=${row.id}:`,
        error.message,
      );
    }
    succeeded += 1;
  }

  return NextResponse.json({
    processed: pending.length,
    succeeded,
    failed,
    dead,
  });
}
