-- =============================================================
-- 20260426_vehicle_models_monthly_payment.sql
-- 작성일: 2026-04-26
-- 범위: vehicle_models.monthly_payment 컬럼 추가
--
-- 배경:
--   2026-04-26 새 가격표(업로드.xlsx) 적용. 행마다 곱수가 1.185~1.188로 흩어져
--   기존 1.35 공식이 깨짐. 월 납입료를 엑셀에서 직접 가져와 저장한다.
--
-- 정책:
--   - 공식 백필 안 함. 엑셀 import 시점에만 채워짐.
--   - 컬럼은 nullable. NULL이면 고객 페이지에서 "—" 표시.
--   - 추후 모든 행이 엑셀에 포함된 게 확인되면 별도 마이그레이션으로 NOT NULL 전환.
-- =============================================================

BEGIN;

ALTER TABLE vehicle_models
  ADD COLUMN IF NOT EXISTS monthly_payment BIGINT
    CHECK (monthly_payment IS NULL OR monthly_payment > 0);

COMMENT ON COLUMN vehicle_models.monthly_payment
  IS '월 납입료 (원). 엑셀 입력값을 그대로 저장. 공식 계산 안 함. NULL = 미설정.';

COMMIT;


-- =============================================================
-- 적용 확인 쿼리
-- =============================================================
-- 1) 컬럼 확인 (nullable 여부)
--    SELECT column_name, is_nullable, data_type
--      FROM information_schema.columns
--     WHERE table_name='vehicle_models' AND column_name='monthly_payment';
--    기대: monthly_payment | YES | bigint
--
-- 2) 임포트 후 표본 검증
--    SELECT brand, model, trim, monthly_payment
--      FROM vehicle_models
--     WHERE brand='벤츠' AND trim='G400d';
--    기대: 3160000 (1.35 공식이면 3600000)
-- =============================================================
