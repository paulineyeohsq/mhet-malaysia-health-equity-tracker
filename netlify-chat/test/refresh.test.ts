// Behaviour tests for netlify/edge-functions/refresh.ts ("check for newer data" / "update now"), run under Deno with
// stand-ins for Netlify Blobs and every outbound request (the site's inventory, the publishers, the GitHub API):
//
//   cd netlify-chat && deno run -A --no-check --import-map=test/import_map.json test/refresh.test.ts
import { __reset } from "./stub_blobs.ts";

const env: Record<string, string> = {};
// deno-lint-ignore no-explicit-any
(globalThis as any).Netlify = { env: { get: (k: string) => env[k] } };

// ---- the world the function sees (mutated per test)
const world = {
  etag: '"e1"',
  apiLastUpdated: "2026-01-01 12:00",
  httpDown: false,
  runs: { update: null as null | { status: string; conclusion: string | null; created_at: string; html_url: string }, deploy: null as null | { status: string; conclusion: string | null; created_at: string; html_url: string } },
  dispatchStatus: 204,
  headCalls: 0,
  lastHeadEncoding: null as string | null,
  dispatches: [] as { url: string; auth: string | null; body: string }[],
};
const reset = () => {
  __reset();
  Object.assign(world, { etag: '"e1"', apiLastUpdated: "2026-01-01 12:00", httpDown: false, dispatchStatus: 204, headCalls: 0, dispatches: [] });
  world.runs = { update: null, deploy: null };
  delete env.GITHUB_DISPATCH_TOKEN;
};

const inventory = {
  datasets: [
    { id: "deaths", name: "Deaths by state" },
    { id: "staff", name: "Healthcare staff" },
    { id: "legacy", name: "Dataset with no baseline details" },
  ],
  source_status: {
    deaths: { http_url: "https://files.example/deaths.csv", etag: '"e1"', last_modified: "Tue, 07 Jul 2026 15:43:35 GMT" },
    staff: { api_id: "healthcare_staff", last_updated: "2026-01-01 12:00" },
    legacy: { data_as_of: "2022" },
  },
};

globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const method = init?.method ?? "GET";
  if (url.endsWith("data/dataset_inventory.json")) return Promise.resolve(new Response(JSON.stringify(inventory)));
  if (url === "https://files.example/deaths.csv" && method === "HEAD") {
    world.headCalls++;
    if (world.httpDown) return Promise.reject(new Error("network down"));
    world.lastHeadEncoding = new Headers(init?.headers).get("accept-encoding");
    return Promise.resolve(new Response(null, { status: 200, headers: { ETag: world.etag, "Last-Modified": "Tue, 07 Jul 2026 15:43:35 GMT" } }));
  }
  if (url.startsWith("https://api.data.gov.my/data-catalogue/")) {
    return Promise.resolve(new Response(JSON.stringify({ meta: { last_updated: world.apiLastUpdated }, data: [] })));
  }
  const runsMatch = /actions\/workflows\/(update-data|deploy-pages)\.yml\/runs/.exec(url);
  if (runsMatch) {
    const run = runsMatch[1] === "update-data" ? world.runs.update : world.runs.deploy;
    return Promise.resolve(new Response(JSON.stringify({ workflow_runs: run ? [run] : [] })));
  }
  if (url.endsWith("/actions/workflows/update-data.yml/dispatches") && method === "POST") {
    const headers = new Headers(init?.headers);
    world.dispatches.push({ url, auth: headers.get("Authorization"), body: String(init?.body) });
    return Promise.resolve(new Response(null, { status: world.dispatchStatus }));
  }
  return Promise.reject(new Error(`unexpected request ${method} ${url}`));
}) as typeof fetch;

const { default: handler } = await import(new URL("../netlify/edge-functions/refresh.ts", import.meta.url).href);
const ORIGIN = "http://localhost:5173";
const call = (method: string, ip = "1.2.3.4", origin: string | null = ORIGIN) =>
  handler(new Request("https://example.test/refresh", { method, headers: origin ? { Origin: origin } : {} }), { ip });
const body = async (r: Response) => JSON.parse(await r.text());
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

let failed = 0;
const check = (name: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
  if (!cond) failed++;
};

// 1. nothing changed
reset();
{
  const r = await call("GET");
  const j = await body(r);
  check("GET: nothing newer when the publisher files are unchanged", r.status === 200 && j.newer.length === 0, JSON.stringify(j.newer));
  check("GET: counts what it could check (the dataset with no baseline is unchecked, not newer)", j.total === 3 && j.unchecked === 1, `total=${j.total} unchecked=${j.unchecked}`);
  check("GET: canUpdate is false without a token", j.canUpdate === false);
}

// 2. detects a replaced file and a newer catalogue entry
reset();
world.etag = '"e2"';
world.apiLastUpdated = "2026-10-09 10:00";
{
  const j = await body(await call("GET"));
  const ids = j.newer.map((n: { id: string }) => n.id).sort().join();
  check("GET: reports both a replaced file (ETag) and a newer catalogue entry", ids === "deaths,staff", ids);
  check("GET: gives the dataset name and a reason", j.newer.every((n: { name: string; reason: string }) => n.name.length > 0 && n.reason.length > 0));
}

