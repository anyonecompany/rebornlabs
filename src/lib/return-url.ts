/**
 * 목록 페이지의 검색/필터/페이지 상태와 스크롤 위치를 sessionStorage에 저장했다가
 * 상세에서 삭제·취소 등으로 돌아올 때 그대로 복원한다.
 *
 * 사용 패턴:
 *   // 목록 페이지의 onRowClick
 *   rememberReturnUrl("vehicles");
 *   router.push(`/vehicles/${id}`);
 *
 *   // 상세 페이지의 삭제/취소 핸들러
 *   router.push(getReturnUrl("vehicles", "/vehicles"));
 *
 *   // 목록 페이지 mount 후 스크롤 복원
 *   useEffect(() => { window.scrollTo(0, getReturnScrollY("vehicles")); }, []);
 *
 *   // 데이터 사용 후 정리 (선택)
 *   clearReturnUrl("vehicles");
 */

export function rememberReturnUrl(key: string): void {
  if (typeof window === "undefined") return;
  try {
    const payload = JSON.stringify({
      search: window.location.search,
      scrollY: window.scrollY,
    });
    sessionStorage.setItem(`return:${key}`, payload);
  } catch {
    // private 모드 등 storage 불가 환경 — 조용히 무시
  }
}

export function getReturnUrl(key: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = sessionStorage.getItem(`return:${key}`);
    if (!raw) return fallback;
    // JSON 시도, 실패하면 기존 string으로 폴백 (구버전 데이터 호환)
    let search = raw;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.search === "string") search = parsed.search;
    } catch {
      // raw 자체가 search string (구버전 데이터) — 그대로 사용
    }
    return search ? `${fallback}${search}` : fallback;
  } catch {
    return fallback;
  }
}

/**
 * sessionStorage에 저장된 스크롤 위치를 반환. 없으면 0.
 * 목록 페이지 mount 후 useEffect에서 window.scrollTo(0, getReturnScrollY(key))로 사용.
 */
export function getReturnScrollY(key: string): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = sessionStorage.getItem(`return:${key}`);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    return typeof parsed?.scrollY === "number" ? parsed.scrollY : 0;
  } catch {
    return 0;
  }
}

export function clearReturnUrl(key: string): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(`return:${key}`);
  } catch {
    // 조용히 무시
  }
}
