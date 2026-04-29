-- =============================================================
-- 07-vacuum-stats.sql
-- 통계 신선도 + VACUUM 상태 진단
-- =============================================================
-- 실행: Supabase Dashboard → SQL Editor
-- =============================================================

-- 1) 테이블별 VACUUM/ANALYZE 마지막 실행 시각
SELECT
  schemaname,
  relname AS table_name,
  n_live_tup AS rows,
  n_dead_tup AS dead_rows,
  CASE WHEN n_live_tup = 0 THEN 0
       ELSE round(100.0 * n_dead_tup / n_live_tup, 2)
  END AS dead_pct,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze,
  pg_size_pretty(pg_total_relation_size(relid)) AS size
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_dead_tup DESC;

-- 2) Dead tuple 비율이 높은 테이블 (VACUUM 필요 후보)
SELECT
  relname AS table_name,
  n_live_tup,
  n_dead_tup,
  round(100.0 * n_dead_tup / NULLIF(n_live_tup, 0), 2) AS dead_pct,
  pg_size_pretty(pg_total_relation_size(relid)) AS size
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND n_live_tup > 100
  AND n_dead_tup > 0
  AND (n_dead_tup::float / NULLIF(n_live_tup, 0)) > 0.1  -- 10% 이상
ORDER BY (n_dead_tup::float / NULLIF(n_live_tup, 0)) DESC;

-- 3) ANALYZE 한 번도 안 된 테이블 (statistics 부재)
SELECT
  relname AS table_name,
  n_live_tup,
  last_analyze,
  last_autoanalyze
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND last_analyze IS NULL
  AND last_autoanalyze IS NULL
  AND n_live_tup > 0;

-- 4) 7일 이상 ANALYZE 안 된 테이블 (계획 정확도 저하)
SELECT
  relname AS table_name,
  n_live_tup,
  GREATEST(
    COALESCE(last_analyze, '1970-01-01'::timestamptz),
    COALESCE(last_autoanalyze, '1970-01-01'::timestamptz)
  ) AS last_any_analyze,
  EXTRACT(DAYS FROM (now() - GREATEST(
    COALESCE(last_analyze, '1970-01-01'::timestamptz),
    COALESCE(last_autoanalyze, '1970-01-01'::timestamptz)
  )))::int AS days_since
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND n_live_tup > 100
ORDER BY days_since DESC
LIMIT 20;

-- 5) Table bloat 추정 (Postgres 핵심: pg_total - pg_relation - index = bloat 추정)
SELECT
  relname AS table_name,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
  pg_size_pretty(pg_relation_size(relid)) AS table_size,
  pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) AS toast_index_size,
  n_live_tup,
  n_dead_tup
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 15;

-- 6) Connection / Long-running query 상태
SELECT
  state,
  COUNT(*) AS conn_count,
  max(EXTRACT(EPOCH FROM (now() - state_change))::int) AS max_state_age_sec
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY state
ORDER BY conn_count DESC;
