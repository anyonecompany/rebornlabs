-- =============================================================
-- 20260420_org_structure.sql — 리본랩스 어드민: 조직 구조 변경 (Phase 1)
-- 작성일: 2026-04-20
-- 범위: DB 스키마 + RLS 마이그레이션 (본부장/팀장 역할 추가)
--
-- 적용 대상:
--   - profiles.role ENUM: director, team_leader 추가
--   - team_assignments 테이블 신규 생성
--   - sales: team_leader_id/fee, director_id/fee 컬럼 추가
--   - consultations: available_deposit, desired_monthly_payment 컬럼 추가
--   - get_subordinate_ids() SECURITY DEFINER 함수
--   - profiles/consultations/sales/contracts에 director/team_leader SELECT 정책 추가
--
-- 역호환:
--   - 기존 admin/staff/dealer RLS 정책은 수정하지 않는다 (추가만).
--   - 기존 dealer는 그대로 assigned_dealer_id = auth.uid() 기준으로 동작.
--
-- 적용 방식:
--   Supabase Dashboard → SQL Editor 에서 아래 블록을 순서대로 실행.
--   BLOCK 1은 ENUM 확장(트랜잭션 불가).
--   BLOCK 2는 BEGIN/COMMIT 트랜잭션.
-- =============================================================


-- =============================================================
-- BLOCK 1 — ENUM 확장 (반드시 단독 실행. 트랜잭션 금지.)
-- PostgreSQL 규칙: ENUM에 추가된 값은 같은 트랜잭션 내에서 사용 불가.
-- Supabase SQL Editor에서 이 블록을 먼저 실행한 뒤, BLOCK 2 실행.
-- =============================================================

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'director';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'team_leader';


-- =============================================================
-- BLOCK 2 — 테이블/함수/RLS (트랜잭션)
-- =============================================================

BEGIN;

-- -------------------------------------------------------------
-- 2-1. team_assignments — 조직 관계 테이블
-- user_id(하위) ↔ leader_id(상위)
-- leader_type: 'team_leader' (딜러→팀장) 또는 'director' (팀장→본부장)
-- UNIQUE(user_id, leader_type): 한 사람당 동일 레벨 상위는 1명만
-- -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS team_assignments (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    leader_id   UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    leader_type TEXT        NOT NULL CHECK (leader_type IN ('team_leader', 'director')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, leader_type)
);

COMMENT ON TABLE  team_assignments             IS '조직 관계. user_id 하위가 leader_id 상위에 소속. leader_type 로 레벨 구분.';
COMMENT ON COLUMN team_assignments.leader_type IS 'team_leader=딜러의 팀장 / director=팀장의 본부장. 본인 루트이면 레코드 없음.';

CREATE INDEX IF NOT EXISTS idx_team_assignments_user   ON team_assignments (user_id);
CREATE INDEX IF NOT EXISTS idx_team_assignments_leader ON team_assignments (leader_id);

-- team_assignments RLS: admin만 CRUD, director/team_leader는 본인 관련 행만 SELECT
ALTER TABLE team_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS team_assignments_select_admin_staff ON team_assignments;
CREATE POLICY team_assignments_select_admin_staff ON team_assignments
  FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin', 'staff'));

DROP POLICY IF EXISTS team_assignments_select_self_related ON team_assignments;
CREATE POLICY team_assignments_select_self_related ON team_assignments
  FOR SELECT TO authenticated
  USING (
    public.user_role() IN ('director', 'team_leader')
    AND (leader_id = auth.uid() OR user_id = auth.uid())
  );

DROP POLICY IF EXISTS team_assignments_insert_admin ON team_assignments;
CREATE POLICY team_assignments_insert_admin ON team_assignments
  FOR INSERT TO authenticated
  WITH CHECK (public.user_role() = 'admin');

DROP POLICY IF EXISTS team_assignments_update_admin ON team_assignments;
CREATE POLICY team_assignments_update_admin ON team_assignments
  FOR UPDATE TO authenticated
  USING (public.user_role() = 'admin')
  WITH CHECK (public.user_role() = 'admin');

