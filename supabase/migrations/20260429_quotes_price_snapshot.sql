-- ============================================================
-- 20260429_quotes_price_snapshot.sql
-- 견적서 발행 시점 차량 가격 스냅샷 컬럼 추가
--
-- 목적: 견적 발행 후 vehicles 테이블의 가격이 변경되어도
--       고객에게 보여지는 견적 가격이 바뀌지 않도록 freeze.
--
-- 운영 적용: Supabase 대시보드 → SQL Editor에서 수동 실행 (auto-migration 미적용)
-- 롤백: 아래 rollback 주석 참고
--
-- rollback:
--   ALTER TABLE quotes DROP COLUMN IF EXISTS quoted_selling_price;
--   ALTER TABLE quotes DROP COLUMN IF EXISTS quoted_deposit;
--   ALTER TABLE quotes DROP COLUMN IF EXISTS quoted_monthly_payment;
-- ============================================================

BEGIN;

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS quoted_selling_price INTEGER;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS quoted_deposit        INTEGER;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS quoted_monthly_payment INTEGER;

COMMENT ON COLUMN quotes.quoted_selling_price   IS '견적 발행 시점 차량 판매가 스냅샷 (vehicles.selling_price)';
COMMENT ON COLUMN quotes.quoted_deposit         IS '견적 발행 시점 계약금 스냅샷 (vehicles.deposit)';
COMMENT ON COLUMN quotes.quoted_monthly_payment IS '견적 발행 시점 월 납입금 스냅샷 (vehicles.monthly_payment)';

-- backfill: 기존 견적은 현재 차량 가격으로 채움 (NULL 상태보다 낫지만 당시 가격과 다를 수 있음)
-- 운영팀 판단에 따라 실행 여부 결정:
--
-- UPDATE quotes q
--    SET quoted_selling_price    = v.selling_price,
--        quoted_deposit          = v.deposit,
--        quoted_monthly_payment  = v.monthly_payment
--   FROM vehicles v
--  WHERE q.vehicle_id = v.id
--    AND q.quoted_selling_price IS NULL;

COMMIT;
