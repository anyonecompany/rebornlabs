import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  /** 아이콘 (기본: Inbox) */
  icon?: LucideIcon;
  /** 제목 */
  title: string;
  /** 설명 */
  description?: string;
  /** 액션 (버튼 등) */
  action?: ReactNode;
  /** 컴팩트 변형 — 카드·작은 영역용. py-8 + 작은 아이콘. */
  compact?: boolean;
}

/**
 * 데이터가 없을 때 표시하는 빈 상태 컴포넌트.
 *
 * - 기본: 페이지 메인 영역용 (py-20 + 큰 아이콘 배경)
 * - compact: 카드·테이블 안 빈 슬롯용 (py-8 + 단순 아이콘)
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  compact = false,
}: EmptyStateProps) {
  if (compact) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <Icon className="h-5 w-5 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">{title}</p>
        {description && (
          <p className="text-[11px] text-muted-foreground/80 leading-relaxed max-w-[220px]">
            {description}
          </p>
        )}
        {action && <div className="mt-1">{action}</div>}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="rounded-full bg-muted/60 border border-border p-5">
        <Icon className="h-6 w-6 text-muted-foreground/70" />
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground/80">{title}</p>
        {description && (
          <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">{description}</p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
