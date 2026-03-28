-- =============================================================
-- 008_jwt_hook.sql — Reborn Labs Admin: JWT Custom Claims Hook
-- Supabase Auth가 JWT 발급 시 profiles.role을 custom claim에 포함.
-- profiles에 레코드 없는 사용자 → role = 'none' (모든 정책 차단).
--
-- Supabase Dashboard에서 등록 필요:
--   Authentication → Hooks → Customize Access Token (JWT) Claims
--   → PostgreSQL Function → custom_access_token_hook
-- =============================================================

BEGIN;

-- =============================================================
-- 1. custom_access_token_hook
-- Supabase Auth JWT 발급 시 호출되는 훅 함수
-- event.user_id → profiles.role 조회 → JWT claims에 삽입
-- =============================================================

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    claims  JSONB;
    v_role  TEXT;
BEGIN
    -- profiles에서 역할 조회. 없으면 'none'
    SELECT role::TEXT INTO v_role
    FROM public.profiles
    WHERE id = (event ->> 'user_id')::UUID;

    IF v_role IS NULL THEN
        v_role := 'none';
    END IF;

    -- 기존 claims 추출
    claims := event -> 'claims';

    -- user_role claim 추가
    claims := jsonb_set(claims, '{user_role}', to_jsonb(v_role));

    -- 수정된 claims 반환
    event := jsonb_set(event, '{claims}', claims);

    RETURN event;
END;
$$;

COMMENT ON FUNCTION public.custom_access_token_hook IS
  'Supabase Auth JWT 커스텀 클레임 훅. profiles.role → JWT user_role claim. 프로필 없으면 none.';

-- =============================================================
-- 2. 훅 함수 권한 설정
-- supabase_auth_admin 역할에 실행 권한 부여
-- =============================================================

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;

-- 훅 함수가 profiles 테이블을 조회할 수 있도록 권한 부여
GRANT SELECT ON public.profiles TO supabase_auth_admin;

-- =============================================================
-- 3. Supabase 회원가입 비활성화 안내
-- ※ SQL로 설정 불가 — Supabase Dashboard에서 수동 설정 필요
--
-- Authentication → Settings → Auth Providers
--   → Email: "Enable Sign Up" 비활성화
--   → 모든 Social Provider: 비활성화
--
-- 관리자가 직접 계정을 생성하는 방식만 허용.
-- =============================================================

COMMIT;
