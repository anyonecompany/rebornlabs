-- =============================================================
-- 20260429_sales_unique_active.sql
-- 목적: 동일 vehicle_id 의 활성(미취소) 판매 중복 방지 (P1 — 어드민 DB 무결성)
-- 적용 주체: 대표 수동
-- =============================================================
--
-- 배경:
--   sales 테이블은 vehicle_id 에 UNIQUE 제약이 없다.
--   취소(cancelled_at NOT NULL) 후 재판매가 정상 시나리오이므로 단순
--   UNIQUE 는 부적절하다. 대신 "활성 거래" 만 유일성을 갖도록 partial
--   unique index 를 적용한다.
--
--   활성 거래 정의: cancelled_at IS NULL
--   취소된 행은 동일 vehicle_id 로 여러 건 존재 가능 (이력 보존).
--
-- 안전성:
--   IF NOT EXISTS 로 멱등성 보장.
--   기존 데이터에 vehicle_id 별 활성 행이 2건 이상이면 인덱스 생성이
--   실패한다 → 사전 점검 쿼리로 정리 후 적용해야 한다.
--
-- 사전 점검 (필수):
--   SELECT vehicle_id, COUNT(*) AS active_cnt
--     FROM sales
--    WHERE cancelled_at IS NULL
--    GROUP BY vehicle_id
--   HAVING COUNT(*) > 1;
--   → 결과가 0행이어야 한다. 행이 있으면:
--      a) 가장 최근 1건만 유지하고 나머지는 cancelled_at + cancel_reason
--         '데이터 정리: 중복 활성 판매' 로 마킹
--      b) 또는 대표 확인 후 잘못 등록된 행 삭제
--   정리 완료 후 본 마이그레이션 실행.
--
-- 운영 적용 가이드:
--   1) 사전 점검 쿼리 실행 → 0행 확인
--   2) 본 마이그레이션 적용 (1초 이내, 잠금 짧음)
--   3) 사후 검증:
--      SELECT indexname FROM pg_indexes
--       WHERE indexname = 'idx_sales_vehicle_active';
--   4) 운영 무중단 적용이 필요하면 별도 세션에서:
--      CREATE UNIQUE INDEX CONCURRENTLY idx_sales_vehicle_active
--        ON sales (vehicle_id) WHERE cancelled_at IS NULL;
-- =============================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_vehicle_active
    ON sales (vehicle_id)
    WHERE cancelled_at IS NULL;

COMMENT ON INDEX idx_sales_vehicle_active
    IS '활성(미취소) 판매는 vehicle_id 기준 유일해야 한다. 취소된 이력은 중복 허용 (재판매 시나리오).';

-- =============================================================
-- [참고용] contracts / marketing_companies RLS 운영 검증 SQL
-- 본 파일에서는 코드 변경 없음. 운영 적용 시 아래 쿼리로 RLS 가
-- 의도대로 적용되는지 점검할 것.
-- =============================================================
--
-- 1) RLS 활성화 여부:
--    SELECT relname, relrowsecurity
--      FROM pg_class
--     WHERE relname IN ('contracts', 'marketing_companies');
--    → relrowsecurity = true 여야 한다.
--
-- 2) 정책 목록:
--    SELECT schemaname, tablename, policyname, cmd, qual, with_check
--      FROM pg_policies
--     WHERE tablename IN ('contracts', 'marketing_companies')
--     ORDER BY tablename, policyname;
--
-- 3) 어드민(role='admin') 으로 SELECT/INSERT/UPDATE 가능, 일반 딜러는
--    contracts 의 자신 행만 읽기 가능 — 실제 JWT 로 SET LOCAL ROLE 후
--    SELECT 검증.
--
-- 4) 누락된 정책이 발견되면 별도 마이그레이션으로 추가 (본 파일 수정 금지).
