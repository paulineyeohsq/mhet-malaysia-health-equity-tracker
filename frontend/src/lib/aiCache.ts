/**
 * Per-session cache for AI answers, keyed by *what the answer was about*.
 *
 * Every AI call spends Gemini quota (the free tier was being exhausted by
 * one call per page view), so an answer is stored in sessionStorage under a
 * composite key — route plus whichever selections shaped the prompt — and a
 * repeat of the same question in the same browser session is served from
 * the cache instead of the network. Changing any selection changes the key,
 * so a cached answer can never be shown for a different state, indicator or
 * topic than the one it was generated for.
 *
 * Key shape: ai_research_<route>_<part>_<part>…
 *   e.g. ai_research_/research-opportunities_mmr_poverty_Johor
 *
 * sessionStorage can be unavailable (private mode, blocked storage); every
 * access is wrapped so caching silently degrades to "no cache".
 */
export function aiCacheKey(route: string, ...parts: (string | number | null | undefined)[]): string {
  const clean = (s: string) => s.trim().replace(/\s+/g, "-").slice(0, 80);
  return ["ai_research", route, ...parts.filter((p) => p !== null && p !== undefined && p !== "").map((p) => clean(String(p)))].join("_");
}

export function readAiCache<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeAiCache<T>(key: string, value: T): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable or full — caching is optional */
  }
}
