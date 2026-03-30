import { Skeleton } from "@/components/ui/skeleton";

interface LoadingStateProps {
  /** 로딩 스켈레톤 variant */
  variant: "card" | "table" | "form";
}

function CardLoading() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border p-6 space-y-3">
          <Skeleton className="h-3.5 w-20 bg-muted/80" />
          <Skeleton className="h-7 w-14 bg-muted/80" />
          <Skeleton className="h-3 w-28 bg-muted/60" />
        </div>
      ))}
    </div>
  );
}

function TableLoading() {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-border bg-muted/30">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-3.5 flex-1 bg-muted/80" />
        ))}
      </div>
      {/* 행 */}
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 px-4 py-3.5 border-b border-border last:border-0"
        >
          {Array.from({ length: 5 }).map((_, j) => (
            <Skeleton key={j} className="h-3.5 flex-1 bg-muted/60" />
          ))}
        </div>
      ))}
    </div>
  );
}

function FormLoading() {
  return (
    <div className="space-y-5">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3.5 w-16 bg-muted/80" />
          <Skeleton className="h-9 w-full bg-muted/60" />
        </div>
      ))}
    </div>
  );
}

/**
 * 로딩 스켈레톤 컴포넌트.
 * card / table / form 3가지 variant를 제공합니다.
 */
export function LoadingState({ variant }: LoadingStateProps) {
  if (variant === "card") return <CardLoading />;
  if (variant === "table") return <TableLoading />;
  return <FormLoading />;
}
