"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback } from "react";

/**
 * URL searchParams에 동기화되는 useState 대체 훅.
 *
 * 사용 예:
 *   const [search, setSearch] = useUrlState("q", "");
 *   const [page, setPage] = useUrlState("page", 1);
 *   const [active, setActive] = useUrlState("active", false);
 *
 * - 기본값과 같으면 URL에서 키 자체를 제거 (URL 깔끔)
 * - setter는 router.replace + scroll: false (히스토리 오염 방지, 위로 스크롤 안 됨)
 * - 페이지 새로고침·뒤로가기·URL 공유 모두 상태 유지
 */
export function useUrlState<T extends string | number | boolean>(
  key: string,
  defaultValue: T,
): [T, (next: T) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const raw = params.get(key);
  const value: T =
    raw === null
      ? defaultValue
      : typeof defaultValue === "number"
        ? (Number(raw) as T)
        : typeof defaultValue === "boolean"
          ? ((raw === "true") as T)
          : (raw as T);

  const setValue = useCallback(
    (next: T) => {
      const sp = new URLSearchParams(params.toString());
      const isDefault = next === defaultValue;
      const isEmpty = next === "" || next === null || next === undefined;
      if (isDefault || isEmpty) {
        sp.delete(key);
      } else {
        sp.set(key, String(next));
      }
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [key, defaultValue, params, pathname, router],
  );

  return [value, setValue];
}
