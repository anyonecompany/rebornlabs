-- =============================================================
-- 20260423_commissions.sql — 조직 Phase 3: 출고 확인 + 수당 자동 배분
-- 작성일: 2026-04-23
-- 범위:
--   - sales.delivery_confirmed_at, sales.delivery_confirmed_by 컬럼 추가
--   - commissions 테이블 신규 생성 (판매 건당 수당 내역 정규화 저장)
--   - RLS: SELECT (admin/staff 전체, recipient 본인, 산하 조회), INSERT/UPDATE/DELETE 차단
--   - 인덱스
--
-- 설계 주석:
--   - sales.team_leader_fee/director_fee (Phase 1)은 스냅샷 금액 필드로 유지.
--     commissions는 수당 1건 단위 row로 기록 → 정산/추적/환불 이력 추적에 유리.
--   - Phase 5 정산 페이지에서 commissions를 월별/대상자별 집계.
--   - INSERT는 service_role 전용 (앱 API가 트랜잭션으로 생성).
--     authenticated 사용자는 RLS로 INSERT 불가.
-- =============================================================

BEGIN;

-- -------------------------------------------------------------
-- 1. sales 테이블 — 출고 확인 컬럼
-- NULL = 미확인. 값이 들어가면 해당 판매건의 수당이 확정된 것.
-- -------------------------------------------------------------

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS delivery_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_confirmed_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN sales.delivery_confirmed_at IS
  '출고 확인 시각. NULL=미확인. 값 세팅과 동시에 commissions 레코드가 생성된다 (트랜잭션).';
COMMENT ON COLUMN sales.delivery_confirmed_by IS
  '출고 확인자 user id. profiles 삭제 시에도 이력은 유지되도록 ON DELETE SET NULL.';

CREATE INDEX IF NOT EXISTS idx_sales_delivery_confirmed_at
  ON sales (delivery_confirmed_at DESC)
  WHERE delivery_confirmed_at IS NOT NULL;


-- -------------------------------------------------------------
-- 2. commissions 테이블 — 수당 내역 (1건 1row)
-- -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS commissions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id         UUID        NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  recipient_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  recipient_role  TEXT        NOT NULL CHECK (recipient_role IN ('dealer', 'team_leader', 'director')),
  amount          INTEGER     NOT NULL CHECK (amount > 0),
  commission_type TEXT        NOT NULL CHECK (commission_type IN ('direct_sale', 'team_leader_override', 'director_override')),
  case_type       TEXT        NOT NULL CHECK (case_type IN (
                    '1_db_dealer',
                    '2_db_team_leader',
                    '3_db_director',
                    '4_personal_dealer',
                    '5_personal_team_leader',
                    '6_personal_director'
                  )),
  confirmed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sale_id, recipient_id, commission_type)
);

COMMENT ON TABLE  commissions                  IS '수당 배분 내역 (판매 1건당 1~3 row). 출고 확인 시 서버에서 계산·생성.';
COMMENT ON COLUMN commissions.recipient_role   IS 'row 생성 시점의 recipient 역할. 조직 변경 후에도 이력 유지.';
COMMENT ON COLUMN commissions.commission_type  IS 'direct_sale=본인 판매분 / team_leader_override=산하 딜러 판매 팀장 수당 / director_override=산하 판매 본부장 수당.';
COMMENT ON COLUMN commissions.case_type        IS '6케이스 판정 (DB/개인 × dealer/team_leader/director).';

CREATE INDEX IF NOT EXISTS idx_commissions_sale         ON commissions (sale_id);
CREATE INDEX IF NOT EXISTS idx_commissions_recipient    ON commissions (recipient_id);
CREATE INDEX IF NOT EXISTS idx_commissions_confirmed_at ON commissions (confirmed_at DESC);


-- -------------------------------------------------------------
-- 3. RLS — 조회 범위, 변경은 service_role 전용
-- -------------------------------------------------------------

ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;

-- admin/staff: 전체 조회
DROP POLICY IF EXISTS commissions_select_admin_staff ON commissions;
CREATE POLICY commissions_select_admin_staff ON commissions
  FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin', 'staff'));

-- recipient 본인 조회
DROP POLICY IF EXISTS commissions_select_self ON commissions;
CREATE POLICY commissions_select_self ON commissions
  FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());

-- director/team_leader: 산하 recipient 수당 조회
DROP POLICY IF EXISTS commissions_select_director_team_leader ON commissions;
CREATE POLICY commissions_select_director_team_leader ON commissions
  FOR SELECT TO authenticated
  USING (
    public.user_role() IN ('director', 'team_leader')
    AND recipient_id IN (SELECT public.get_subordinate_ids(auth.uid()))
  );

-- INSERT / UPDATE / DELETE: authenticated 전원 차단 (service_role만 허용)
-- RLS 기본 deny. 정책을 아예 만들지 않음 → 모든 authenticated INSERT/UPDATE/DELETE 거부.

COMMIT;


-- =============================================================
-- 적용 확인 쿼리 (별도 실행)
-- =============================================================
-- 1) sales 신규 컬럼
--    SELECT column_name FROM information_schema.columns
--    WHERE table_name='sales' AND column_name IN ('delivery_confirmed_at','delivery_confirmed_by');
--
-- 2) commissions 테이블
--    \d+ commissions
--
-- 3) RLS 정책 3개
--    SELECT policyname FROM pg_policies WHERE tablename='commissions';
--    -- 기대: commissions_select_admin_staff, commissions_select_self,
--    --       commissions_select_director_team_leader
-- =============================================================
