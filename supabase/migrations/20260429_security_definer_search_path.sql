-- =============================================================
-- 20260429_security_definer_search_path.sql
-- SECURITY DEFINER 함수에 SET search_path = public 추가
-- =============================================================
-- 배경 (DB 진단 06번 #4 결과):
-- - SECURITY DEFINER 함수 6개 중 4개에 search_path 미설정 발견
-- - search_path 인젝션 공격으로 권한 escalation 가능 (특히 sales/commissions
--   직접 변경 권한이 있는 complete_sale/cancel_sale은 위협 큼).
--
-- 수정 대상 4개 (이미 정상인 get_subordinate_ids, custom_access_token_hook 제외):
--   1) cancel_sale(uuid, uuid, text)
--   2) complete_sale(uuid, uuid, uuid, uuid, boolean)
--   3) get_dashboard_stats(uuid, text)
--   4) insert_consultation_from_gas(text, text, text, text, text)
--
-- 운영 적용 (대표 수동, Supabase Dashboard SQL Editor):
--   이 파일 전체 실행. ALTER FUNCTION은 즉시 적용되며 함수 본체 변경 없음.
--
-- 검증:
--   SELECT p.proname, p.proconfig
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.prosecdef = true
--   ORDER BY p.proname;
--   → 6개 함수 모두 proconfig에 search_path=public 표시.
-- =============================================================

ALTER FUNCTION public.cancel_sale(uuid, uuid, text)
  SET search_path = public;

ALTER FUNCTION public.complete_sale(uuid, uuid, uuid, uuid, boolean)
  SET search_path = public;

ALTER FUNCTION public.get_dashboard_stats(uuid, text)
  SET search_path = public;

ALTER FUNCTION public.insert_consultation_from_gas(text, text, text, text, text)
  SET search_path = public;
