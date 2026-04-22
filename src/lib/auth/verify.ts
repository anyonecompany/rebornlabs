import { createServiceClient } from "@/lib/supabase/server";

/**
 * 시스템에서 사용하는 역할 타입 (서버/API 레이어).
 *
 * types/database.ts 의 UserRole 과 동일한 실제 역할 + 서버 전용 "none" 추가.
 * director/team_leader 는 20260420_org_structure.sql 에서 ENUM 에 추가됨.
 */
export type UserRole =
  | "admin"
  | "director"
  | "team_leader"
  | "staff"
  | "dealer"
  | "pending"
  | "none";

/** 인증 검증 결과 */
export interface VerifiedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
}

/** 인증 실패 에러 코드 */
export type AuthErrorCode =
  | "NO_TOKEN"
  | "INVALID_TOKEN"
  | "NO_PROFILE"
  | "INACTIVE"
  | "PENDING_APPROVAL"
  | "MUST_CHANGE_PASSWORD";

export class AuthError extends Error {
  constructor(
    public code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * 인증 토큰을 검증하고 사용자 프로필을 반환한다.
 *
 * 검증 순서:
 *   1. JWT 토큰 유효성 (Supabase Auth)
 *   2. profiles 레코드 존재
 *   3. is_active = true
 *   4. role != 'pending' (승인 대기가 아닌지)
 *
 * must_change_password는 에러를 던지지 않고 결과에 포함한다.
 * 호출자가 비밀번호 변경 페이지로 리다이렉트할지 결정한다.
 *
 * @param accessToken - Supabase Auth access token (Bearer 토큰)
 * @throws {AuthError} 검증 실패 시
 */
export async function verifyUser(accessToken: string): Promise<VerifiedUser> {
  if (!accessToken) {
    throw new AuthError("NO_TOKEN", "인증 토큰이 없습니다.");
  }

  const supabase = createServiceClient();

  // 1. 토큰 검증 → auth.users 조회
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(accessToken);

  if (authError || !user) {
    throw new AuthError(
      "INVALID_TOKEN",
      "유효하지 않은 인증 토큰입니다.",
    );
  }

  // 2. profiles 조회
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, name, role, is_active, must_change_password")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    throw new AuthError(
      "NO_PROFILE",
      "사용자 프로필이 존재하지 않습니다. 관리자에게 문의하세요.",
    );
  }

  // 3. 활성 상태 확인
  if (!profile.is_active) {
    throw new AuthError(
      "INACTIVE",
      "비활성화된 계정입니다. 관리자에게 문의하세요.",
    );
  }

  // 4. 승인 대기 확인
  if (profile.role === "pending") {
    throw new AuthError(
      "PENDING_APPROVAL",
      "계정 승인 대기 중입니다. 관리자의 승인을 기다려주세요.",
    );
  }

  return {
    id: profile.id,
    email: profile.email,
    name: profile.name,
    role: profile.role as UserRole,
    isActive: profile.is_active,
    mustChangePassword: profile.must_change_password,
  };
}

/**
 * 사용자가 특정 역할을 가지고 있는지 확인한다.
 *
 * @param user - verifyUser() 결과
 * @param allowedRoles - 허용 역할 목록
 */
export function hasRole(
  user: VerifiedUser,
  allowedRoles: UserRole[],
): boolean {
  return allowedRoles.includes(user.role);
}

/**
 * 역할 확인 + 권한 없으면 에러.
 * Route Handler / Server Action에서 사용.
 */
export function requireRole(
  user: VerifiedUser,
  allowedRoles: UserRole[],
): void {
  if (!hasRole(user, allowedRoles)) {
    throw new AuthError(
      "INACTIVE",
      `이 작업에는 ${allowedRoles.join(" 또는 ")} 역할이 필요합니다.`,
    );
  }
}
