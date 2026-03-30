"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "./api-client";

interface CacheEntry {
  data: unknown;
  ts: number;
}

const cache = new Map<string, CacheEntry>();
const STALE_TIME = 30_000; // 30초 — 이 시간 이내면 캐시 반환 + 백그라운드 갱신

/**
 * stale-while-revalidate 패턴의 fetch 훅.
 * 캐시가 있으면 즉시 반환하고 백그라운드에서 갱신합니다.
 */
export function useCachedFetch<T>(url: string | null) {
  const [data, setData] = useState<T | null>(() => {
    if (!url) return null;
    const entry = cache.get(url);
    return entry ? (entry.data as T) : null;
  });
  const [loading, setLoading] = useState(!data);
  const mountedRef = useRef(true);

  const fetchData = useCallback(async (isBackground: boolean) => {
    if (!url) return;
    if (!isBackground) setLoading(true);

    try {
      const res = await apiFetch(url);
      if (!res.ok) return;
      const json = await res.json();
      const result = json.data ?? json.users ?? json;

      cache.set(url, { data: result, ts: Date.now() });
      if (mountedRef.current) {
        setData(result as T);
      }
    } finally {
      if (mountedRef.current && !isBackground) {
        setLoading(false);
      }
    }
  }, [url]);

  useEffect(() => {
    mountedRef.current = true;
    if (!url) return;

    const entry = cache.get(url);
    if (entry) {
      setData(entry.data as T);
      setLoading(false);
      // stale → 백그라운드 갱신
      if (Date.now() - entry.ts > STALE_TIME) {
        fetchData(true);
      }
    } else {
      fetchData(false);
    }

    return () => { mountedRef.current = false; };
  }, [url, fetchData]);

  const refresh = useCallback(() => {
    if (url) cache.delete(url);
    return fetchData(false);
  }, [url, fetchData]);

  return { data, loading, refresh };
}
