-- =============================================================
-- 20260424_marketing_companies_ref_code.sql — ref_code 컬럼 추가
-- 작성일: 2026-04-24
-- 목적: 공개 URL 의 ?ref= 값을 한글 업체명에서 6자 랜덤 코드로 전환.
--       매핑 정보는 어드민(/users 마케팅 업체 섹션)에서만 노출.
--
-- 호환성:
--   - 기존 한글 ref 유입(이미 SNS 게시 중인 링크)은 앱 레이어 폴백으로 동작 유지.
--   - 신규 공유 URL 만 ref_code 형태(/^[a-z0-9]{6}$/)로 발급.
-- =============================================================

BEGIN;

-- 1. 컬럼 추가 (NULL 허용으로 시작 — 백필 후 NOT NULL)
ALTER TABLE marketing_companies
  ADD COLUMN IF NOT EXISTS ref_code TEXT;

-- 2. 기존 행 백필 — MD5(random || id) 첫 6자.
--    충돌 가능성 매우 낮음(36^6 ≈ 22억), 이론상 충돌 시 후속 INSERT 가 UNIQUE 위반으로 잡힘.
UPDATE marketing_companies
   SET ref_code = LOWER(SUBSTRING(MD5(RANDOM()::TEXT || id::TEXT), 1, 6))
 WHERE ref_code IS NULL;

-- 3. NOT NULL + UNIQUE 제약
ALTER TABLE marketing_companies
  ALTER COLUMN ref_code SET NOT NULL;

ALTER TABLE marketing_companies
  ADD CONSTRAINT marketing_companies_ref_code_unique UNIQUE (ref_code);

-- 4. 인덱스 — /apply 진입 시 ref_code 조회용
CREATE INDEX IF NOT EXISTS idx_marketing_companies_ref_code
  ON marketing_companies (ref_code);

COMMIT;

-- =============================================================
-- 검증 쿼리 (적용 후 실행)
-- =============================================================
-- 1) 모든 행에 ref_code 백필됐는지
--    SELECT COUNT(*) FROM marketing_companies WHERE ref_code IS NULL;
--    -- 기대: 0
--
-- 2) UNIQUE 위반 없는지
--    SELECT ref_code, COUNT(*) FROM marketing_companies
--      GROUP BY ref_code HAVING COUNT(*) > 1;
--    -- 기대: 0행
--
-- 3) 매핑 확인
--    SELECT name, ref_code FROM marketing_companies ORDER BY name;
-- =============================================================
