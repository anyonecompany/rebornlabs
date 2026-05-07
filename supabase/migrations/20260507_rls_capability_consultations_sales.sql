-- ─────────────────────────────────────────────────────────────────
-- consultations / sales / contracts RLS — has_capability() 기반 마이그레이션
-- ─────────────────────────────────────────────────────────────────
--
-- 전제: 20260507_capabilities_function.sql 에서 has_capability() 정의 완료.
-- 전략: 기존 명시 역할 정책을 capability 기반으로 점진 교체. SELECT만 우선,
--       INSERT/UPDATE/DELETE는 기존 정책 유지(앱 레이어 가드 + service_role).
--
-- 검증:
--   1) 로컬 Supabase에서 supabase db reset 후 적용
--   2) 각 역할 JWT로 SELECT 시뮬레이션 (admin/staff/director/team_leader/dealer/pending)
--   3) capabilities.test.ts 통합 테스트(별도)에서 TS ↔ SQL 정합 검증
--
-- 성능 (Supabase RLS performance 베스트 프랙티스):
--   - has_capability(p_role, ...) 호출은 (SELECT ...) 서브쿼리로 감싸서 옵티마이저 캐싱.
--   - get_subordinate_ids(auth.uid())도 동일 패턴.
-- ─────────────────────────────────────────────────────────────────

-- ─── consultations ────────────────────────────────────────────────

-- 기존 SELECT 정책 — capability 기반 단일 정책으로 교체 (DROP 후 신규 생성)
DROP POLICY IF EXISTS consultations_select_admin_staff ON consultations;
DROP POLICY IF EXISTS consultations_select_dealer ON consultations;
DROP POLICY IF EXISTS consultations_select_director_team_leader ON consultations;

CREATE POLICY consultations_select_capability ON consultations
  FOR SELECT TO authenticated
  USING (
    -- all 스코프: admin / staff
    (SELECT has_capability((SELECT current_user_role()), 'consultations:read:all'))
    OR
    -- subordinate 스코프: director / team_leader → 산하 dealer 배정 + 미배정
    (
      (SELECT has_capability((SELECT current_user_role()), 'consultations:read:subordinate'))
      AND (
        assigned_dealer_id IS NULL
        OR assigned_dealer_id IN (SELECT * FROM get_subordinate_ids(auth.uid()))
      )
    )
    OR
    -- self 스코프: dealer → 본인 배정만
    (
      (SELECT has_capability((SELECT current_user_role()), 'consultations:read:self'))
      AND assigned_dealer_id = auth.uid()
    )
  );

-- ─── sales ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS sales_select_admin_staff ON sales;
DROP POLICY IF EXISTS sales_select_dealer ON sales;
DROP POLICY IF EXISTS sales_select_director_team_leader ON sales;

CREATE POLICY sales_select_capability ON sales
  FOR SELECT TO authenticated
  USING (
    (SELECT has_capability((SELECT current_user_role()), 'sales:read:all'))
    OR
    (
      (SELECT has_capability((SELECT current_user_role()), 'sales:read:subordinate'))
      AND dealer_id IN (SELECT * FROM get_subordinate_ids(auth.uid()))
    )
    OR
    (
      (SELECT has_capability((SELECT current_user_role()), 'sales:read:self'))
      AND dealer_id = auth.uid()
    )
  );

-- ─── contracts ────────────────────────────────────────────────────

DROP POLICY IF EXISTS contracts_select_admin_staff ON contracts;
DROP POLICY IF EXISTS contracts_select_dealer ON contracts;
DROP POLICY IF EXISTS contracts_select_director_team_leader ON contracts;

-- contracts.sale_id로 sales의 dealer_id 추적
CREATE POLICY contracts_select_capability ON contracts
  FOR SELECT TO authenticated
  USING (
    (SELECT has_capability((SELECT current_user_role()), 'contracts:read:all'))
    OR
    (
      (SELECT has_capability((SELECT current_user_role()), 'contracts:read:subordinate'))
      AND sale_id IN (
        SELECT id FROM sales
        WHERE dealer_id IN (SELECT * FROM get_subordinate_ids(auth.uid()))
      )
    )
    OR
    (
      (SELECT has_capability((SELECT current_user_role()), 'contracts:read:self'))
      AND sale_id IN (SELECT id FROM sales WHERE dealer_id = auth.uid())
    )
  );

-- ─── 인덱스 보강 (RLS 성능 핵심) ────────────────────────────────
-- assigned_dealer_id, dealer_id, sale_id에 인덱스가 이미 있는지 확인 후 누락만 추가.
-- 004_indexes.sql + 20260429_missing_fk_indexes.sql 에서 대부분 커버되지만 안전망.

CREATE INDEX IF NOT EXISTS idx_consultations_assigned_dealer_id
  ON consultations(assigned_dealer_id) WHERE assigned_dealer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_dealer_id_for_rls
  ON sales(dealer_id);

CREATE INDEX IF NOT EXISTS idx_contracts_sale_id_for_rls
  ON contracts(sale_id);

COMMENT ON POLICY consultations_select_capability ON consultations IS
  'RBAC SSOT: has_capability() + dataScope 패턴. 신규 역할 추가 시 capabilities.ts + has_capability()만 갱신.';

COMMENT ON POLICY sales_select_capability ON sales IS
  'RBAC SSOT: has_capability() + dataScope 패턴.';

COMMENT ON POLICY contracts_select_capability ON contracts IS
  'RBAC SSOT: has_capability() + dataScope 패턴 (sales.dealer_id 추적).';
