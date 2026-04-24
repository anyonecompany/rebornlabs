/**
 * 어드민 toast 메시지 표준 사전.
 *
 * 톤 규칙 (한국어):
 * - 성공: 동작 + "되었습니다" (능동형, 예: "등록되었습니다")
 * - 에러: "할 수 없습니다" 회피 → "실패했습니다" / "오류가 발생했습니다"
 * - 명사+동사 자연스러운 조합 ("판매가 등록되었습니다" / "등록되었습니다")
 *
 * 사용:
 *   import { TOAST } from "@/src/constants/messages";
 *   toast.success(TOAST.success.created);
 *   toast.error(TOAST.error.fetch);
 *
 * 도메인 특정 메시지("출고 확인 완료. 수당이 배분되었습니다." 등)는 사전화하지
 * 않고 호출지에서 직접 작성하되 동일 톤 규칙 따른다.
 */

export const TOAST = {
  success: {
    created: "등록되었습니다",
    saved: "저장되었습니다",
    updated: "수정되었습니다",
    deleted: "삭제되었습니다",
    cancelled: "취소되었습니다",
    confirmed: "확인되었습니다",
    copied: "복사되었습니다",
    sent: "발송되었습니다",
    uploaded: "업로드되었습니다",
  },
  error: {
    /** 일반 폴백 — 원인 불명 또는 사용자에게 노출할 필요 없는 경우 */
    generic: "오류가 발생했습니다",
    /** GET 실패 */
    fetch: "데이터를 불러오지 못했습니다",
    /** POST/PATCH 실패 */
    save: "저장에 실패했습니다",
    /** DELETE 실패 */
    delete: "삭제에 실패했습니다",
    /** 네트워크 단절·타임아웃 */
    network: "네트워크 오류가 발생했습니다",
    /** 401/403 */
    permission: "권한이 없습니다",
    /** 클립보드/브라우저 API 실패 */
    clipboard: "클립보드 복사에 실패했습니다",
    /** 입력 검증 실패 시의 폴백 (구체 메시지가 더 좋음) */
    validation: "입력값을 확인해주세요",
  },
} as const;

export type ToastSuccessKey = keyof typeof TOAST.success;
export type ToastErrorKey = keyof typeof TOAST.error;
