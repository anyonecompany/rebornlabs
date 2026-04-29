import type { ReactNode } from "react";

interface PageHeaderProps {
  /** 페이지 제목 */
  title: string;
  /** 부제목 설명 */
  description?: string;
  /** 우측 액션 슬롯 (버튼 등) */
  children?: ReactNode;
}

/**
 * 페이지 상단 헤더 컴포넌트.
 * 제목, 설명, 우측 액션 슬롯을 제공합니다.
 */
export function PageHeader({ title, description, children }: PageHeaderProps) {
  // 우측 데스크톱 영역에 NotificationBell(absolute right-6 top-5, 약 40x40)이 떠 있어
  // 페이지별 액션 버튼과 시각적으로 겹친다. md 이상에서 우측 패딩으로 안전 영역 확보.
  return (
    <div className="flex items-start justify-between mb-7 gap-3 flex-wrap md:flex-nowrap md:pr-16">
      <div className="space-y-1 min-w-0">
        <h1 className="text-xl font-semibold tracking-tight truncate">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
        )}
      </div>
      {children && (
        <div className="flex items-center gap-2 shrink-0 pt-0.5 flex-wrap justify-end">{children}</div>
      )}
    </div>
  );
}
