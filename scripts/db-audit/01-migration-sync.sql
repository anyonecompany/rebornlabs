-- =============================================================
-- 01-migration-sync.sql
-- 운영 DB 실제 schema vs 코드 마이그레이션 파일 sync 진단
-- =============================================================
-- 실행: Supabase Dashboard → SQL Editor
-- 결과: 각 쿼리 결과를 캡처해서 공유해주세요.
-- 주의: 모든 쿼리 read-only.
-- =============================================================

-- 1) 모든 public 스키마 테이블 + 컬럼 수
SELECT
  t.table_name,
  COUNT(c.column_name) AS column_count,
  pg_size_pretty(pg_total_relation_size(quote_ident(t.table_name)::regclass)) AS total_size,
  (SELECT COUNT(*) FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = t.table_name) AS exists_check
FROM information_schema.tables t
LEFT JOIN information_schema.columns c
  ON c.table_schema = t.table_schema AND c.table_name = t.table_name
WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
GROUP BY t.table_name
ORDER BY t.table_name;

-- 2) Enum 타입 + 값 전체 (코드와 비교용)
SELECT
  n.nspname AS schema,
  t.typname AS enum_name,
  string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder) AS values
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
GROUP BY n.nspname, t.typname
ORDER BY t.typname;

-- 3) 운영 DB의 함수 목록 (RPC)
SELECT
  p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS returns,
  CASE p.prosecdef WHEN true THEN 'DEFINER' ELSE 'INVOKER' END AS security
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname NOT LIKE 'pg\_%' ESCAPE '\'
ORDER BY p.proname;

-- 4) 트리거 목록 (auto_vehicle_status_on_consult, restore_vehicle_status DROP 확인)
SELECT
  event_object_table AS table_name,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- 5) 익스텐션 활성 목록 (pg_trgm, pg_stat_statements 등)
SELECT extname, extversion
FROM pg_extension
ORDER BY extname;

-- 코드 측 마이그레이션 파일 25개:
-- 001_schema, 002_triggers, 003_functions, 004_indexes, 005_rls,
-- 006_views, 007_storage, 008_jwt_hook,
-- 20260419_baseline_contracts_marketing_companies (적용 금지),
-- 20260420_org_structure, 20260420_quotes,
-- 20260421_vehicle_models, 20260422_apply_utm, 20260422_contract_type,
-- 20260423_commissions, 20260424_marketing_companies_ref_code,
-- 20260426_vehicle_models_monthly_payment,
-- 20260429_dashboard_stats_managers, 20260429_drop_dead_triggers,
-- 20260429_expenses_status, 20260429_missing_fk_indexes,
-- 20260429_quotes_price_snapshot, 20260429_sales_fee_checks,
-- 20260429_sales_unique_active, 20260429_vehicles_search_trgm
