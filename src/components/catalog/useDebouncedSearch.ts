"use client";

import { useEffect, useState } from "react";

/**
 * 입력어가 250ms 동안 바뀌지 않으면 search()를 호출한다.
 * 늦게 도착한 이전 결과가 최신 결과를 덮어쓰지 않도록 취소 플래그를 사용한다.
 */
export function useDebouncedSearch<T>(
  query: string,
  search: (q: string) => Promise<{ data: T[]; error?: string }>
) {
  const [results, setResults] = useState<T[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      const res = await search(q);
      if (cancelled) return;
      setResults(res.data);
      setError(res.error ?? null);
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, search]);

  const empty = !query.trim();
  return { results: empty ? [] : results, error: empty ? null : error, loading: !empty && loading };
}
