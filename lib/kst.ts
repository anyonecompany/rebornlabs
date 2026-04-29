/**
 * KST (Asia/Seoul, UTC+9) 기반 월 경계 헬퍼.
 *
 * Supabase에는 timestamptz가 UTC로 저장되므로,
 * "이번 달"을 KST 기준으로 필터하려면 UTC 오프셋을 적용해야 한다.
 *
 * 예) 2026-04 KST 기준:
 *   시작: 2026-03-31T15:00:00.000Z  (KST 04-01 00:00)
 *   종료: 2026-04-30T15:00:00.000Z  (KST 05-01 00:00, exclusive)
 */

const KST_OFFSET_HOURS = 9;

export interface MonthBounds {
  month: string; // "YYYY-MM"
  start: string; // ISO UTC — KST 월 시작 (inclusive)
  end: string;   // ISO UTC — KST 다음 월 시작 (exclusive)
}

/**
 * YYYY-MM 문자열을 KST 기준 월 경계(UTC ISO 문자열)로 변환.
 *
 * @param monthParam - "YYYY-MM" 형식. null이면 현재 KST 달 사용.
 * @returns MonthBounds | null (형식 오류 시)
 */
export function resolveKstMonthBounds(monthParam: string | null): MonthBounds | null {
  const now = new Date();
  // 현재 KST 기준 월 기본값 계산
  const kstNow = new Date(now.getTime() + KST_OFFSET_HOURS * 60 * 60 * 1000);
  const defaultMonth = `${kstNow.getUTCFullYear()}-${String(kstNow.getUTCMonth() + 1).padStart(2, "0")}`;

  const month = monthParam ?? defaultMonth;
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;

  const year = Number(match[1]);
  const m = Number(match[2]);
  if (m < 1 || m > 12) return null;

  // KST 월 시작 = UTC (year, m-1, 1, -9, 0, 0) → 전월 말일 15:00 UTC
  const startUtc = new Date(Date.UTC(year, m - 1, 1, -KST_OFFSET_HOURS, 0, 0));
  // KST 다음 월 시작 = UTC (year, m, 1, -9, 0, 0)
  const endUtc = new Date(Date.UTC(year, m, 1, -KST_OFFSET_HOURS, 0, 0));

  return {
    month,
    start: startUtc.toISOString(),
    end: endUtc.toISOString(),
  };
}

/**
 * YYYY-MM 문자열을 KST 기준 날짜 문자열(YYYY-MM-DD) 경계로 변환.
 *
 * date 타입 컬럼(expense_date 등) 필터에 사용.
 *
 * @returns { month, startDate, endDate } | null
 */
export function resolveKstMonthDateBounds(monthParam: string | null): {
  month: string;
  startDate: string; // "YYYY-MM-01"
  endDate: string;   // 다음 달 "YYYY-MM-01" (exclusive)
} | null {
  const now = new Date();
  const kstNow = new Date(now.getTime() + KST_OFFSET_HOURS * 60 * 60 * 1000);
  const defaultMonth = `${kstNow.getUTCFullYear()}-${String(kstNow.getUTCMonth() + 1).padStart(2, "0")}`;

  const month = monthParam ?? defaultMonth;
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;

  const year = Number(match[1]);
  const m = Number(match[2]);
  if (m < 1 || m > 12) return null;

  const startDate = `${year}-${String(m).padStart(2, "0")}-01`;
  const nextYear = m === 12 ? year + 1 : year;
  const nextMonth = m === 12 ? 1 : m + 1;
  const endDate = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

  return { month, startDate, endDate };
}
