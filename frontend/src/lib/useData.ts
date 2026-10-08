import { useEffect, useState } from "react";

const cache = new Map<string, unknown>();

/**
 * Fetch a static JSON file from /data/<name> (served from public/data at
 * build time — see scripts/transform_data.py for how these are produced).
 * Simple in-memory cache so navigating between pages doesn't re-fetch.
 * Pass null to skip loading (data stays null) until a file is actually needed.
 */
export function useData<T = unknown>(name: string | null): { data: T | null; loading: boolean; error: string | null } {
  // Results of fetches this hook started. Everything returned is derived from this and the module cache, so no
  // state is set synchronously inside the effect.
  const [fetched, setFetched] = useState<{ name: string; data: T | null; error: string | null } | null>(null);

  useEffect(() => {
    // name === null means "don't load yet" - lets a page defer a large file until it is needed.
    if (name === null || cache.has(name)) return;
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}data/${name}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load ${name}: HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        if (cancelled) return;
        cache.set(name, json);
        setFetched({ name, data: json as T, error: null });
      })
      .catch((e) => {
        if (cancelled) return;
        setFetched({ name, data: null, error: String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [name]);

  if (name === null) return { data: null, loading: false, error: null };
  if (cache.has(name)) return { data: cache.get(name) as T, loading: false, error: null };
  const mine = fetched && fetched.name === name ? fetched : null;
  return { data: mine?.data ?? null, loading: mine === null, error: mine?.error ?? null };
}
