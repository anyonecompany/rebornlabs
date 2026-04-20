"use client";

import { useState, useEffect } from "react";
import type { UserRole } from "@/types/database";

interface UseUserRoleResult {
  /** 확정된 role. 아직 DOM에서 읽기 전에는 null. */
  role: UserRole | null;
  /** 확정된 userId. 아직 읽기 전에는 null. */
  userId: string | null;
  /** role 확정 여부. guard 전에 반드시 확인. */
  isReady: boolean;
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
