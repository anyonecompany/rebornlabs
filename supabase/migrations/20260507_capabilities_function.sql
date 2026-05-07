-- ─────────────────────────────────────────────────────────────────
-- has_capability() — RBAC 단일 진실 원천(SSOT) SQL 미러
-- ─────────────────────────────────────────────────────────────────
--
-- TS lib/auth/capabilities.ts의 CAPABILITIES Record와 1:1 동기화.
-- RLS 정책에서 capability 단위 검사를 위해 STABLE / SECURITY DEFINER 함수로 정의.
--
-- 동기화 정책:
--   - 본 함수와 capabilities.ts CAPABILITIES는 같은 PR에서 함께 갱신.
--   - capabilities.test.ts에 통합 테스트(로컬 Supabase 인스턴스에서 실행)로 정합 검증.
--
-- 성능 가이드라인 (Supabase RLS Performance 베스트 프랙티스):
--   - STABLE: 같은 트랜잭션 내 동일 입력에 동일 결과 → 옵티마이저 캐싱 가능.
--   - SECURITY DEFINER: 호출자 권한 무관하게 함수 내부 로직 실행 (RLS bypass 효과).
--   - SET search_path = public: 검색 경로 명시로 search path 공격 방어 (20260429 핫픽스 패턴).
--   - 호출 시 `(select has_capability(...))` 형태로 감싸면 옵티마이저가 1회만 평가.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION has_capability(
  p_role user_role,
  p_capability text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    -- admin: 전체 capability 통과
    WHEN p_role = 'admin' THEN true

    -- staff: 본사 관리(users/audit-logs/team-structure) + vehicle-models 관리만 제외
    WHEN p_role = 'staff' THEN p_capability NOT IN (
      'users:read',
      'users:write',
      'audit-logs:read',
      'team-structure:manage',
      'menu:users',
      'menu:team-structure',
      'menu:audit-logs'
    )

    -- director / team_leader: 산하(:subordinate) 스코프 + 운영 메뉴.
    WHEN p_role IN ('director', 'team_leader') THEN p_capability IN (
      'consultations:read:subordinate',
      'consultations:write:status',
      'consultations:write:assign',
      'sales:read:subordinate',
      'sales:write:cancel',
      'vehicles:read:all',
      'contracts:read:subordinate',
      'quotes:read:subordinate',
      'commissions:read:subordinate',
      'expenses:read',
      'expenses:write',
      'documents:read',
      'documents:write',
      'marketing-companies:read',
      'menu:dashboard',
      'menu:vehicles',
      'menu:cars-public',
      'menu:consultations',
      'menu:sales',
      'menu:quotes',
      'menu:settlements',
      'menu:expenses',
      'menu:documents'
    )

    -- dealer: 본인(:self) 스코프만.
    WHEN p_role = 'dealer' THEN p_capability IN (
      'consultations:read:self',
      'consultations:write:status',
      'sales:read:self',
      'vehicles:read:dealer-view',
      'contracts:read:self',
      'quotes:read:self',
      'quotes:write',
      'commissions:read:self',
      'menu:dashboard',
      'menu:vehicles',
      'menu:cars-public',
      'menu:consultations',
      'menu:sales',
      'menu:quotes'
    )

    -- pending: 모든 capability 거부 (인증 후 승인 대기)
    ELSE false
  END;
$$;

-- 사용자 역할 조회 헬퍼 — auth.jwt() 클레임에서 user_role 추출.
-- RLS 정책에서 (select current_user_role()) 형태로 사용하면 옵티마이저가 캐싱.
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;

-- 권한 부여
GRANT EXECUTE ON FUNCTION has_capability(user_role, text) TO authenticated;
GRANT EXECUTE ON FUNCTION current_user_role() TO authenticated;

COMMENT ON FUNCTION has_capability(user_role, text) IS
  'RBAC SSOT: TS lib/auth/capabilities.ts의 CAPABILITIES와 동기화. RLS 정책에서 (select has_capability(...)) 형태로 사용.';

COMMENT ON FUNCTION current_user_role() IS
  '현재 인증 사용자의 user_role 조회. RLS 정책에서 (select current_user_role()) 패턴으로 사용 시 옵티마이저 캐싱 가능.';
