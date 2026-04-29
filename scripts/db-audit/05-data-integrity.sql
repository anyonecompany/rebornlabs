-- =============================================================
-- 05-data-integrity.sql
-- 데이터 무결성 진단 — orphan, enum 위반, 중복, soft-delete 일관성
-- =============================================================
-- 실행: Supabase Dashboard → SQL Editor
-- =============================================================

-- 1) 활성 sales 차량별 중복 (PR #11 H3 partial unique 적용 전 데이터)
SELECT vehicle_id, COUNT(*) AS active_cnt
FROM sales
WHERE cancelled_at IS NULL
GROUP BY vehicle_id
HAVING COUNT(*) > 1
ORDER BY active_cnt DESC;

-- 2) sales fee CHECK 위반 (NOT VALID 제약 무시한 기존 데이터)
SELECT
  id, dealer_id, dealer_fee, marketing_fee, is_db_provided,
  cancelled_at IS NULL AS is_active, created_at
FROM sales
WHERE dealer_fee NOT IN (0, 500000, 1000000)
   OR marketing_fee NOT IN (0, 700000)
   OR (is_db_provided = true AND dealer_fee != 1000000)
ORDER BY created_at DESC
LIMIT 50;

-- 3) Orphan sales (vehicle 없는 sales)
SELECT s.id, s.vehicle_id, s.dealer_id, s.created_at
FROM sales s
LEFT JOIN vehicles v ON v.id = s.vehicle_id
WHERE v.id IS NULL;

-- 4) Orphan consultations (assigned_dealer 없는데 assigned_dealer_id 있는 경우)
SELECT c.id, c.assigned_dealer_id, c.customer_name, c.status
FROM consultations c
LEFT JOIN profiles p ON p.id = c.assigned_dealer_id
WHERE c.assigned_dealer_id IS NOT NULL AND p.id IS NULL;

-- 5) Orphan team_assignments (user 또는 leader 없는 경우)
SELECT ta.id, ta.user_id, ta.leader_id, ta.leader_type
FROM team_assignments ta
LEFT JOIN profiles u ON u.id = ta.user_id
LEFT JOIN profiles l ON l.id = ta.leader_id
WHERE u.id IS NULL OR l.id IS NULL;

-- 6) deleted_at IS NOT NULL인 vehicles 중 status가 'deleted'가 아닌 것
SELECT id, vehicle_code, status, deleted_at
FROM vehicles
WHERE deleted_at IS NOT NULL AND status != 'deleted';

-- 7) status='sold'인데 활성 sale 없는 vehicles (취소 후 status 미복원)
SELECT v.id, v.vehicle_code, v.make, v.model, v.status
FROM vehicles v
WHERE v.status = 'sold'
  AND v.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM sales s
    WHERE s.vehicle_id = v.id AND s.cancelled_at IS NULL
  );

-- 8) profiles 통계 (역할별, must_change_password 분포)
SELECT
  role,
  COUNT(*) AS total,
  SUM(CASE WHEN is_active THEN 1 ELSE 0 END) AS active,
  SUM(CASE WHEN must_change_password THEN 1 ELSE 0 END) AS must_change_pw
FROM profiles
GROUP BY role
ORDER BY role;

-- 9) consultation_logs status_snapshot이 NULL인 행 (트리거 무관 변경 감지)
SELECT COUNT(*) AS null_snapshots
FROM consultation_logs
WHERE status_snapshot IS NULL;

-- 10) audit_logs에 actor_id가 null인 비율 (시스템 로그 비중)
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN actor_id IS NULL THEN 1 ELSE 0 END) AS system_logs,
  SUM(CASE WHEN actor_id IS NOT NULL THEN 1 ELSE 0 END) AS user_logs
FROM audit_logs;
