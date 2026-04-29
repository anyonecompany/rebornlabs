"use client";

import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { toast } from "sonner";

import { useNewConsultationCount } from "@/src/lib/use-new-consultation-count";

interface Props {
  /** 표시할 권한 — admin/staff 만 표시. 그 외 역할은 null 반환 */
  role: string;
}

/**
 * 어드민 우측 상단 종 알림.
 * - 신규 상담 카운트가 1 이상이면 빨간 배지 (정적)
 * - 종 클릭 → 토스트만 표시. 토스트의 "보기" 액션 클릭 시 /consultations 이동
 * - 카운트 0 이면 클릭해도 토스트·이동 없음
 * - admin / staff 만 노출 — 다른 역할은 본인 자체 상담 페이지 사용
 */
export function NotificationBell({ role }: Props) {
  const router = useRouter();
  const { count, markAsRead } = useNewConsultationCount();

  if (role !== "admin" && role !== "staff") return null;

  const has = count > 0;

  const handleClick = () => {
    if (!has) {
      // 신규 0 → 안내 토스트만, 페이지 이동 없음
      toast("신규 상담 알림이 없습니다.");
      return;
    }
    const captured = count;
    toast.success(`신규 상담 ${captured}건이 등록되었습니다.`, {
      description: "보기를 누르면 신규 상담 목록으로 이동합니다.",
      duration: 8000,
      action: {
        label: "보기",
        onClick: () => router.push("/consultations?status=new"),
      },
    });
    markAsRead();
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
          has ? "text-foreground" : "text-muted-foreground",
        ].join(" ")}
      />
      {has && (
        <span
          aria-hidden="true"
          className="absolute -right-1 -top-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}
