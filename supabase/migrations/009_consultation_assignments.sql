-- =============================================================
-- 009_consultation_assignments.sql
-- 상담 배정 이력 + 30분 미응답 자동 만료 시스템
--
-- 비즈니스 흐름:
--   1) 외부 폼 제출 → consultations INSERT (status='new')
--   2) 관리자가 딜러 A 배정 → consultation_assignments INSERT
--      (assignment_status='pending', expires_at=now()+30min)
--      → 알림톡: consultation.assigned_to_dealer (딜러 A)
--   3) 30분 내 딜러 A "응대 시작" 클릭 → UPDATE acknowledged_at, status='acknowledged'
--   4) 30분 경과 시 cron이 expires_at < now() AND status='pending' 행을 'expired'로 전환
--      → 알림톡: consultation.timeout_to_admin (관리자)
--   5) 관리자 재배정 → consultation_assignments INSERT (새 row)
--      → 알림톡: consultation.cancelled_to_dealer (딜러 A) + assigned_to_dealer (딜러 B)
--
-- 한 consultation 에 여러 assignment row 가 누적된다 (재배정 이력 보존).
-- 현재 활성 배정의 딜러는 트리거로 consultations.assigned_dealer_id 에 동기화한다.
-- =============================================================

-- =============================================================
-- 1. assignment_status enum
-- =============================================================
CREATE TYPE assignment_status AS ENUM (
    'pending',       -- 배정됨, 딜러 응답 대기
    'acknowledged',  -- 딜러가 응대 시작 클릭
    'expired',       -- 30분 무응답으로 자동 만료
    'cancelled'      -- 관리자가 수동 취소 (재배정 직전)
);

-- =============================================================
-- 2. consultation_assignments 테이블
-- =============================================================
CREATE TABLE consultation_assignments (
    id                 UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
    consultation_id    UUID                NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
    dealer_id          UUID                NOT NULL REFERENCES profiles(id)      ON DELETE RESTRICT,
    assigned_by        UUID                REFERENCES profiles(id) ON DELETE SET NULL, -- 배정한 관리자 (NULL = 시스템)
    assigned_at        TIMESTAMPTZ         NOT NULL DEFAULT now(),
    acknowledged_at    TIMESTAMPTZ,                                                    -- 딜러가 응대 시작한 시각
    expires_at         TIMESTAMPTZ         NOT NULL,                                   -- 30분 만료 기준 시각
    status             assignment_status   NOT NULL DEFAULT 'pending',
    created_at         TIMESTAMPTZ         NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ         NOT NULL DEFAULT now()
);

COMMENT ON TABLE  consultation_assignments              IS '상담 배정 이력. 한 consultation 에 여러 row 누적 가능 (재배정 이력 보존).';
COMMENT ON COLUMN consultation_assignments.assigned_by  IS 'NULL 허용: 시스템 자동 배정 또는 GAS 스크립트 배정 케이스.';
COMMENT ON COLUMN consultation_assignments.expires_at   IS '30분 만료 cron 의 기준 시각. assigned_at + interval ''30 minutes''.';
COMMENT ON COLUMN consultation_assignments.status       IS 'pending → acknowledged | expired | cancelled. 한 consultation 에서 동시에 pending 은 1개만 존재 (트리거 강제).';

-- =============================================================
-- 3. 인덱스
-- =============================================================

-- cron 빠른 조회: 만료 예정 pending 만 빠르게 스캔
CREATE INDEX idx_assignments_pending_expires
    ON consultation_assignments (expires_at)
    WHERE status = 'pending';

-- consultation 기준 이력 조회 (관리자 화면)
CREATE INDEX idx_assignments_consultation
    ON consultation_assignments (consultation_id, assigned_at DESC);

-- 딜러 기준 작업 큐 조회
CREATE INDEX idx_assignments_dealer_pending
    ON consultation_assignments (dealer_id, expires_at)
    WHERE status IN ('pending', 'acknowledged');

-- =============================================================
-- 4. updated_at 자동 갱신 트리거
-- (002_triggers.sql 의 update_updated_at 함수 재사용)
-- =============================================================
CREATE TRIGGER trg_assignments_updated_at
    BEFORE UPDATE ON consultation_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- =============================================================
-- 5. consultation 당 활성 pending 1개만 보장
-- pending 상태에서 새 INSERT 가 들어오면 기존 pending 을 자동 cancelled 로 전환.
-- 재배정 시 관리자 코드가 수동 cancel 처리할 수도 있지만, 안전망으로 트리거 추가.
-- =============================================================
CREATE OR REPLACE FUNCTION cancel_existing_pending_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = 'pending' THEN
        UPDATE consultation_assignments
        SET status = 'cancelled',
            updated_at = now()
        WHERE consultation_id = NEW.consultation_id
          AND id <> NEW.id
          AND status = 'pending';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_assignments_cancel_existing_pending
    AFTER INSERT ON consultation_assignments
    FOR EACH ROW
    EXECUTE FUNCTION cancel_existing_pending_assignment();

