-- =============================================================
-- verify-commissions.sql — 조직 Phase 3 수당 자동 배분 검증 쿼리
-- 작성일: 2026-04-23
-- 사용법: 마이그레이션 적용 후 Supabase SQL Editor에서 실행 (읽기 전용).
--
-- 검증 대상 6케이스 (대표 결정: 전부 건당 20만원):
--   1 DB+dealer        → 3건 60만 (dealer + team_leader + director)
--   2 DB+team_leader   → 2건 40만 (team_leader + director)
--   3 DB+director      → 1건 20만 (director)
--   4 개인+dealer      → 3건 60만
--   5 개인+team_leader → 2건 40만
--   6 개인+director    → 1건 20만
--
-- 상위자 없는 경우 해당 row 생성 안 됨 (그래서 "최대 N건" 형태).
-- =============================================================


-- -------------------------------------------------------------
-- 1) 스키마 적용 확인
-- -------------------------------------------------------------

-- sales 신규 컬럼
SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'sales'
    AND column_name IN ('delivery_confirmed_at', 'delivery_confirmed_by')
  ORDER BY column_name;
-- 기대: 2행

-- commissions 테이블 존재 + 컬럼
SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'commissions'
  ORDER BY ordinal_position;
-- 기대: id, sale_id, recipient_id, recipient_role, amount, commission_type, case_type, confirmed_at

-- RLS 정책 3개
SELECT policyname
  FROM pg_policies
  WHERE tablename = 'commissions'
  ORDER BY policyname;
-- 기대: commissions_select_admin_staff, commissions_select_director_team_leader,
--       commissions_select_self


-- -------------------------------------------------------------
-- 2) 케이스별 수당 집계
-- 각 case_type 의 row 수, 총액, recipient_role 분포
-- -------------------------------------------------------------

SELECT
  case_type,
  COUNT(*) AS row_count,
  SUM(amount) AS total_amount,
  STRING_AGG(DISTINCT recipient_role, ',' ORDER BY recipient_role) AS roles,
  STRING_AGG(DISTINCT commission_type, ',' ORDER BY commission_type) AS types
FROM commissions
GROUP BY case_type
ORDER BY case_type;


-- -------------------------------------------------------------
-- 3) 판매 건별 수당 상세
-- 특정 sale_id 에 대한 수당 레코드 확인
-- -------------------------------------------------------------

-- 특정 판매건 상세 (id 교체 후 실행)
-- SELECT s.id AS sale_id,
--        s.is_db_provided,
--        s.delivery_confirmed_at,
--        p.role AS dealer_role,
--        c.recipient_role,
--        c.commission_type,
--        c.amount,
--        c.case_type
--   FROM sales s
--   JOIN profiles p ON p.id = s.dealer_id
--   LEFT JOIN commissions c ON c.sale_id = s.id
--   WHERE s.id = '<SALE_ID>'
--   ORDER BY c.recipient_role;


-- -------------------------------------------------------------
-- 4) 무결성 체크
-- -------------------------------------------------------------

-- (a) 확인된 판매건 중 commissions 가 비어 있는 건 없어야 함
SELECT s.id, s.delivery_confirmed_at
  FROM sales s
  LEFT JOIN commissions c ON c.sale_id = s.id
  WHERE s.delivery_confirmed_at IS NOT NULL
    AND c.id IS NULL;
-- 기대: 0행

-- (b) 같은 판매건의 같은 수령자에게 같은 타입이 2번 들어간 경우 (UNIQUE 제약 확인)
SELECT sale_id, recipient_id, commission_type, COUNT(*)
  FROM commissions
  GROUP BY sale_id, recipient_id, commission_type
  HAVING COUNT(*) > 1;
-- 기대: 0행

-- (c) amount 는 항상 200000 (대표 결정 반영 확인)
SELECT DISTINCT amount FROM commissions;
-- 기대: 200000 한 행


-- -------------------------------------------------------------
-- 5) 감사 로그 확인
-- -------------------------------------------------------------

SELECT al.created_at, al.actor_id, al.target_id,
       al.metadata->>'case_type' AS case_type,
       al.metadata->>'total_amount' AS total_amount
  FROM audit_logs al
  WHERE al.action = 'sale.delivery_confirmed'
  ORDER BY al.created_at DESC
  LIMIT 20;
