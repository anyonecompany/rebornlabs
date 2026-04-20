type Status = "active" | "expired";

/**
 * 견적서 상태 뱃지.
 * - active(유효기간 내 or 무제한): 골드 톤
 * - expired: 회색 톤
 */
export function QuoteStatusBadge({ status }: { status: Status }) {
  if (status === "expired") {
    return (
      <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        만료
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
      활성
    </span>
  );
}
