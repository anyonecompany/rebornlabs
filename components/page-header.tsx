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
  return (
    <div className="flex items-start justify-between mb-7">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
        )}
      </div>
      {children && (
        <div className="flex items-center gap-2 shrink-0 pt-0.5">{children}</div>
      )}
    </div>
  );
}
