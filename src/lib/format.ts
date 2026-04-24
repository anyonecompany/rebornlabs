/**
 * 표시용 포맷 유틸 (단일 진실 원천).
 *
 * 페이지마다 인라인으로 흩어져 있던 formatKRW/Date/RelativeTime/Phone/Mileage 를
 * 한 곳으로 모아 drift 를 제거한다. 동작은 가장 보수적인 인라인 구현을 베이스로
 * 한다 — null/undefined 안전, 잘못된 입력 시 "—" 폴백.
 */

// ─── 통화 ──────────────────────────────────────────────

/**
 * 숫자를 "1,234,567원" 형태로 포맷.
 * @param value null/undefined 면 fallback (기본 "0원")
 */
export function formatKRW(
  value: number | null | undefined,
  opts?: { fallback?: string },
): string {
  if (value == null || Number.isNaN(value)) {
    return opts?.fallback ?? "0원";
  }
  return value.toLocaleString("ko-KR") + "원";
}

// ─── 날짜·시간 ─────────────────────────────────────────

export type DateFormat =
  | "short"
  | "long"
  | "datetime"
  | "datetime-seconds"
  | "compact";

/**
 * ISO 문자열을 형식별로 포맷.
 *
 * - short            "2026.04.24"           목록·테이블
 * - compact          "26.04.24"             좁은 영역
 * - long             "2026년 4월 24일"      상세·헤더
 * - datetime         "2026-04-24 17:05"     로그·메타
 * - datetime-seconds "2026-04-24 17:05:32"  감사 로그 (정확 시각)
 *
 * null/undefined/Invalid Date 면 "—" 반환.
 */
export function formatDate(
  iso: string | null | undefined,
  format: DateFormat = "short",
): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";

  if (format === "long") {
    return d.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  if (format === "datetime" || format === "datetime-seconds") {
    const yyyy = d.getFullYear();
    const MM = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const HH = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    if (format === "datetime-seconds") {
      const ss = String(d.getSeconds()).padStart(2, "0");
      return `${yyyy}-${MM}-${dd} ${HH}:${mm}:${ss}`;
    }
    return `${yyyy}-${MM}-${dd} ${HH}:${mm}`;
  }

  if (format === "compact") {
    const yy = String(d.getFullYear()).slice(2);
    const MM = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yy}.${MM}.${dd}`;
  }

  // short — "2026.04.24"
  const yyyy = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}.${MM}.${dd}`;
}

/**
 * "5분 전" / "3시간 전" / "2일 전" / 이상은 절대 날짜로 폴백.
 * 미래 시각이면 "방금 전" 처리(음수 분).
 */
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return "—";

  const diffMs = Date.now() - target;
  const minutes = Math.floor(diffMs / 60_000);

  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;

  return formatDate(iso, "short");
}

// ─── 전화번호 ──────────────────────────────────────────

/**
 * "01012345678" → "010-1234-5678" 정규화 표시.
 * 잘못된 길이면 원본 반환, null/undefined 면 "—".
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");

  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    if (digits.startsWith("02")) {
      return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

// ─── 주행거리 ──────────────────────────────────────────

/**
 * 12345 → "12,345km".
 */
export function formatMileage(km: number | null | undefined): string {
  if (km == null || Number.isNaN(km)) return "—";
  return km.toLocaleString("ko-KR") + "km";
}
