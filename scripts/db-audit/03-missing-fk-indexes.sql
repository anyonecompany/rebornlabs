-- =============================================================
-- 03-missing-fk-indexes.sql (v2 — 타입 캐스트 안전 버전)
-- FK가 정의됐는데 그 컬럼에 인덱스가 없는 경우 식별
-- =============================================================
-- 실행: Supabase Dashboard → SQL Editor
-- =============================================================

-- 1) FK 컬럼 ↔ 인덱스 존재 여부 비교 (information_schema 사용 — 안전)
WITH fk_columns AS (
  SELECT
    tc.table_schema,
    tc.table_name,
    tc.constraint_name,
    string_agg(kcu.column_name, ',' ORDER BY kcu.ordinal_position) AS fk_cols,
    array_agg(kcu.column_name ORDER BY kcu.ordinal_position) AS fk_col_array
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_schema = kcu.constraint_schema
    AND tc.constraint_name = kcu.constraint_name
  WHERE tc.table_schema = 'public'
    AND tc.constraint_type = 'FOREIGN KEY'
  GROUP BY tc.table_schema, tc.table_name, tc.constraint_name
),
indexed_cols AS (
  SELECT
    schemaname,
    tablename,
    indexname,
    string_agg(
      (SELECT attname FROM pg_attribute
       WHERE attrelid = (schemaname || '.' || tablename)::regclass
         AND attnum = ix.indkey[s.i - 1]),
      ',' ORDER BY s.i
    ) AS first_cols
  FROM pg_indexes pi
  JOIN pg_class c ON c.relname = pi.indexname
  JOIN pg_index ix ON ix.indexrelid = c.oid
  CROSS JOIN LATERAL generate_series(1, ix.indnatts) AS s(i)
  WHERE pi.schemaname = 'public'
  GROUP BY schemaname, tablename, indexname, ix.indkey
)
SELECT
  fk.table_name,
  fk.constraint_name,
  fk.fk_cols AS fk_columns,
  CASE WHEN EXISTS (
    SELECT 1 FROM indexed_cols ic
    WHERE ic.tablename = fk.table_name
      AND ic.first_cols LIKE fk.fk_cols || '%'
  ) THEN 'YES' ELSE 'MISSING' END AS has_index
FROM fk_columns fk
ORDER BY has_index ASC, fk.table_name;

-- 2) 더 단순한 버전 — 각 FK 컬럼 첫 번째에 대해 인덱스 존재만 체크
SELECT
  tc.table_name,
  tc.constraint_name,
  kcu.column_name AS fk_first_column,
  EXISTS (
    SELECT 1 FROM pg_indexes pi
    WHERE pi.schemaname = 'public'
      AND pi.tablename = tc.table_name
      AND pi.indexdef ~* ('\(' || kcu.column_name || '[,)]')
  ) AS has_index_on_first_col
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_schema = kcu.constraint_schema
  AND tc.constraint_name = kcu.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND kcu.ordinal_position = 1
ORDER BY has_index_on_first_col ASC, tc.table_name;

-- 3) PR #11 N2 마이그레이션 적용 검증 — FK 인덱스 5개
SELECT indexname, tablename
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_consultation_logs_dealer_id',
    'idx_delivery_checklists_dealer_id',
    'idx_documents_uploaded_by',
    'idx_sales_actor_id',
    'idx_audit_logs_target_id'
  )
ORDER BY indexname;
-- 5행 반환되어야 정상 (운영에 PR #11의 20260429_missing_fk_indexes.sql 적용 시).
-- 0행 또는 일부만 보이면 운영 적용 누락된 것.
