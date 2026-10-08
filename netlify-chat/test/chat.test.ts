// Behaviour tests for netlify-chat/netlify/edge-functions/chat.ts (rate limits, daily cap, CORS, input checks).
// Runs under Deno with in-memory stand-ins for Netlify Blobs, the Netlify global and the outbound fetches
// (Gemini + GitHub Pages data), so no network, API key or Netlify account is needed:
//
//   cd netlify-chat && deno run -A --no-check --import-map=test/import_map.json test/chat.test.ts
//
// It does not exercise Netlify's own runtime; the deploy preview is still the final check.

const env: Record<string, string> = { GEMINI_API_KEY: "test-key" };
// deno-lint-ignore no-explicit-any
(globalThis as any).Netlify = { env: { get: (k: string) => env[k] } };

let geminiCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.includes("generativelanguage.googleapis.com")) {
    geminiCalls++;
    return Promise.resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "stub reply" }] } }] }), { status: 200 }));
  }
  if (url.includes("github.io")) return Promise.resolve(new Response("[]", { status: 200 }));
  return realFetch(input, init);
}) as typeof fetch;

const { default: handler } = await import(new URL("../netlify/edge-functions/chat.ts", import.meta.url).href);

const ORIGIN = "http://localhost:5173";
function post(body: unknown, ip: string | undefined, headers: Record<string, string> = {}) {
  const req = new Request("https://example.test/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return handler(req, { ip });
}
const ok = { messages: [{ role: "user", content: "hi" }], context: "none" };

let failed = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  if (!cond) failed++;
}

// 1. normal request
{
  const r = await post(ok, "1.1.1.1");
  const j = await r.json();
  check("valid request returns the reply", r.status === 200 && j.reply === "stub reply", JSON.stringify(j));
  check("CORS header echoes the allowed origin", r.headers.get("Access-Control-Allow-Origin") === ORIGIN);
}

// 2. per-IP limit: 10/min
{
  let last = 0;
  for (let i = 0; i < 10; i++) last = (await post(ok, "2.2.2.2")).status;
  check("10 requests/min from one IP are allowed", last === 200);
  const r = await post(ok, "2.2.2.2");
  check("the 11th is rejected with 429", r.status === 429, (await r.json()).error);
  const other = await post(ok, "3.3.3.3");
  check("a different IP is unaffected", other.status === 200);
}

// 3. unknown IP: fingerprint bucket, 3/min, separate per fingerprint
{
  const ua = { "user-agent": "UA-A", "accept-language": "en" };
  const s = [];
  for (let i = 0; i < 4; i++) s.push((await post(ok, undefined, ua)).status);
  check("unknown IP: 3 allowed then the 4th is rejected", s.join() === "200,200,200,429", s.join());
  const r = await post(ok, undefined, { "user-agent": "UA-B", "accept-language": "ms" });
  check("unknown IP: a different fingerprint has its own bucket (no shared 'unknown' bucket)", r.status === 200);
  const known = await post(ok, "4.4.4.4");
  check("unknown-IP traffic does not eat a known IP's allowance", known.status === 200);
}

// 4. daily cap, counted only for valid requests that reach Gemini
{
  env.DAILY_REQUEST_CAP = "3";
  // today's counter already holds the successful calls made above; read how many valid calls happened so far
  const before = geminiCalls;
  const outcomes: number[] = [];
  const bodies: string[] = [];
  for (let i = 0; i < 4; i++) {
    const r = await post(ok, `9.9.9.${i}`);
    outcomes.push(r.status);
    bodies.push(JSON.stringify(await r.json()));
  }
  // counter was already >= 3 (before=... valid calls), so every one of these must be capped
  check(`cap=3 already exceeded by ${before} earlier valid calls -> 429 with code daily_cap`, outcomes.every((s) => s === 429) && bodies[0].includes("daily_cap"), bodies[0]);
  check("capped requests never reach Gemini", geminiCalls === before);
  const msg = JSON.parse(bodies[0]).error as string;
  check("cap message is plain language and says when it resets", /daily limit/.test(msg) && /8:00 am Malaysia time/.test(msg));
}

// 5. invalid requests do not consume the cap
{
  env.DAILY_REQUEST_CAP = "1000000";
  const before = geminiCalls;
  const bad1 = await post("{not json", "7.7.7.7");
  const bad2 = await post({ messages: "nope" }, "7.7.7.8");
  const bad3 = await post({ messages: [] }, "7.7.7.9");
  check("malformed requests are rejected with 400", [bad1, bad2, bad3].every((r) => r.status === 400));
  check("malformed requests make no Gemini call", geminiCalls === before);
}

// 6. cap env var handling
{
  env.DAILY_REQUEST_CAP = "not-a-number";
  const r = await post(ok, "8.8.8.8");
  check("an invalid DAILY_REQUEST_CAP falls back to the default (1000), not to zero", r.status === 200);
  delete env.DAILY_REQUEST_CAP;
  const r2 = await post(ok, "8.8.8.9");
  check("an unset DAILY_REQUEST_CAP uses the default", r2.status === 200);
}

// 7. other basics
{
  const opt = await handler(new Request("https://example.test/chat", { method: "OPTIONS", headers: { Origin: ORIGIN } }), { ip: "5.5.5.5" });
  check("OPTIONS preflight returns 204", opt.status === 204);
  const evil = await post(ok, "6.6.6.6", { Origin: "https://evil.example" });
  check("a disallowed origin gets no CORS allow header", evil.headers.get("Access-Control-Allow-Origin") === "");
}

console.log(failed === 0 ? "\nALL PASSED" : `\n${failed} FAILED`);
Deno.exit(failed === 0 ? 0 : 1);
