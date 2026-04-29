-- =============================================================
-- 06-rls-security.sql
-- RLS 정책 + 보안 함수 진단
-- =============================================================
-- 실행: Supabase Dashboard → SQL Editor
-- =============================================================

-- 1) RLS가 ENABLE 안 된 public 테이블 (공개 위험)
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced,
  pg_size_pretty(pg_total_relation_size(c.oid)) AS size
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relrowsecurity ASC, c.relname;

-- 2) RLS가 ENABLE인데 정책 0개인 테이블 (사실상 service_role만 접근)
SELECT
  c.relname AS table_name,
  COUNT(p.polname) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity = true
GROUP BY c.relname
HAVING COUNT(p.polname) = 0
ORDER BY c.relname;

-- 3) 모든 RLS 정책 목록
SELECT
  schemaname,
  tablename,
  policyname,
  cmd AS command,
  roles,
  CASE
    WHEN qual IS NULL THEN '<no using>'
    ELSE substring(qual::text, 1, 100)
  END AS using_clause,
  CASE
    WHEN with_check IS NULL THEN '<no check>'
    ELSE substring(with_check::text, 1, 100)
  END AS with_check_clause
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 4) SECURITY DEFINER 함수 + search_path 설정 여부 (search_path 없으면 보안 위험)
SELECT
  p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS args,
  CASE p.prosecdef WHEN true THEN 'DEFINER' ELSE 'INVOKER' END AS security,
  COALESCE(
    (SELECT pg_get_functiondef(p.oid) ~ 'SET search_path'),
    false
  ) AS has_search_path,
  p.proconfig AS config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef = true
ORDER BY has_search_path ASC, p.proname;
-- search_path 없는 SECURITY DEFINER 함수가 있으면 search_path 인젝션 위험.

-- 5) public schema에서 직접 실행 가능한 함수 (anon/authenticated 권한)
SELECT
  p.proname,
  array_agg(DISTINCT acl.grantee::regrole) AS granted_to
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN LATERAL aclexplode(p.proacl) acl
WHERE n.nspname = 'public'
  AND acl.privilege_type = 'EXECUTE'
  AND acl.grantee::regrole::text IN ('anon', 'authenticated', 'public')
GROUP BY p.proname
ORDER BY p.proname;

-- 6) views의 SECURITY 모델 (security_invoker 활성 여부)
SELECT
  c.relname AS view_name,
  CASE
    WHEN reloptions::text LIKE '%security_invoker=true%' THEN 'INVOKER'
    ELSE 'DEFINER (default)'
  END AS security_mode,
  reloptions
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'v'
ORDER BY c.relname;
-- vehicles_dealer_view, dealers_name_view 등이 DEFINER면 RLS bypass — 의도 확인 필요.

-- 7) 익명 access 가능 테이블 (anon role에 SELECT 권한)
SELECT
  c.relname AS table_name,
  acl.privilege_type AS privilege
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(c.relacl) acl
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND acl.grantee::regrole::text = 'anon'
ORDER BY c.relname, acl.privilege_type;
