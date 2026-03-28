-- =============================================================
-- 005_rls.sql — Reborn Labs Admin: Row Level Security 정책
-- 001_schema.sql에서 RLS ENABLE 완료. 이 파일은 정책만 정의.
--
-- 역할 체계:
--   admin   — 전체 관리자 (경영진)
--   staff   — 운영 직원
--   dealer  — 딜러 (영업 담당)
--   pending — 승인 대기 (신규 가입)
--   anon    — 비인증 사용자
--   service_role — 서버 사이드 (GAS, 시스템). RLS bypass 자동.
--
-- JWT custom claim: auth.jwt() ->> 'user_role'
-- 프로필 없는 사용자: role = 'none' (모든 정책 차단)
-- =============================================================

BEGIN;

-- =============================================================
-- 헬퍼: JWT에서 역할 추출
-- =============================================================

CREATE OR REPLACE FUNCTION auth.user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(auth.jwt() ->> 'user_role', 'none');
$$;

COMMENT ON FUNCTION auth.user_role IS 'JWT custom claim에서 사용자 역할을 추출. 프로필 없으면 none 반환.';

-- =============================================================
-- 1. profiles
-- admin: 전체 CRUD
-- staff: 전체 READ, UPDATE 본인만
-- dealer: SELECT/UPDATE 본인만
-- pending: SELECT 본인만
-- =============================================================

-- SELECT
CREATE POLICY profiles_select_admin ON profiles
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'admin');

CREATE POLICY profiles_select_staff ON profiles
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'staff');

CREATE POLICY profiles_select_dealer ON profiles
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'dealer' AND id = auth.uid());

CREATE POLICY profiles_select_pending ON profiles
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'pending' AND id = auth.uid());

-- INSERT (admin만)
CREATE POLICY profiles_insert_admin ON profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() = 'admin');

-- UPDATE
CREATE POLICY profiles_update_admin ON profiles
  FOR UPDATE TO authenticated
  USING (auth.user_role() = 'admin')
  WITH CHECK (auth.user_role() = 'admin');

CREATE POLICY profiles_update_staff_self ON profiles
  FOR UPDATE TO authenticated
  USING (auth.user_role() = 'staff' AND id = auth.uid())
  WITH CHECK (auth.user_role() = 'staff' AND id = auth.uid());

CREATE POLICY profiles_update_dealer_self ON profiles
  FOR UPDATE TO authenticated
  USING (auth.user_role() = 'dealer' AND id = auth.uid())
  WITH CHECK (auth.user_role() = 'dealer' AND id = auth.uid());

-- DELETE (admin만)
CREATE POLICY profiles_delete_admin ON profiles
  FOR DELETE TO authenticated
  USING (auth.user_role() = 'admin');

-- =============================================================
-- 2. vehicles
-- admin/staff: 전체 CRUD
-- dealer: SELECT 차단 (vehicles_dealer_view로만 접근)
-- anon: 전체 차단
-- =============================================================

CREATE POLICY vehicles_select_admin_staff ON vehicles
  FOR SELECT TO authenticated
  USING (auth.user_role() IN ('admin', 'staff'));

CREATE POLICY vehicles_insert_admin_staff ON vehicles
  FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() IN ('admin', 'staff'));

CREATE POLICY vehicles_update_admin_staff ON vehicles
  FOR UPDATE TO authenticated
  USING (auth.user_role() IN ('admin', 'staff'));

CREATE POLICY vehicles_delete_admin_staff ON vehicles
  FOR DELETE TO authenticated
  USING (auth.user_role() IN ('admin', 'staff'));

-- =============================================================
-- 3. consultations
-- admin/staff: 전체 CRUD
-- dealer: SELECT 본인 배정만, UPDATE 차단
-- anon: 전체 차단 (GAS는 service_role로 RLS bypass)
-- =============================================================

CREATE POLICY consultations_select_admin_staff ON consultations
  FOR SELECT TO authenticated
  USING (auth.user_role() IN ('admin', 'staff'));

CREATE POLICY consultations_select_dealer ON consultations
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'dealer' AND assigned_dealer_id = auth.uid());

CREATE POLICY consultations_insert_admin_staff ON consultations
  FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() IN ('admin', 'staff'));

CREATE POLICY consultations_update_admin_staff ON consultations
  FOR UPDATE TO authenticated
  USING (auth.user_role() IN ('admin', 'staff'));

CREATE POLICY consultations_delete_admin_staff ON consultations
  FOR DELETE TO authenticated
  USING (auth.user_role() IN ('admin', 'staff'));

-- =============================================================
-- 4. consultation_logs
-- admin/staff: SELECT 전체
-- dealer: SELECT/INSERT 본인만
-- =============================================================

