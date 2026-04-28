"use client";

import { useEffect, useState } from "react";

/**
 * value 변경을 ms ms 동안 모은 뒤 반영. 검색·자동완성용.
 */
export function useDebounce<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}
