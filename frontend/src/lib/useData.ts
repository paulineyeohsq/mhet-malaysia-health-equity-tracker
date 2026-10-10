import { useEffect, useMemo, useState } from "react";
import type { Row } from "./equity";
import { applyKlangValleyMode, KLANG_VALLEY_FILES, useKlangValleyMode } from "./klangValley";

const cache = new Map<string, unknown>();

/**
 * Fetch a static JSON file from /data/<name> (served from public/data at
 * build time — see scripts/transform_data.py for how these are produced).
 * Simple in-memory cache so navigating between pages doesn't re-fetch.
 * Pass null to skip loading (data stays null) until a file is actually needed.
 *
 * The healthcare-access file is returned in the visitor's chosen Klang Valley mode (pooled or each territory
 * separately, see lib/klangValley.ts). Pass `{ raw: true }` for the file exactly as published, e.g. a table that
 * shows both the own-state and pooled columns side by side.
 */
export function useData<T = unknown>(
  name: string | null,
  options?: { raw?: boolean }
): { data: T | null; loading: boolean; error: string | null } {
  // Results of fetches this hook started. Everything returned is derived from this and the module cache, so no
  // state is set synchronously inside the effect.
  const [fetched, setFetched] = useState<{ name: string; data: T | null; error: string | null } | null>(null);
  const [kvMode] = useKlangValleyMode();

  useEffect(() => {
    // name === null means "don't load yet" - lets a page defer a large file until it is needed.
    if (name === null || cache.has(name)) return;
    let cancelled = false;
    // "no-cache" = always check with the server (a cheap conditional request: 304 when unchanged), so a visitor never
    // sees a data file up to ten minutes older than the one just deployed.
    fetch(`${import.meta.env.BASE_URL}data/${name}`, { cache: "no-cache" })
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

  const mine = fetched && fetched.name === name ? fetched : null;
  const base: T | null = name === null ? null : cache.has(name) ? (cache.get(name) as T) : (mine?.data ?? null);
  const raw = options?.raw === true;
  const data = useMemo(
    () => (name !== null && KLANG_VALLEY_FILES.includes(name) && !raw && Array.isArray(base) ? (applyKlangValleyMode(base as Row[], kvMode) as T) : base),
    [name, raw, base, kvMode]
  );

  if (name === null) return { data: null, loading: false, error: null };
  if (cache.has(name)) return { data, loading: false, error: null };
  return { data, loading: mine === null, error: mine?.error ?? null };
}
