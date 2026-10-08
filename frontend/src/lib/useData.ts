import { useEffect, useState } from "react";

const cache = new Map<string, unknown>();

/**
 * Fetch a static JSON file from /data/<name> (served from public/data at
 * build time — see scripts/transform_data.py for how these are produced).
 * Simple in-memory cache so navigating between pages doesn't re-fetch.
 * Pass null to skip loading (data stays null) until a file is actually needed.
 */
export function useData<T = unknown>(name: string | null): { data: T | null; loading: boolean; error: string | null } {
  const [data, setData] = useState<T | null>(name ? ((cache.get(name) as T) ?? null) : null);
  const [loading, setLoading] = useState(name !== null && !cache.has(name));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // name === null means "don't load yet" — lets a page defer a large file until it is needed.
    if (name === null) {
      setData(null);
      setLoading(false);
      return;
    }
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

