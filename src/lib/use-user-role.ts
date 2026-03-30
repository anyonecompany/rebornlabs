"use client";

import { useState, useEffect } from "react";
import type { UserRole } from "@/types/database";

/**
 * 레이아웃에서 서버 사이드로 주입한 data-user-role 속성을 읽어 반환합니다.
 * RLS 우회 없이 정확한 role을 클라이언트에서 사용할 수 있습니다.
 */
export function useUserRole(): { role: UserRole; userId: string } {
  const [role, setRole] = useState<UserRole>("dealer");
  const [userId, setUserId] = useState("");

  useEffect(() => {
    const el = document.querySelector("[data-user-role]");
    if (el) {
      const r = el.getAttribute("data-user-role") as UserRole;
      const id = el.getAttribute("data-user-id") ?? "";
      if (r) setRole(r);
      if (id) setUserId(id);
    }
  }, []);

  return { role, userId };
}