CREATE POLICY consultation_logs_select_admin_staff ON consultation_logs
  FOR SELECT TO authenticated
  USING (auth.user_role() IN ('admin', 'staff'));

CREATE POLICY consultation_logs_select_dealer ON consultation_logs
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'dealer' AND dealer_id = auth.uid());

CREATE POLICY consultation_logs_insert_dealer ON consultation_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() = 'dealer' AND dealer_id = auth.uid());

CREATE POLICY consultation_logs_insert_admin_staff ON consultation_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() IN ('admin', 'staff'));

-- =============================================================
-- 5. sales
-- admin/staff: 전체 CRUD
-- dealer: SELECT 본인만 (INSERT는 complete_sale RPC만)
-- =============================================================

CREATE POLICY sales_select_admin_staff ON sales
  FOR SELECT TO authenticated
  USING (auth.user_role() IN ('admin', 'staff'));

CREATE POLICY sales_select_dealer ON sales
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'dealer' AND dealer_id = auth.uid());

CREATE POLICY sales_insert_admin_staff ON sales
  FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() IN ('admin', 'staff'));

CREATE POLICY sales_update_admin_staff ON sales
  FOR UPDATE TO authenticated
  USING (auth.user_role() IN ('admin', 'staff'));

CREATE POLICY sales_delete_admin_staff ON sales
  FOR DELETE TO authenticated
  USING (auth.user_role() IN ('admin', 'staff'));

-- =============================================================
-- 6. delivery_checklists
-- admin/staff: SELECT 전체
-- dealer: 본인 건 CRUD
-- =============================================================

CREATE POLICY delivery_checklists_select_admin_staff ON delivery_checklists
  FOR SELECT TO authenticated
  USING (auth.user_role() IN ('admin', 'staff'));

CREATE POLICY delivery_checklists_select_dealer ON delivery_checklists
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'dealer' AND dealer_id = auth.uid());

CREATE POLICY delivery_checklists_insert_dealer ON delivery_checklists
  FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() = 'dealer' AND dealer_id = auth.uid());

CREATE POLICY delivery_checklists_update_dealer ON delivery_checklists
  FOR UPDATE TO authenticated
  USING (auth.user_role() = 'dealer' AND dealer_id = auth.uid());

CREATE POLICY delivery_checklists_delete_dealer ON delivery_checklists
  FOR DELETE TO authenticated
  USING (auth.user_role() = 'dealer' AND dealer_id = auth.uid());

-- =============================================================
-- 7. expenses
-- admin/staff: 전체 CRUD
-- dealer: 전체 차단
-- =============================================================

CREATE POLICY expenses_select_admin_staff ON expenses
  FOR SELECT TO authenticated
  USING (auth.user_role() IN ('admin', 'staff'));

CREATE POLICY expenses_insert_admin_staff ON expenses
  FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() IN ('admin', 'staff'));

CREATE POLICY expenses_update_admin_staff ON expenses
  FOR UPDATE TO authenticated
  USING (auth.user_role() IN ('admin', 'staff'));

CREATE POLICY expenses_delete_admin_staff ON expenses
  FOR DELETE TO authenticated
  USING (auth.user_role() IN ('admin', 'staff'));

-- =============================================================
-- 8. documents
-- admin: 전체 CRUD
-- staff: SELECT + INSERT
-- dealer: SELECT 전체
-- =============================================================

CREATE POLICY documents_select_authenticated ON documents
  FOR SELECT TO authenticated
  USING (auth.user_role() IN ('admin', 'staff', 'dealer'));

CREATE POLICY documents_insert_admin_staff ON documents
  FOR INSERT TO authenticated
  WITH CHECK (auth.user_role() IN ('admin', 'staff'));

CREATE POLICY documents_update_admin ON documents
  FOR UPDATE TO authenticated
  USING (auth.user_role() = 'admin');

CREATE POLICY documents_delete_admin ON documents
  FOR DELETE TO authenticated
  USING (auth.user_role() = 'admin');

-- =============================================================
-- 9. audit_logs
-- admin: SELECT 전체 (경영진만 열람)
-- INSERT: service_role only (RLS bypass). 일반 사용자 INSERT 차단.
-- dealer/staff: 전체 차단
-- =============================================================

CREATE POLICY audit_logs_select_admin ON audit_logs
  FOR SELECT TO authenticated
  USING (auth.user_role() = 'admin');

-- INSERT 정책 없음 → authenticated 사용자는 INSERT 불가
-- audit_logs INSERT는 SECURITY DEFINER 함수 또는 service_role을 통해서만 가능

-- =============================================================
-- 10. rate_limits
-- 전체 역할 차단 (service_role only)
-- =============================================================

-- 정책 없음 → RLS ENABLE 상태에서 모든 authenticated/anon 접근 차단
-- service_role은 RLS를 자동 bypass

COMMIT;
