/**
 * 목록 페이지의 검색/필터/페이지 상태를 sessionStorage에 저장했다가
 * 상세에서 삭제·취소 등으로 돌아올 때 그대로 복원한다.
 *
 * 사용 패턴:
 *   // 목록 페이지의 onRowClick
 *   rememberReturnUrl("vehicles");
 *   router.push(`/vehicles/${id}`);
 *
 *   // 상세 페이지의 삭제/취소 핸들러
 *   router.push(getReturnUrl("vehicles", "/vehicles"));
 */

export function rememberReturnUrl(key: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(`return:${key}`, window.location.search);
  } catch {
    // private 모드 등 storage 불가 환경 — 조용히 무시
  }
}

export function getReturnUrl(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  try {
    const search = sessionStorage.getItem(`return:${key}`);
    return search ? `${fallback}${search}` : fallback;
  } catch {
    return fallback;
  }
}
