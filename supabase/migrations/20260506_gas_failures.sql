-- =============================================================
-- 20260506_gas_failures.sql
-- GAS 웹훅 호출 실패 큐 — 5초 타임아웃/네트워크 오류 시 페이로드 보존 + Cron 재시도.
--
-- 배경:
--   2026-05-06 박우빈 상담 건에서 GAS 응답이 17분 지연되어 Vercel 5초 timeout 으로 abort.
--   현재 src/lib/gas-webhook.ts 는 실패를 console.error 로만 기록하고 페이로드를 흘림.
--   결과: 영업팀 Sheets/알림이 누락되어 응대 실패.
--
-- 설계:
--   - 실패한 호출의 (label, payload, last_error) 를 행으로 보존
--   - retry_count 5 회까지 Cron 이 재시도 → 그 후 dead 로 격리
--   - 인덱스: status='pending' 부분 인덱스로 Cron 스캔 비용 최소화
--   - RLS: admin/staff SELECT 만, INSERT/UPDATE 는 service_role 전용 (RLS bypass)
-- =============================================================

CREATE TYPE gas_failure_status AS ENUM ('pending', 'succeeded', 'dead');

CREATE TABLE gas_failures (
    id              UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
    label           TEXT                NOT NULL,
    payload         JSONB               NOT NULL,
    retry_count     INTEGER             NOT NULL DEFAULT 0,
    status          gas_failure_status  NOT NULL DEFAULT 'pending',
    last_error      TEXT,
    created_at      TIMESTAMPTZ         NOT NULL DEFAULT now(),
    last_attempt_at TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ         NOT NULL DEFAULT now()
);

COMMENT ON TABLE  gas_failures             IS 'GAS 웹훅 호출 실패 큐. Cron 이 pending 행을 재시도; 5회 실패 시 dead.';
COMMENT ON COLUMN gas_failures.label       IS 'gas-webhook 호출자 식별 태그 (예: consultations/submit, contract-sign).';
COMMENT ON COLUMN gas_failures.payload     IS '원본 POST 본문. 재시도 시 그대로 전송.';
COMMENT ON COLUMN gas_failures.retry_count IS 'Cron 재시도 누적 횟수. 5 도달 후 다음 실패는 dead 전환.';
COMMENT ON COLUMN gas_failures.status      IS 'pending → succeeded | dead. dead 는 운영자가 수동 확인 필요.';

-- Cron 스캔용 부분 인덱스 (pending 만)
CREATE INDEX idx_gas_failures_pending
    ON gas_failures (created_at)
    WHERE status = 'pending';

-- 운영자 진단용 (label 별 dead 추세)
CREATE INDEX idx_gas_failures_label_status
    ON gas_failures (label, status, created_at DESC);

-- updated_at 자동 갱신 (002_triggers.sql 의 update_updated_at 재사용)
CREATE TRIGGER trg_gas_failures_updated_at
    BEFORE UPDATE ON gas_failures
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- RLS: admin/staff 만 SELECT, write 는 service_role bypass
ALTER TABLE gas_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY gas_failures_select_admin_staff ON gas_failures
    FOR SELECT TO authenticated
    USING (public.user_role() IN ('admin', 'staff'));
