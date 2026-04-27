/**
 * 차량 가격 표시 유틸.
 *
 * 2026-04-26부터: 월 납입료는 vehicle_models.monthly_payment에 저장된 값을
 * 그대로 표시한다. 공식 계산(예전 car_price × 1.35 / 60) 폐기.
 */

/**
 * 원화 포맷: 29,700,000원
 * null/undefined → "—"
 */
export function formatKRW(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return `${amount.toLocaleString("ko-KR")}원`;
}
