-- =============================================================
-- 20260420_quotes.sql — 리본랩스 어드민: 견적서 공개 링크 기능
-- 작성일: 2026-04-20
-- 범위: quotes 테이블 + 견적번호 함수 + RLS 3개
--
-- 공개 조회 API는 service_role 기반이라 RLS bypass.
-- 어드민에서의 관리 조회는 RLS로 권한 제어.
-- =============================================================

BEGIN;

-- -------------------------------------------------------------
-- 1. quotes 테이블
-- -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS quotes (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id       UUID        NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    dealer_id        UUID                 REFERENCES profiles(id) ON DELETE SET NULL,
    token            TEXT        NOT NULL UNIQUE,
    quote_number     TEXT        NOT NULL UNIQUE,
    expires_at       TIMESTAMPTZ,
    view_count       INTEGER     NOT NULL DEFAULT 0,
    first_viewed_at  TIMESTAMPTZ,
    last_viewed_at   TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  quotes              IS '차량 견적서. 딜러가 생성하고 공개 토큰으로 고객에게 공유. 만료/조회통계 관리.';
COMMENT ON COLUMN quotes.token        IS '공개 URL 토큰. 64자 hex (crypto.randomBytes(32)).';
COMMENT ON COLUMN quotes.quote_number IS '견적번호 RL-YYYYMMDD-NNN. Asia/Seoul 기준 일자 순번.';
COMMENT ON COLUMN quotes.expires_at   IS '만료일시. NULL=무제한. 만료 후 공개 페이지 410 Gone.';
COMMENT ON COLUMN quotes.view_count   IS '공개 페이지 조회수. race 허용.';

CREATE INDEX IF NOT EXISTS idx_quotes_token    ON quotes (token);
CREATE INDEX IF NOT EXISTS idx_quotes_vehicle  ON quotes (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_quotes_dealer   ON quotes (dealer_id);


-- -------------------------------------------------------------
-- 2. generate_quote_number — Asia/Seoul 기준 일자 + 순번
-- 반환값: 'RL-YYYYMMDD-NNN'
-- 동시 생성 시 UNIQUE 충돌은 API에서 재시도 처리.
-- -------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.generate_quote_number()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_date  TEXT;
    v_count INTEGER;
BEGIN
    v_date := to_char((now() AT TIME ZONE 'Asia/Seoul')::date, 'YYYYMMDD');

    SELECT COUNT(*) + 1
      INTO v_count
      FROM quotes
     WHERE to_char((created_at AT TIME ZONE 'Asia/Seoul')::date, 'YYYYMMDD') = v_date;

    RETURN 'RL-' || v_date || '-' || LPAD(v_count::TEXT, 3, '0');
END;
$$;

COMMENT ON FUNCTION public.generate_quote_number IS
  '견적번호 생성 (RL-YYYYMMDD-NNN). Asia/Seoul 기준 일자. STABLE.';

GRANT EXECUTE ON FUNCTION public.generate_quote_number() TO authenticated;


-- -------------------------------------------------------------
-- 3. RLS
-- -------------------------------------------------------------

ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

-- 딜러: 본인 생성 견적서 CRUD
DROP POLICY IF EXISTS quotes_dealer_own ON quotes;
CREATE POLICY quotes_dealer_own ON quotes
  FOR ALL TO authenticated
  USING (public.user_role() = 'dealer' AND dealer_id = auth.uid())
  WITH CHECK (public.user_role() = 'dealer' AND dealer_id = auth.uid());

-- admin/staff: 전체 조회 + INSERT
DROP POLICY IF EXISTS quotes_admin_staff_select ON quotes;
CREATE POLICY quotes_admin_staff_select ON quotes
  FOR SELECT TO authenticated
  USING (public.user_role() IN ('admin', 'staff'));

DROP POLICY IF EXISTS quotes_admin_staff_insert ON quotes;
CREATE POLICY quotes_admin_staff_insert ON quotes
  FOR INSERT TO authenticated
  WITH CHECK (public.user_role() IN ('admin', 'staff'));

DROP POLICY IF EXISTS quotes_admin_staff_update ON quotes;
CREATE POLICY quotes_admin_staff_update ON quotes
  FOR UPDATE TO authenticated
  USING (public.user_role() IN ('admin', 'staff'));

DROP POLICY IF EXISTS quotes_admin_staff_delete ON quotes;
CREATE POLICY quotes_admin_staff_delete ON quotes
  FOR DELETE TO authenticated
  USING (public.user_role() IN ('admin', 'staff'));

-- director/team_leader: 산하 딜러가 생성한 견적서 조회
-- Phase 1의 get_subordinate_ids 재사용. 해당 함수 미존재 시 이 정책 생략.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'get_subordinate_ids'
    ) THEN
        EXECUTE 'DROP POLICY IF EXISTS quotes_director_team_leader_select ON quotes';
        EXECUTE $policy$
          CREATE POLICY quotes_director_team_leader_select ON quotes
            FOR SELECT TO authenticated
            USING (
              public.user_role() IN ('director', 'team_leader')
              AND dealer_id IN (SELECT public.get_subordinate_ids(auth.uid()))
            )
        $policy$;
    END IF;
END $$;

COMMIT;


-- =============================================================
-- 적용 확인 쿼리
-- =============================================================
-- 1) 테이블
--    SELECT column_name FROM information_schema.columns
--      WHERE table_name='quotes' ORDER BY ordinal_position;
--
-- 2) 함수
--    SELECT public.generate_quote_number();
--      -- 기대: 'RL-YYYYMMDD-001' (첫 호출)
--
-- 3) 정책 (4~5개)
--    SELECT policyname FROM pg_policies WHERE tablename='quotes';
--
-- 4) 인덱스
--    SELECT indexname FROM pg_indexes WHERE tablename='quotes';
-- =============================================================
