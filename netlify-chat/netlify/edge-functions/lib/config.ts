/**
 * Addresses shared by both edge functions (chat and refresh), in one place so they cannot drift apart.
 *
 * CANONICAL_ORIGIN is the public address of the dashboard. LEGACY_ORIGIN is the original GitHub Pages site, still
 * allowed to call these functions until it is retired. Browsers send the bare origin (no path), so that is what is
 * compared.
 */
export const CANONICAL_ORIGIN = "https://my-heo.netlify.app";
export const LEGACY_ORIGIN = "https://paulineyeohsq.github.io";
export const REPO = "paulineyeohsq/mhet-malaysia-health-equity-tracker";

export const ALLOWED_ORIGINS: ReadonlySet<string> = new Set([CANONICAL_ORIGIN, LEGACY_ORIGIN, "http://localhost:5173"]);

/** The Access-Control-Allow-Origin value for a request: the origin itself when it is allowed, otherwise empty. */
export function allowedOrigin(origin: string | null): string {
  return origin && ALLOWED_ORIGINS.has(origin) ? origin : "";
}

/**
 * Where the published data files are read from (`<site>data/<file>.json`), with a trailing slash. Defaults to the
 * canonical site; the SITE_URL environment variable overrides it (for example while moving to another address).
 */
export function siteUrl(): string {
  const fromEnv = typeof Netlify !== "undefined" ? Netlify.env.get("SITE_URL") : undefined;
  const url = (fromEnv && fromEnv.trim()) || `${CANONICAL_ORIGIN}/`;
  return url.endsWith("/") ? url : `${url}/`;
}
