-- =============================================================
-- 20260422_contract_type.sql — 리본랩스: 계약서 사고/무사고 분기
-- 작성일: 2026-04-22
-- 범위: contracts 테이블에 contract_type 컬럼 추가
--
-- 기존 레코드는 DEFAULT 'accident'로 자동 채워져 기존 계약서 내용 유지.
-- 신규 계약서부터 직원이 "사고 차량"/"무사고 차량" 선택 가능.
-- =============================================================

BEGIN;

-- -------------------------------------------------------------
-- contract_type 컬럼 추가
-- 'accident' = 사고차량용 (기존 6·7조 그대로)
-- 'safe'     = 무사고차량용 (6조·7조 별도 텍스트)
-- -------------------------------------------------------------

ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS contract_type TEXT NOT NULL DEFAULT 'accident'
    CHECK (contract_type IN ('accident', 'safe'));

COMMENT ON COLUMN contracts.contract_type IS
  '계약서 유형. accident=사고차량용(기본, 6·7조 기존 텍스트) / safe=무사고차량용(6·7조 별도 텍스트).';

COMMIT;


-- =============================================================
-- 적용 확인 쿼리
-- =============================================================
-- 1) 컬럼 추가 확인
--    SELECT column_name, data_type, column_default
--      FROM information_schema.columns
--     WHERE table_name='contracts' AND column_name='contract_type';
--
-- 2) 기존 레코드 모두 'accident'로 채워졌는지
--    SELECT contract_type, COUNT(*) FROM contracts GROUP BY contract_type;
--
-- 3) CHECK 제약 확인
--    SELECT conname, pg_get_constraintdef(oid)
--      FROM pg_constraint
--     WHERE conrelid = 'contracts'::regclass
--       AND contype = 'c';
-- =============================================================
