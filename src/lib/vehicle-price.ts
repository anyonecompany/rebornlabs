/**
 * 차량 모델 가격 공식.
 *
 * 2026-04-20 대표님 확정:
 *   - 추가된 가격 = car_price × 1.35 (엑셀 80건 오차 0 검증)
 *   - 월 납입료 = 추가된 가격 / 60개월
 *
 * DB에는 car_price / max_deposit 만 저장하고 나머지는 공식으로 재계산.
 */

export const PRICE_FACTOR = 1.35;
export const INSTALLMENT_MONTHS = 60;

/**
 * 추가된 가격 = 차량 가격 × 1.35
 */
export function calculateExtraPrice(carPrice: number): number {
  return Math.round(carPrice * PRICE_FACTOR);
}

/**
 * 월 납입료 = 추가된 가격 / 60개월
 */
export function calculateMonthlyPayment(carPrice: number): number {
  return Math.round(calculateExtraPrice(carPrice) / INSTALLMENT_MONTHS);
}

/**
 * 원화 포맷: 29,700,000원
 * null/undefined → "—"
 */
export function formatKRW(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return `${amount.toLocaleString("ko-KR")}원`;
}
