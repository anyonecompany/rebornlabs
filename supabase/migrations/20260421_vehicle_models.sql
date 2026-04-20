-- =============================================================
-- 20260421_vehicle_models.sql — 리본랩스: 차량 모델 카탈로그
-- 작성일: 2026-04-21
-- 범위: vehicle_models 테이블 + 인덱스 + 트리거 + RLS
--
-- 관계:
--   - 기존 vehicles (재고 단위) 테이블과 **독립**
--   - 공개 /cars 페이지는 anon 역할로 조회 (is_active=true)
-- =============================================================

BEGIN;

-- -------------------------------------------------------------
-- 1. vehicle_models 테이블
-- -------------------------------------------------------------

CREATE TABLE IF NOT EXISTS vehicle_models (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    brand         TEXT        NOT NULL,                         -- 벤츠, BMW, 아우디 등
    model         TEXT        NOT NULL,                         -- C 클래스, 5 시리즈
    trim          TEXT        NOT NULL,                         -- C200, 520d M Sport
    car_price     BIGINT      NOT NULL CHECK (car_price > 0),   -- 차량가격 (원)
    max_deposit   BIGINT      NOT NULL CHECK (max_deposit >= 0),-- 최대보증금 (원)
    display_order INTEGER     NOT NULL DEFAULT 0,               -- 표시 순서 (엑셀 순서 × 10)
    is_active     BOOLEAN     NOT NULL DEFAULT true,            -- 공개 여부
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (brand, model, trim)
);

COMMENT ON TABLE  vehicle_models             IS '차량 모델 카탈로그. 브랜드/모델/등급별 가격. 공개 /cars에서 조회.';
COMMENT ON COLUMN vehicle_models.car_price   IS '차량 가격 (원). 추가된 가격 = car_price × 1.35는 앱에서 계산.';
COMMENT ON COLUMN vehicle_models.max_deposit IS '최대 보증금 (원).';
COMMENT ON COLUMN vehicle_models.display_order IS '표시 순서. 엑셀 순서대로 10 단위 증가 (10,20,30...).';


-- -------------------------------------------------------------
-- 2. 인덱스
-- -------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_vehicle_models_brand_active
  ON vehicle_models (brand) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_vehicle_models_display_order
  ON vehicle_models (display_order);


-- -------------------------------------------------------------
-- 3. updated_at 자동 갱신 트리거
-- 기존 update_updated_at() 함수 재사용 (002_triggers.sql)
-- -------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_vehicle_models_updated_at ON vehicle_models;
CREATE TRIGGER trg_vehicle_models_updated_at
  BEFORE UPDATE ON vehicle_models
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- -------------------------------------------------------------
-- 4. RLS
-- -------------------------------------------------------------

ALTER TABLE vehicle_models ENABLE ROW LEVEL SECURITY;

-- admin/staff: 전체 CRUD
-- public.user_role()은 JWT claim 기반, 기존 005_rls.sql 패턴 재사용
DROP POLICY IF EXISTS vm_admin_staff_all ON vehicle_models;
CREATE POLICY vm_admin_staff_all ON vehicle_models
  FOR ALL TO authenticated
  USING (public.user_role() IN ('admin', 'staff'))
  WITH CHECK (public.user_role() IN ('admin', 'staff'));

-- 공개 SELECT: 로그인 여부 무관하게 is_active=true 인 행만
-- service_role은 RLS bypass이므로 이 정책과 무관하게 항상 조회 가능
DROP POLICY IF EXISTS vm_public_select ON vehicle_models;
CREATE POLICY vm_public_select ON vehicle_models
  FOR SELECT TO anon, authenticated
  USING (is_active = true);


COMMIT;


-- =============================================================
-- 적용 확인 쿼리
-- =============================================================
-- 1) 컬럼 확인
--    SELECT column_name, data_type FROM information_schema.columns
--     WHERE table_name='vehicle_models' ORDER BY ordinal_position;
--
-- 2) 인덱스
--    SELECT indexname FROM pg_indexes WHERE tablename='vehicle_models';
--
-- 3) 정책 (2개)
--    SELECT policyname FROM pg_policies WHERE tablename='vehicle_models';
--
-- 4) 트리거
--    SELECT trigger_name FROM information_schema.triggers
--     WHERE event_object_table='vehicle_models';
--
-- 5) 엑셀 import 후
--    SELECT COUNT(*) FROM vehicle_models;   -- 기대: 80
--    SELECT brand, COUNT(*) FROM vehicle_models GROUP BY brand ORDER BY COUNT(*) DESC;
-- =============================================================
