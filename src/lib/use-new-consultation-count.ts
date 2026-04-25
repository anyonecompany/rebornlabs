"use client";

import { useCallback, useEffect, useState } from "react";

import { createBrowserClient } from "@/src/lib/supabase/browser";

/**
 * 신규 상담 알림 카운트 훅.
 *
 * 동작:
 *   - 마운트 시: localStorage(notification:lastCheckedAt) 이후 등록된 status='new'
 *     상담 수 fetch → 초기 카운트
 *   - 이후: Supabase Realtime 으로 consultations INSERT 구독 → 새 row 들어오면 +1
 *   - markAsRead(): 현재 시각을 localStorage 에 저장하고 카운트 0
 *
 * 권한:
 *   - RLS 정책에 의해 자동 필터. admin/staff 면 모든 상담, dealer 면 본인 배정만.
 *   - 본 훅은 admin/staff 어드민 헤더 전용으로 호출됨 (다른 역할은 자체 페이지에서 확인).
 */
const STORAGE_KEY = "notification:lastCheckedAt";

function getLastCheckedAt(): string {
  if (typeof window === "undefined") return new Date(0).toISOString();
  return (
    window.localStorage.getItem(STORAGE_KEY) ?? new Date(0).toISOString()
  );
}

function setLastCheckedAt(iso: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, iso);
}

export function useNewConsultationCount(): {
  count: number;
  markAsRead: () => void;
} {
  const [count, setCount] = useState(0);

  const fetchInitial = useCallback(async () => {
    const supabase = createBrowserClient();
    const since = getLastCheckedAt();
    const { count: rowCount } = await supabase
      .from("consultations")
      .select("id", { count: "exact", head: true })
      .eq("status", "new")
      .gt("created_at", since);
    setCount(rowCount ?? 0);
  }, []);

  useEffect(() => {
    fetchInitial();
  }, [fetchInitial]);

  // Realtime 구독: 새 상담 INSERT → 카운트 즉시 증가
  useEffect(() => {
    const supabase = createBrowserClient();
    const channel = supabase
      .channel("consultations:notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "consultations",
        },
        (payload) => {
          // RLS 가 service_role 아니라 anon+JWT 라 user 가 볼 수 있는 row 만 도착.
          // 새로 들어온 row 가 status='new' 이면서 lastCheckedAt 이후면 카운트.
          const row = payload.new as { status?: string; created_at?: string };
          if (
            row.status === "new" &&
            row.created_at &&
            row.created_at > getLastCheckedAt()
          ) {
            setCount((c) => c + 1);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const markAsRead = useCallback(() => {
    setLastCheckedAt(new Date().toISOString());
    setCount(0);
  }, []);

  return { count, markAsRead };
}
