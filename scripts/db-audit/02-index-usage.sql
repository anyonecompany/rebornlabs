-- =============================================================
-- 02-index-usage.sql
-- 인덱스 사용률 진단 — pg_stat_user_indexes
-- =============================================================
-- 실행: Supabase Dashboard → SQL Editor
-- 결과: 모든 쿼리 결과 캡처 후 공유.
-- =============================================================

-- 1) 모든 인덱스 사용 통계 + 크기
SELECT
  schemaname,
  relname AS table_name,
  indexrelname AS index_name,
  idx_scan AS scans,
  idx_tup_read AS tuples_read,
  idx_tup_fetch AS tuples_fetched,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size,
  CASE
    WHEN idx_scan = 0 THEN 'UNUSED'
    WHEN idx_scan < 50 THEN 'LOW'
    WHEN idx_scan < 1000 THEN 'MEDIUM'
    ELSE 'HIGH'
  END AS usage_level
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan ASC, pg_relation_size(indexrelid) DESC;

-- 2) 미사용 인덱스만 (idx_scan = 0) — DROP 후보
SELECT
  relname AS table_name,
  indexrelname AS index_name,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE schemaname = 'public' AND idx_scan = 0
ORDER BY pg_relation_size(indexrelid) DESC;

-- 3) 중복 인덱스 (같은 테이블에 같은 컬럼 첫 번째로 시작)
SELECT
  pg_get_indexdef(idx1.indexrelid) AS def1,
  pg_get_indexdef(idx2.indexrelid) AS def2,
  pg_size_pretty(pg_relation_size(idx2.indexrelid)) AS dup_size
FROM pg_stat_user_indexes idx1
JOIN pg_stat_user_indexes idx2
  ON idx1.relid = idx2.relid
  AND idx1.indexrelid < idx2.indexrelid
WHERE idx1.schemaname = 'public'
  AND (
    SELECT array_agg(attname ORDER BY attnum)
    FROM pg_attribute
    WHERE attrelid = idx1.indexrelid AND attnum > 0
  ) IS NOT DISTINCT FROM (
    SELECT array_agg(attname ORDER BY attnum)
    FROM pg_attribute
    WHERE attrelid = idx2.indexrelid AND attnum > 0
  );

-- 4) 테이블별 인덱스 hit ratio (95%+ 권장)
SELECT
  relname AS table_name,
  CASE WHEN idx_blks_read + idx_blks_hit = 0 THEN 0
       ELSE round(100.0 * idx_blks_hit / (idx_blks_read + idx_blks_hit), 2)
  END AS hit_ratio_pct,
  idx_blks_hit AS hits,
  idx_blks_read AS misses
FROM pg_statio_user_indexes
WHERE schemaname = 'public'
ORDER BY (idx_blks_read + idx_blks_hit) DESC
LIMIT 20;

-- 통계 리셋 시점 (참고)
SELECT stats_reset FROM pg_stat_database WHERE datname = current_database();
