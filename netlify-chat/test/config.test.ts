// The addresses both edge functions share (lib/config.ts). Run: deno run -A --no-check test/config.test.ts
const env: Record<string, string> = {};
// deno-lint-ignore no-explicit-any
(globalThis as any).Netlify = { env: { get: (k: string) => env[k] } };

const { ALLOWED_ORIGINS, CANONICAL_ORIGIN, allowedOrigin, siteUrl } = await import(new URL("../netlify/edge-functions/lib/config.ts", import.meta.url).href);

let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  ${detail}`}`);
  if (!ok) failed++;
};

check("the canonical origin is the Netlify site", CANONICAL_ORIGIN === "https://my-heo.netlify.app");
check("the canonical and the original GitHub Pages origins are both allowed", ALLOWED_ORIGINS.has(CANONICAL_ORIGIN) && ALLOWED_ORIGINS.has("https://paulineyeohsq.github.io"));
check("an allowed origin is echoed back", allowedOrigin(CANONICAL_ORIGIN) === CANONICAL_ORIGIN);
check("no origin, an unknown one and a path-suffixed one get nothing", allowedOrigin(null) === "" && allowedOrigin("https://evil.example") === "" && allowedOrigin(`${CANONICAL_ORIGIN}/x`) === "");
check("the data is read from the canonical site by default", siteUrl() === "https://my-heo.netlify.app/", siteUrl());
env.SITE_URL = "https://example.org/dash";
check("SITE_URL overrides the address and gets a trailing slash", siteUrl() === "https://example.org/dash/", siteUrl());
env.SITE_URL = "   ";
check("a blank SITE_URL is ignored", siteUrl() === "https://my-heo.netlify.app/", siteUrl());

console.log(failed === 0 ? "\nALL PASSED" : `\n${failed} FAILED`);
Deno.exit(failed === 0 ? 0 : 1);
