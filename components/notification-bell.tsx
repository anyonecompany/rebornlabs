"use client";

import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";

import { useNewConsultationCount } from "@/src/lib/use-new-consultation-count";

interface Props {
  /** 표시할 권한 — admin/staff 만 표시. 그 외 역할은 null 반환 */
  role: string;
}

/**
 * 어드민 우측 상단 종 알림.
 * - 신규 상담 카운트가 1 이상이면 빨간 배지 + 펄스 애니메이션
 * - 클릭 시 /consultations 이동 + 읽음 처리(카운트 0)
 * - admin / staff 만 노출 — 다른 역할은 본인 자체 상담 페이지 사용
 */
export function NotificationBell({ role }: Props) {
  const router = useRouter();
  const { count, markAsRead } = useNewConsultationCount();

  if (role !== "admin" && role !== "staff") return null;

  const has = count > 0;

  const handleClick = () => {
    markAsRead();
    router.push("/consultations?status=new");
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={
        has ? `신규 상담 ${count}건 있음` : "신규 상담 알림 (없음)"
      }
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background hover:bg-muted transition-colors"
    >
      <Bell
        className={[
          "h-4 w-4",
          has
            ? "text-foreground animate-[wiggle_1s_ease-in-out_infinite]"
            : "text-muted-foreground",
        ].join(" ")}
      />
      {has && (
        <>
          {/* 빨간 카운트 배지 */}
          <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {count > 99 ? "99+" : count}
          </span>
          {/* 펄스 링 */}
          <span className="absolute -right-1 -top-1 inline-flex h-4 w-4 animate-ping rounded-full bg-red-500 opacity-75" />
        </>
      )}

      {/* 종 wiggle 키프레임 — 인라인 정의로 글로벌 css 의존 0 */}
      <style jsx>{`
        @keyframes wiggle {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-8deg); }
          75% { transform: rotate(8deg); }
        }
      `}</style>
    </button>
  );
}