DROP POLICY IF EXISTS team_assignments_delete_admin ON team_assignments;
CREATE POLICY team_assignments_delete_admin ON team_assignments
  FOR DELETE TO authenticated
  USING (public.user_role() = 'admin');


-- -------------------------------------------------------------
-- 2-2. sales 테이블 — 판매 시점 조직 스냅샷 컬럼
-- 기존 레코드는 NULL 유지 (소급 계산 안 함)
-- 신규 판매부터 값 기록 (Phase 3 API 에서 처리)
-- -------------------------------------------------------------

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS team_leader_id  UUID    REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS team_leader_fee INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS director_id     UUID    REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS director_fee    INTEGER DEFAULT 0;

COMMENT ON COLUMN sales.team_leader_id  IS '판매 시점의 딜러 소속 팀장 스냅샷. 나중에 조직 변경돼도 이 값은 유지.';
COMMENT ON COLUMN sales.team_leader_fee IS '팀장 수당 (원). 자체판매 50만원, DB판매 30만원. 직접판매면 0.';
COMMENT ON COLUMN sales.director_id     IS '판매 시점의 팀장 소속 본부장 스냅샷.';
COMMENT ON COLUMN sales.director_fee    IS '본부장 수당 (원). 자체판매 20만원, DB판매 10만원.';

CREATE INDEX IF NOT EXISTS idx_sales_team_leader ON sales (team_leader_id);
CREATE INDEX IF NOT EXISTS idx_sales_director    ON sales (director_id);


-- -------------------------------------------------------------
-- 2-3. consultations 테이블 — 재정 정보 필드
-- 만원 단위 정수 (UI에서 "만원" 라벨 처리). NULL 허용 (선택 입력).
-- -------------------------------------------------------------

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS available_deposit       INTEGER CHECK (available_deposit IS NULL OR available_deposit >= 0),
  ADD COLUMN IF NOT EXISTS desired_monthly_payment INTEGER CHECK (desired_monthly_payment IS NULL OR desired_monthly_payment >= 0);

COMMENT ON COLUMN consultations.available_deposit       IS '보증금 가능 금액 (만원 단위). NULL=미입력.';
COMMENT ON COLUMN consultations.desired_monthly_payment IS '희망 월 납입료 (만원 단위). NULL=미입력.';


