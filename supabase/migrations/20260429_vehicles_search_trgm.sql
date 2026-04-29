-- =============================================================
-- 20260429_vehicles_search_trgm.sql
-- 차량 검색(make/model/vehicle_code ILIKE)에 trigram GIN 인덱스 추가
-- =============================================================
-- 배경:
-- - vehicles 목록 검색에서 make/model/vehicle_code를 ILIKE '%keyword%' 패턴으로 조회
-- - B-tree 인덱스는 leading-wildcard ILIKE에 사용 불가 → 풀 테이블 스캔 발생
-- - 차량 수가 늘어날수록 검색 응답 시간이 선형 증가
--
-- 해결:
-- - pg_trgm 확장 + GIN 인덱스로 ILIKE 검색을 인덱스 스캔으로 전환
-- - 1000건 규모에서 수십 ms 이내로 응답
--
-- 운영 적용:
-- - 운영 Supabase Dashboard → SQL Editor에서 직접 실행
-- - 인덱스 생성은 행 수에 비례 (1000건 기준 < 1초)
-- - CONCURRENTLY 옵션은 트랜잭션 밖에서만 동작하므로 본 파일에서는 일반 CREATE INDEX 사용
-- =============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_vehicles_make_trgm
  ON vehicles USING gin (make gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_vehicles_model_trgm
  ON vehicles USING gin (model gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_vehicles_vehicle_code_trgm
  ON vehicles USING gin (vehicle_code gin_trgm_ops);

-- 검증 쿼리 (적용 후 수동 확인용):
-- EXPLAIN ANALYZE
--   SELECT id, make, model, vehicle_code FROM vehicles
--   WHERE make ILIKE '%현대%' OR model ILIKE '%현대%' OR vehicle_code ILIKE '%현대%'
--   LIMIT 100;
-- → "Bitmap Index Scan on idx_vehicles_*_trgm" 출현하면 정상
