-- =============================================================
-- 04-slow-queries.sql
-- 슬로우 쿼리 / 풀 스캔 진단
-- =============================================================
-- 실행: Supabase Dashboard → SQL Editor
-- 사전 조건: pg_stat_statements 익스텐션 활성 필요.
--   확인: SELECT extname FROM pg_extension WHERE extname = 'pg_stat_statements';
--   비활성 시 본 파일의 쿼리 1, 2 스킵하고 3, 4만 실행.
-- =============================================================

-- 1) 평균 실행 시간 상위 20개 쿼리 (pg_stat_statements 필요)
SELECT
  calls,
  round(total_exec_time::numeric, 2) AS total_ms,
  round(mean_exec_time::numeric, 2) AS mean_ms,
  round(stddev_exec_time::numeric, 2) AS stddev_ms,
  rows AS total_rows,
  round(100.0 * shared_blks_hit / NULLIF(shared_blks_hit + shared_blks_read, 0), 2) AS hit_pct,
  substring(query, 1, 200) AS query_preview
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat_statements%'
  AND query NOT LIKE '%pg_stat_user%'
ORDER BY mean_exec_time DESC
LIMIT 20;

-- 2) 총 누적 시간 상위 20개 (가장 비용이 큰 쿼리)
SELECT
  calls,
  round(total_exec_time::numeric, 2) AS total_ms,
  round(mean_exec_time::numeric, 2) AS mean_ms,
  rows,
  substring(query, 1, 200) AS query_preview
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat_%'
ORDER BY total_exec_time DESC
LIMIT 20;

-- 3) 테이블별 seq_scan vs idx_scan 비율 (풀 스캔 핫스팟)
SELECT
  relname AS table_name,
  seq_scan,
  seq_tup_read,
  idx_scan,
  CASE WHEN seq_scan + idx_scan = 0 THEN 0
       ELSE round(100.0 * seq_scan / (seq_scan + idx_scan), 2)
  END AS seq_pct,
  n_live_tup AS row_count,
  pg_size_pretty(pg_total_relation_size(relid)) AS size
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY seq_tup_read DESC
LIMIT 20;

-- 4) 큰 테이블 + seq_scan 많은 곳 (인덱스 추가 후보)
SELECT
  relname,
  seq_scan,
  seq_tup_read,
  idx_scan,
  pg_size_pretty(pg_total_relation_size(relid)) AS size,
  n_live_tup
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND seq_scan > 100
  AND n_live_tup > 1000
ORDER BY seq_tup_read DESC;
