import { createServiceClient } from "@/lib/supabase/server";
import type { UserRole as DbUserRole } from "@/types/database";
import { can, type Capability } from "./capabilities";

/**
 * 시스템에서 사용하는 역할 타입.
 *
 * **단일 진실 원천**: `types/database.ts`의 `UserRole`. 본 파일은 import만.
 * `none`은 verifyUser 내부에서 인증 실패 표현용으로만 사용 (DB 컬럼에는 존재하지 않음).
 */
export type UserRole = DbUserRole;
export type ServerUserRole = DbUserRole | "none";

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
  | "MUST_CHANGE_PASSWORD"
  | "FORBIDDEN";

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
 * AuthError 코드를 클라이언트용 마스킹 메시지로 변환한다.
 *
 * 내부 역할명·DB 구조가 포함된 err.message를 직접 반환하지 말고
 * 이 함수를 통해 사용자 친화 메시지만 노출한다.
 *
 * @param code - AuthError.code
 */
export function getAuthErrorMessage(code: AuthErrorCode): string {
  switch (code) {
    case "NO_TOKEN":
      return "로그인이 필요합니다.";
    case "INVALID_TOKEN":
      return "인증 정보가 유효하지 않습니다. 다시 로그인해 주세요.";
    case "NO_PROFILE":
      return "사용자 정보를 찾을 수 없습니다. 관리자에게 문의하세요.";
    case "INACTIVE":
      return "접근 권한이 없습니다. 관리자에게 문의하세요.";
    case "PENDING_APPROVAL":
      return "계정 승인 대기 중입니다. 관리자의 승인을 기다려주세요.";
    case "MUST_CHANGE_PASSWORD":
      return "비밀번호 변경이 필요합니다.";
    case "FORBIDDEN":
      return "이 작업을 수행할 권한이 없습니다.";
    default:
      return "인증 오류가 발생했습니다.";
  }
}

/** verifyUser 옵션 */
export interface VerifyUserOptions {
  /**
   * true로 설정하면 must_change_password=true여도 에러를 던지지 않는다.
   * 비밀번호 변경 API(profile PATCH/GET) 등 허용된 라우트에서만 사용한다.
   */
  allowMustChangePassword?: boolean;
}

/**
 * 인증 토큰을 검증하고 사용자 프로필을 반환한다.
 *
 * 검증 순서:
 *   1. JWT 토큰 유효성 (Supabase Auth)
 *   2. profiles 레코드 존재
 *   3. is_active = true
 *   4. role != 'pending' (승인 대기가 아닌지)
 *   5. must_change_password = false (allowMustChangePassword 옵션 미설정 시)
 *
 * @param accessToken - Supabase Auth access token (Bearer 토큰)
 * @param options - 선택적 옵션
 * @throws {AuthError} 검증 실패 시
 */
export async function verifyUser(
  accessToken: string,
  options?: VerifyUserOptions,
): Promise<VerifiedUser> {
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

  // 5. 비밀번호 변경 강제 확인
  if (profile.must_change_password && !options?.allowMustChangePassword) {
    throw new AuthError(
      "MUST_CHANGE_PASSWORD",
      "비밀번호 변경이 필요합니다.",
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
 *
 * @deprecated capability 기반 가드(`requireCapability`) 권장.
 * 도메인별 마이그레이션 완료 후 제거 예정.
 */
export function requireRole(
  user: VerifiedUser,
  allowedRoles: UserRole[],
): void {
  if (!hasRole(user, allowedRoles)) {
    throw new AuthError(
      "FORBIDDEN",
      "이 작업을 수행할 권한이 없습니다.",
    );
  }
}

/**
 * Capability 기반 권한 가드 (권장).
 *
 * `lib/auth/capabilities.ts`의 단일 진실 원천을 참조한다.
 * 신규 라우트는 이 함수를 사용해야 한다.
 *
 * @example
 * const user = await verifyUser(token);
 * requireCapability(user, "sales:write:cancel");
 */
export function requireCapability(
  user: VerifiedUser,
  capability: Capability,
): void {
  if (!can(user.role, capability)) {
    throw new AuthError(
      "FORBIDDEN",
      "이 작업을 수행할 권한이 없습니다.",
    );
  }
}