-- =============================================================
-- 6. consultations.assigned_dealer_id 동기화 트리거
-- 활성 배정(pending 또는 acknowledged) 중 가장 최신의 dealer_id 를 반영.
-- expired/cancelled 만 남으면 NULL 로 되돌린다.
-- =============================================================
CREATE OR REPLACE FUNCTION sync_consultation_assigned_dealer()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    target_consultation_id UUID;
    active_dealer_id       UUID;
BEGIN
    target_consultation_id := COALESCE(NEW.consultation_id, OLD.consultation_id);

    SELECT dealer_id
      INTO active_dealer_id
      FROM consultation_assignments
     WHERE consultation_id = target_consultation_id
       AND status IN ('pending', 'acknowledged')
     ORDER BY assigned_at DESC
     LIMIT 1;

    UPDATE consultations
    SET assigned_dealer_id = active_dealer_id,
        updated_at         = now()
    WHERE id = target_consultation_id;

    RETURN NULL; -- AFTER 트리거이므로 반환값 무시됨
END;
$$;

CREATE TRIGGER trg_assignments_sync_dealer
    AFTER INSERT OR UPDATE OR DELETE ON consultation_assignments
    FOR EACH ROW
    EXECUTE FUNCTION sync_consultation_assigned_dealer();

-- =============================================================
-- 7. 30분 만료 처리 RPC
-- cron 또는 Vercel/Supabase Edge Function 이 1분 간격으로 호출.
-- 만료된 pending 행을 expired 로 전환하고, 만료된 행 ID 배열을 반환.
-- 호출자가 그 ID 들을 알림톡 큐에 enqueue 한다.
-- =============================================================
CREATE OR REPLACE FUNCTION expire_pending_assignments()
RETURNS TABLE (
    assignment_id    UUID,
    consultation_id  UUID,
    dealer_id        UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    UPDATE consultation_assignments
       SET status     = 'expired',
           updated_at = now()
     WHERE status = 'pending'
       AND expires_at < now()
    RETURNING consultation_assignments.id,
              consultation_assignments.consultation_id,
              consultation_assignments.dealer_id;
END;
$$;

COMMENT ON FUNCTION expire_pending_assignments() IS '30분 만료 cron 진입점. 만료된 행을 expired 로 전환하고 ID/consultation/dealer 를 반환. 호출자가 알림톡 enqueue 책임.';

-- =============================================================
-- 8. RLS — admin/staff 전체 CRUD, dealer 본인 배정만 SELECT/UPDATE(acknowledged_at)
-- =============================================================
ALTER TABLE consultation_assignments ENABLE ROW LEVEL SECURITY;

-- admin/staff: 전체 SELECT
CREATE POLICY assignments_select_admin_staff ON consultation_assignments
    FOR SELECT TO authenticated
    USING (public.user_role() IN ('admin', 'staff'));

-- dealer: 본인 배정만 SELECT
CREATE POLICY assignments_select_dealer ON consultation_assignments
    FOR SELECT TO authenticated
    USING (public.user_role() = 'dealer' AND dealer_id = auth.uid());

-- admin/staff: INSERT (배정)
CREATE POLICY assignments_insert_admin_staff ON consultation_assignments
    FOR INSERT TO authenticated
    WITH CHECK (public.user_role() IN ('admin', 'staff'));

-- admin/staff: UPDATE (수동 취소, 재배정 등)
CREATE POLICY assignments_update_admin_staff ON consultation_assignments
    FOR UPDATE TO authenticated
    USING (public.user_role() IN ('admin', 'staff'));

-- dealer: 본인 배정의 acknowledged_at/status 만 UPDATE (응대 시작)
CREATE POLICY assignments_update_dealer_acknowledge ON consultation_assignments
    FOR UPDATE TO authenticated
    USING (
        public.user_role() = 'dealer'
        AND dealer_id = auth.uid()
        AND status = 'pending'
    )
    WITH CHECK (
        public.user_role() = 'dealer'
        AND dealer_id = auth.uid()
        AND status = 'acknowledged'
    );

-- 시스템(service_role)은 RLS bypass 이므로 cron RPC 호출 시 추가 정책 불필요.

-- =============================================================
-- 9. audit_logs 헬퍼 — 배정 이벤트 기록용 트리거
-- (audit_logs 직접 INSERT 도 가능하지만, 누락 방지 위해 트리거로 보강)
-- =============================================================
CREATE OR REPLACE FUNCTION log_assignment_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    action_label TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        action_label := 'consultation_assignment.' || NEW.status::TEXT;
    ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        action_label := 'consultation_assignment.transition.' || NEW.status::TEXT;
    ELSE
        RETURN NULL;
    END IF;

    INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata)
    VALUES (
        COALESCE(NEW.assigned_by, auth.uid()),
        action_label,
        'consultation_assignment',
        NEW.id,
        jsonb_build_object(
            'consultation_id', NEW.consultation_id,
            'dealer_id',       NEW.dealer_id,
            'previous_status', CASE WHEN TG_OP = 'UPDATE' THEN OLD.status::TEXT ELSE NULL END,
            'expires_at',      NEW.expires_at,
            'acknowledged_at', NEW.acknowledged_at
        )
    );

    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_assignments_audit_log
    AFTER INSERT OR UPDATE ON consultation_assignments
    FOR EACH ROW
    EXECUTE FUNCTION log_assignment_event();
