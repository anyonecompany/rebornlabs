"use client";

import { useState, useEffect } from "react";
import type { UserRole } from "@/types/database";
import { can } from "@/lib/auth/capabilities";

interface UseUserRoleResult {
  /** 확정된 role. 아직 DOM에서 읽기 전에는 null. */
  role: UserRole | null;
  /** 확정된 userId. 아직 읽기 전에는 null. */
  userId: string | null;
  /** role 확정 여부. guard 전에 반드시 확인. */
  isReady: boolean;
}

// ────────────────────────────────────────────────────────────
// Role Helper 함수 — 페이지/컴포넌트에서 반복되는 조건문 정리용
// role === null 일 때는 모두 false 반환 (isReady 체크 전에도 안전)
// ────────────────────────────────────────────────────────────

export function isAdmin(role: UserRole | null | undefined): boolean {
  return role === "admin";
}

export function isStaff(role: UserRole | null | undefined): boolean {
  return role === "staff";
}

/** 본부장(director) / 팀장(team_leader) 중간 관리직 */
export function isManagerRole(role: UserRole | null | undefined): boolean {
  return role === "director" || role === "team_leader";
}

export function isDealer(role: UserRole | null | undefined): boolean {
  return role === "dealer";
}

/**
 * 조직 데이터(상담·판매·계약·견적·차량) 접근 가능 — capabilities.ts SSOT 위임.
 * 관리자/스태프/관리직(:read:all 또는 :read:subordinate)이 통과.
 */
export function canAccessOrgData(role: UserRole | null | undefined): boolean {
  return can(role, "consultations:read:all") || can(role, "consultations:read:subordinate");
}

/** 지출결의 — capabilities SSOT (admin/staff/director/team_leader) */
export function canAccessExpenses(role: UserRole | null | undefined): boolean {
  return can(role, "expenses:read");
}

/** 사용자 관리 메뉴 — admin only (capabilities: menu:users) */
export function canAccessUsers(role: UserRole | null | undefined): boolean {
  return can(role, "menu:users");
}

/** 차량 모델 관리 — admin/staff (capabilities: vehicle-models:read) */
export function canAccessVehicleModels(
  role: UserRole | null | undefined,
): boolean {
  return can(role, "vehicle-models:read");
}

/**
 * 레이아웃에서 서버 사이드로 주입한 `data-user-role` / `data-user-id` 속성을
 * 읽어 반환합니다.
 *
 * 훅이 반환하는 role/userId는 최초 렌더에서는 null이며, useEffect 이후
 * DOM에서 값을 읽고 상태를 업데이트합니다. 권한 가드(`redirect`, `toast.error`)를
 * 수행하는 사용처는 반드시 `isReady` 가 true 가 된 뒤에 판단해야 합니다.
 *
 * 이 훅은 "use client" 전용이며 서버 컴포넌트에서는 사용할 수 없습니다.
 */
export function useUserRole(): UseUserRoleResult {
  const [state, setState] = useState<{
    role: UserRole | null;
    userId: string | null;
  }>({ role: null, userId: null });

  useEffect(() => {
    const el = document.querySelector("[data-user-role]");
    if (!el) return;
    const r = el.getAttribute("data-user-role") as UserRole | null;
    const id = el.getAttribute("data-user-id");
    if (r) {
      setState({ role: r, userId: id ?? "" });
    }
  }, []);

  return {
    role: state.role,
    userId: state.userId,
    isReady: state.role !== null,
  };
}
