-- =============================================================
-- create-test-manager-accounts.sql
-- 작성일: 2026-04-22
-- 목적: director(본부장), team_leader(팀장) 테스트 계정 생성
--
-- 실행 방식: 일회성 SQL (마이그레이션 아님)
--
-- Supabase 에서 auth.users 는 SQL 로 직접 삽입하기 번거롭기 때문에 아래
-- 두 단계로 수동 실행한다.
--
-- ─── STEP 1. Supabase Dashboard 에서 사용자 생성 ───────────────
--
--   1) Supabase Dashboard → Authentication → Users → "Add user"
--   2) 아래 2건을 각각 생성:
--        a) Email: director@anyonecompany.kr
--           Password: dosldnjs1!
--           Auto Confirm User: ON
--        b) Email: team_leader@anyonecompany.kr
--           Password: dosldnjs1!
--           Auto Confirm User: ON
--   3) 생성된 각 사용자의 UUID 를 확인 (users 목록에서 id 컬럼)
--
-- ─── STEP 2. 아래 SQL 을 SQL Editor 에서 실행 ───────────────────
--
--   profiles 테이블에 해당 UUID 로 레코드를 upsert 하여 role 을
--   director / team_leader 로 설정한다.
--   (트리거가 자동 생성했다면 UPDATE, 아니면 INSERT 동작)
-- =============================================================

BEGIN;

-- 본부장 테스트 계정
INSERT INTO profiles (id, email, name, role, is_active, must_change_password)
SELECT
  u.id,
  u.email,
  '테스트 본부장',
  'director'::user_role,
  true,
  false
FROM auth.users u
WHERE u.email = 'director@anyonecompany.kr'
ON CONFLICT (id) DO UPDATE SET
  name       = EXCLUDED.name,
  role       = EXCLUDED.role,
  is_active  = EXCLUDED.is_active,
  must_change_password = EXCLUDED.must_change_password,
  updated_at = now();

-- 팀장 테스트 계정
INSERT INTO profiles (id, email, name, role, is_active, must_change_password)
SELECT
  u.id,
  u.email,
  '테스트 팀장',
  'team_leader'::user_role,
  true,
  false
FROM auth.users u
WHERE u.email = 'team_leader@anyonecompany.kr'
ON CONFLICT (id) DO UPDATE SET
  name       = EXCLUDED.name,
  role       = EXCLUDED.role,
  is_active  = EXCLUDED.is_active,
  must_change_password = EXCLUDED.must_change_password,
  updated_at = now();

-- 결과 확인
SELECT email, role, is_active, created_at
FROM profiles
WHERE email IN ('director@anyonecompany.kr', 'team_leader@anyonecompany.kr')
ORDER BY role;

COMMIT;

-- =============================================================
-- 정리 SQL (테스트 후 삭제하려면 — Dashboard 에서 auth.users 삭제하면
-- profiles 도 CASCADE 로 함께 삭제됨)
-- =============================================================
