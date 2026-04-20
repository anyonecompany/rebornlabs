/**
 * 절대 시간(ISO)을 상대 시간 라벨로 변환한다.
 *
 * - 1분 이내: "방금 전"
 * - 1시간 이내: "N분 전"
 * - 24시간 이내: "N시간 전"
 * - 7일 이내: "N일 전"
 * - 그 이상: "YYYY-MM-DD"
 */
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "-";

  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return "-";

  const diffMs = Date.now() - target;
  if (diffMs < 0) {
    return formatAbsoluteDate(iso);
  }

  const MIN = 60 * 1000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  if (diffMs < MIN) return "방금 전";
  if (diffMs < HOUR) return `${Math.floor(diffMs / MIN)}분 전`;
  if (diffMs < DAY) return `${Math.floor(diffMs / HOUR)}시간 전`;
  if (diffMs < 7 * DAY) return `${Math.floor(diffMs / DAY)}일 전`;
  return formatAbsoluteDate(iso);
}

function formatAbsoluteDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatAbsoluteDateISO(iso: string | null): string {
  if (!iso) return "무제한";
  return formatAbsoluteDate(iso);
}