// 2b. a weak ETag (what a compressed response carries) is not proof of a change, and the check asks for the uncompressed file
reset();
world.etag = 'W/"different-because-compressed"';
{
  const j = await body(await call("GET"));
  check("GET: a weak ETag does not make a file look replaced", !j.newer.some((n: { id: string }) => n.id === "deaths"), JSON.stringify(j.newer));
  check("GET: the file check asks for the uncompressed response", world.lastHeadEncoding === "identity", String(world.lastHeadEncoding));
}

// 3. an unreachable publisher is 'unchecked', never 'newer'
reset();
world.httpDown = true;
{
  const j = await body(await call("GET"));
  check("GET: an unreachable publisher is counted as unchecked, not newer", j.newer.length === 0 && j.unchecked === 2, `unchecked=${j.unchecked}`);
}

// 4. results are shared for a few minutes
reset();
{
  await call("GET");
  const before = world.headCalls;
  await call("GET", "9.9.9.9");
  check("GET: a second visitor within the cache window does not trigger another round of publisher requests", world.headCalls === before);
}

// 5. POST rules
reset();
world.etag = '"e2"';
{
  const r = await call("POST");
  const j = await body(r);
  check("POST: with newer data but no token, nothing is dispatched and the answer says so", j.status === "not-configured" && world.dispatches.length === 0, j.status);
}
reset();
env.GITHUB_DISPATCH_TOKEN = "secret-token-value";
{
  const j = await body(await call("POST"));
  check("POST: with a token but nothing newer, it does nothing", j.status === "up-to-date" && world.dispatches.length === 0, j.status);
}
reset();
env.GITHUB_DISPATCH_TOKEN = "secret-token-value";
world.etag = '"e2"';
{
  const r = await call("POST");
  const text = await r.text();
  const j = JSON.parse(text);
  check("POST: starts the workflow once when something is newer", j.status === "started" && world.dispatches.length === 1, j.status);
  const d = world.dispatches[0];
  check("POST: dispatches update-data.yml on main with the token", d && d.auth === "Bearer secret-token-value" && JSON.parse(d.body).ref === "main");
  check("the token never appears in a response", !text.includes("secret-token-value"));
}
reset();
env.GITHUB_DISPATCH_TOKEN = "secret-token-value";
world.etag = '"e2"';
world.runs.update = { status: "in_progress", conclusion: null, created_at: hoursAgo(0.2), html_url: "https://github.com/x/runs/1" };
{
  const j = await body(await call("POST"));
  check("POST: does not start a second run while one is in progress", j.status === "already-running" && world.dispatches.length === 0, j.status);
}
reset();
env.GITHUB_DISPATCH_TOKEN = "secret-token-value";
world.etag = '"e2"';
world.runs.update = { status: "completed", conclusion: "success", created_at: hoursAgo(1), html_url: "https://github.com/x/runs/2" };
{
  const j = await body(await call("POST"));
  check("POST: respects the cooldown after a recent run", j.status === "cooldown" && world.dispatches.length === 0 && typeof j.cooldownUntil === "string", j.status);
}
reset();
env.GITHUB_DISPATCH_TOKEN = "secret-token-value";
world.etag = '"e2"';
world.runs.update = { status: "completed", conclusion: "success", created_at: hoursAgo(5), html_url: "https://github.com/x/runs/3" };
{
  const j = await body(await call("POST"));
  check("POST: a run older than the cooldown does not block a new one", j.status === "started", j.status);
}
reset();
env.GITHUB_DISPATCH_TOKEN = "secret-token-value";
world.etag = '"e2"';
world.dispatchStatus = 403;
{
  const r = await call("POST");
  const j = await body(r);
  check("POST: a GitHub refusal is reported as failed without exposing details", r.status === 502 && j.status === "failed");
}

// 6. progress information for the page
reset();
world.runs.update = { status: "completed", conclusion: "success", created_at: hoursAgo(0.1), html_url: "https://github.com/x/runs/4" };
world.runs.deploy = { status: "in_progress", conclusion: null, created_at: hoursAgo(0.05), html_url: "https://github.com/x/runs/5" };
{
  const j = await body(await call("GET"));
  check("GET: includes the latest refresh and deploy runs so the page can show progress", j.update?.status === "completed" && j.deploy?.status === "in_progress");
}

// 7. CORS, methods, rate limit
reset();
{
  const ok = await call("GET");
  check("CORS: an allowed origin is echoed", ok.headers.get("Access-Control-Allow-Origin") === ORIGIN);
  const evil = await call("GET", "5.5.5.5", "https://evil.example");
  check("CORS: another origin gets no allow header", evil.headers.get("Access-Control-Allow-Origin") === "");
  const opt = await handler(new Request("https://example.test/refresh", { method: "OPTIONS", headers: { Origin: ORIGIN } }), { ip: "5.5.5.5" });
  check("OPTIONS preflight returns 204", opt.status === 204);
  const put = await call("PUT");
  check("other methods are rejected", put.status === 404);
}
reset();
{
  let last = 0;
  for (let i = 0; i < 9; i++) last = (await call("GET", "7.7.7.7")).status;
  check("a single client is rate limited (8 per minute)", last === 429, String(last));
  check("another client is unaffected", (await call("GET", "8.8.8.8")).status === 200);
}

console.log(failed === 0 ? "\nALL PASSED" : `\n${failed} FAILED`);
Deno.exit(failed === 0 ? 0 : 1);
