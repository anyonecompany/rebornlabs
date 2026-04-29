-- =============================================================
-- 20260429_sales_fee_checks.sql
-- 목적: sales 테이블 금액 컬럼에 CHECK 제약 추가 (P1 — 어드민 DB 무결성)
-- 적용 주체: 대표 수동
-- =============================================================
--
-- 배경 (현재 sales 컬럼 정의):
--   dealer_fee     INTEGER NOT NULL              -- 500000 또는 1000000
--   marketing_fee  INTEGER NOT NULL DEFAULT 0    -- 700000 또는 0
--   is_db_provided BOOLEAN NOT NULL              -- DB 제공 상담 여부
--
--   COMMENT 에는 허용 값이 명시되어 있으나 CHECK 제약이 없어 잘못된 값
--   (음수, 임의 금액, DB 제공/딜러 수수료 정합성 위반)이 그대로 입력될
--   가능성이 있다. 정산 데이터의 신뢰성을 위해 DB 레벨에서 강제한다.
--
-- 추가 제약:
--   1) sales_dealer_fee_nonneg       : dealer_fee >= 0
--   2) sales_dealer_fee_allowed      : dealer_fee IN (500000, 1000000)
--   3) sales_marketing_fee_nonneg    : marketing_fee >= 0
--   4) sales_marketing_fee_allowed   : marketing_fee IN (0, 700000)
--   5) sales_db_provided_fee_consistency
--        : is_db_provided=true ⇒ dealer_fee=1000000
--          (DB 제공 상담 건은 딜러 수수료 100만 원 고정)
--
-- 안전성:
--   기존 데이터에 CHECK 위반이 있을 경우 ALTER ... ADD CONSTRAINT 가
--   즉시 실패한다. 이를 방지하기 위해 NOT VALID 옵션으로 등록 후,
--   별도 단계에서 데이터 정리 → VALIDATE CONSTRAINT 를 권고한다.
--   NOT VALID 상태에서도 신규/갱신 row 에는 즉시 적용된다.
--
-- 운영 적용 가이드:
--   STEP 1) 본 마이그레이션 실행 (NOT VALID 로 등록)
--   STEP 2) 위반 데이터 점검:
--      SELECT id, dealer_fee, marketing_fee, is_db_provided
--        FROM sales
--       WHERE dealer_fee < 0
--          OR dealer_fee NOT IN (500000, 1000000)
--          OR marketing_fee < 0
--          OR marketing_fee NOT IN (0, 700000)
--          OR (is_db_provided = true AND dealer_fee <> 1000000);
--   STEP 3) 위반 데이터 정정 (대표 승인 후 UPDATE)
--   STEP 4) 검증으로 전환:
--      ALTER TABLE sales VALIDATE CONSTRAINT sales_dealer_fee_nonneg;
--      ALTER TABLE sales VALIDATE CONSTRAINT sales_dealer_fee_allowed;
--      ALTER TABLE sales VALIDATE CONSTRAINT sales_marketing_fee_nonneg;
--      ALTER TABLE sales VALIDATE CONSTRAINT sales_marketing_fee_allowed;
--      ALTER TABLE sales VALIDATE CONSTRAINT sales_db_provided_fee_consistency;
-- =============================================================

-- 1) dealer_fee 음수 금지
ALTER TABLE sales
    DROP CONSTRAINT IF EXISTS sales_dealer_fee_nonneg;
ALTER TABLE sales
    ADD CONSTRAINT sales_dealer_fee_nonneg
    CHECK (dealer_fee >= 0)
    NOT VALID;

-- 2) dealer_fee 허용값 (500000, 1000000)
ALTER TABLE sales
    DROP CONSTRAINT IF EXISTS sales_dealer_fee_allowed;
ALTER TABLE sales
    ADD CONSTRAINT sales_dealer_fee_allowed
    CHECK (dealer_fee IN (500000, 1000000))
    NOT VALID;

-- 3) marketing_fee 음수 금지
ALTER TABLE sales
    DROP CONSTRAINT IF EXISTS sales_marketing_fee_nonneg;
ALTER TABLE sales
    ADD CONSTRAINT sales_marketing_fee_nonneg
    CHECK (marketing_fee >= 0)
    NOT VALID;

-- 4) marketing_fee 허용값 (0, 700000)
ALTER TABLE sales
    DROP CONSTRAINT IF EXISTS sales_marketing_fee_allowed;
ALTER TABLE sales
    ADD CONSTRAINT sales_marketing_fee_allowed
    CHECK (marketing_fee IN (0, 700000))
    NOT VALID;

-- 5) DB 제공 상담 건은 딜러 수수료 100만 원 고정
ALTER TABLE sales
    DROP CONSTRAINT IF EXISTS sales_db_provided_fee_consistency;
ALTER TABLE sales
    ADD CONSTRAINT sales_db_provided_fee_consistency
    CHECK (is_db_provided = false OR dealer_fee = 1000000)
    NOT VALID;

COMMENT ON CONSTRAINT sales_dealer_fee_nonneg ON sales
    IS 'dealer_fee 는 0 이상이어야 한다 (P1 어드민 DB 무결성).';
COMMENT ON CONSTRAINT sales_dealer_fee_allowed ON sales
    IS 'dealer_fee 허용 값: 500000 또는 1000000.';
COMMENT ON CONSTRAINT sales_marketing_fee_nonneg ON sales
    IS 'marketing_fee 는 0 이상이어야 한다.';
COMMENT ON CONSTRAINT sales_marketing_fee_allowed ON sales
    IS 'marketing_fee 허용 값: 0 또는 700000.';
COMMENT ON CONSTRAINT sales_db_provided_fee_consistency ON sales
    IS 'is_db_provided=true 인 판매는 dealer_fee 가 1000000 이어야 한다.';