-- -------------------------------------------------------------
-- 2-4. get_subordinate_ids — 산하 사용자 ID 수집 함수
-- 본인 + 직속 하위 + 2단계 하위 UNION
-- SECURITY DEFINER: team_assignments RLS bypass (내부 전체 탐색용)
-- STABLE: 쿼리 최적화 대상
-- -------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_subordinate_ids(p_user_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  -- 본인
  SELECT p_user_id
  UNION
  -- 1단계 하위: 팀장의 딜러 / 본부장의 팀장
  SELECT user_id
    FROM team_assignments
    WHERE leader_id = p_user_id
  UNION
  -- 2단계 하위: 본부장 → 팀장 → 딜러
  SELECT ta2.user_id
    FROM team_assignments ta1
    JOIN team_assignments ta2 ON ta2.leader_id = ta1.user_id
    WHERE ta1.leader_id = p_user_id;
$$;

COMMENT ON FUNCTION public.get_subordinate_ids IS
  '사용자의 본인 + 직속·2단계 산하 UUID 집합. director/team_leader RLS 정책에서 사용. SECURITY DEFINER.';

GRANT EXECUTE ON FUNCTION public.get_subordinate_ids(UUID) TO authenticated;


-- -------------------------------------------------------------
-- 2-5. profiles — director/team_leader가 산하 사용자의 프로필 조회
-- 조직 관리 UI에서 팀원 이름/연락처 표시에 필요
-- -------------------------------------------------------------

DROP POLICY IF EXISTS profiles_select_director_team_leader ON profiles;
CREATE POLICY profiles_select_director_team_leader ON profiles
  FOR SELECT TO authenticated
  USING (
    public.user_role() IN ('director', 'team_leader')
    AND id IN (SELECT public.get_subordinate_ids(auth.uid()))
  );


-- -------------------------------------------------------------
-- 2-6. consultations — director/team_leader가 산하 딜러 상담 조회
-- -------------------------------------------------------------

DROP POLICY IF EXISTS consultations_select_director_team_leader ON consultations;
CREATE POLICY consultations_select_director_team_leader ON consultations
  FOR SELECT TO authenticated
  USING (
    public.user_role() IN ('director', 'team_leader')
    AND assigned_dealer_id IN (SELECT public.get_subordinate_ids(auth.uid()))
  );


-- -------------------------------------------------------------
-- 2-7. sales — director/team_leader가 산하 딜러 판매 조회
-- -------------------------------------------------------------

DROP POLICY IF EXISTS sales_select_director_team_leader ON sales;
CREATE POLICY sales_select_director_team_leader ON sales
  FOR SELECT TO authenticated
  USING (
    public.user_role() IN ('director', 'team_leader')
    AND dealer_id IN (SELECT public.get_subordinate_ids(auth.uid()))
  );


-- -------------------------------------------------------------
-- 2-8. contracts — 테이블 존재 시에만 RLS 추가
-- contracts 테이블은 001_schema.sql에 없고 별도 생성됨.
-- 존재 여부를 동적으로 확인 후 정책 적용.
-- sale_id → sales.dealer_id → get_subordinate_ids 관계 체크.
-- -------------------------------------------------------------

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'contracts'
    ) THEN
        -- RLS 활성화 확인 (이미 켜져 있으면 no-op)
        EXECUTE 'ALTER TABLE contracts ENABLE ROW LEVEL SECURITY';

        -- 기존 정책 제거 후 재생성 (재실행 안전)
        EXECUTE 'DROP POLICY IF EXISTS contracts_select_director_team_leader ON contracts';
        EXECUTE $policy$
          CREATE POLICY contracts_select_director_team_leader ON contracts
            FOR SELECT TO authenticated
            USING (
              public.user_role() IN ('director', 'team_leader')
              AND sale_id IN (
                SELECT id FROM sales
                WHERE dealer_id IN (SELECT public.get_subordinate_ids(auth.uid()))
              )
            )
        $policy$;
    END IF;
END $$;


-- -------------------------------------------------------------
-- 2-9. expenses — 역할별 접근 범위 재설정 (현상 유지)
-- 명세: "지출결의는 경영진과 회사직원만 접근 가능"
-- 현재 정책은 이미 admin/staff만 허용. director/team_leader는 묵시적 deny.
-- 명시적 정책 추가는 불필요. 주석으로만 의도 기록.
-- -------------------------------------------------------------

COMMENT ON TABLE expenses IS
  '지출결의. admin/staff만 접근 가능. director/team_leader/dealer는 RLS 묵시적 차단.';


COMMIT;


-- =============================================================
-- 적용 완료 확인 쿼리 (별도 실행)
-- =============================================================
-- 1) enum 값 확인
--    SELECT unnest(enum_range(NULL::user_role));
--
-- 2) team_assignments 확인
--    \d+ team_assignments
--
-- 3) sales 신규 컬럼
--    SELECT column_name FROM information_schema.columns
--    WHERE table_name='sales' AND column_name IN
--      ('team_leader_id','team_leader_fee','director_id','director_fee');
--
-- 4) consultations 신규 컬럼
--    SELECT column_name FROM information_schema.columns
--    WHERE table_name='consultations' AND column_name IN
--      ('available_deposit','desired_monthly_payment');
--
-- 5) get_subordinate_ids 함수
--    SELECT proname FROM pg_proc WHERE proname='get_subordinate_ids';
--
-- 6) 신규 정책 5개 (or 4개 if contracts 미존재)
--    SELECT policyname FROM pg_policies
--    WHERE policyname LIKE '%director_team_leader%';
-- =============================================================
