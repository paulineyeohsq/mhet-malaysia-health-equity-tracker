import { useEffect, useState } from "react";

const cache = new Map<string, unknown>();

/**
 * Fetch a static JSON file from /data/<name> (served from public/data at
 * build time — see scripts/transform_data.py for how these are produced).
 * Simple in-memory cache so navigating between pages doesn't re-fetch.
 */
export function useData<T = unknown>(name: string): { data: T | null; loading: boolean; error: string | null } {
  const [data, setData] = useState<T | null>((cache.get(name) as T) ?? null);
  const [loading, setLoading] = useState(!cache.has(name));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cache.has(name)) {
      setData(cache.get(name) as T);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`${import.meta.env.BASE_URL}data/${name}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load ${name}: HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        if (cancelled) return;
        cache.set(name, json);
        setData(json);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [name]);

  return { data, loading, error };
}

export function useMultiData(names: string[]) {
  const results = names.map((n) => useData(n));
  return {
    data: results.map((r) => r.data),
    loading: results.some((r) => r.loading),
    error: results.map((r) => r.error).find(Boolean) ?? null,
  };
}
