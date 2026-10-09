import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/edge-functions";
import { allowedOrigin, REPO, siteUrl } from "./lib/config.ts";

/**
 * "Check for newer data" / "Update now" for the dashboard's home page.
 *
 *   GET  /refresh  ->  asks every publisher whether it has released anything since the pipeline last ingested it,
 *                      and reports the state of the refresh workflow that would pick it up.
 *   POST /refresh  ->  if (and only if) something really is newer, starts that workflow on GitHub.
 *
 * Why this is safe to leave public: a POST does nothing unless a publisher's file really changed since the last
 * ingest (so it cannot be used to burn Actions minutes), never while a refresh is already running, not more than
 * once per COOLDOWN, and the workflow itself still has to pass lint, tests and the browser suite before anything is
 * published. The GitHub token (env GITHUB_DISPATCH_TOKEN, a fine-grained token limited to Actions on this one
 * repository) lives only here and is never sent to the browser. Without it the check still works and the page tells
 * visitors that updates are applied automatically every Monday.
 */

const UPDATE_WORKFLOW = "update-data.yml";
const DEPLOY_WORKFLOW = "deploy-pages.yml";
const CHECK_TTL_MS = 5 * 60_000; // many visitors clicking at once share one round of publisher requests
const COOLDOWN_MS = 3 * 3_600_000; // at most one on-demand refresh per three hours
const FETCH_TIMEOUT_MS = 8_000;
const RATE_LIMIT_PER_MINUTE = 8;

interface SourceEntry {
  data_as_of?: string;
  last_updated?: string;
  next_update?: string;
  api_id?: string;
  http_url?: string;
  etag?: string;
  last_modified?: string;
}

interface Inventory {
  datasets?: { id: string; name: string }[];
  source_status?: Record<string, SourceEntry>;
}

export interface NewerDataset {
  id: string;
  name: string;
  reason: string;
}

export interface CheckResult {
  checkedAt: string;
  total: number;
  newer: NewerDataset[];
  unchecked: number;
}

interface RunInfo {
  status: string;
  conclusion: string | null;
  createdAt: string;
  url: string;
}

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": allowedOrigin(origin),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...corsHeaders(origin) },
  });
}

async function timed(url: string, init: RequestInit = {}): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function underRateLimit(request: Request, ip: string | undefined): Promise<boolean> {
  const store = getStore("rate-limit");
  const id = ip ?? `ua-${request.headers.get("user-agent") ?? ""}`.slice(0, 80);
  const key = `refresh:${id}:${Math.floor(Date.now() / 60000)}`;
  const n = parseInt((await store.get(key)) ?? "0", 10);
  if (n >= RATE_LIMIT_PER_MINUTE) return false;
  await store.set(key, String(n + 1));
  return true;
}

/** Why this dataset counts as newer at its publisher than when it was last ingested, or null if unchanged/unknown. */
async function newerReason(entry: SourceEntry): Promise<{ reason: string | null; checked: boolean }> {
  try {
    // A direct look at the file the pipeline downloads is the most reliable signal (publishers' catalogue metadata
    // can lag the file by days).
    if (entry.http_url && (entry.etag || entry.last_modified)) {
      // Ask for the uncompressed file: a compressed response carries a different (weak) ETag that would never match the
      // one recorded when the file was downloaded, and every such file would look "replaced".
      const res = await timed(entry.http_url, { method: "HEAD", headers: { "Accept-Encoding": "identity" } });
      if (res.ok) {
        const etag = res.headers.get("etag");
        const modified = res.headers.get("last-modified");
        // A weak ETag (W/...) cannot be compared with the strong one on record: fall through to Last-Modified, or leave
        // the dataset unchecked, rather than call it newer.
        if (entry.etag && etag && !etag.startsWith("W/")) {
          return { reason: etag !== entry.etag ? `file replaced${modified ? ` (${modified})` : ""}` : null, checked: true };
        }
        if (entry.last_modified && modified) {
          return { reason: modified !== entry.last_modified ? `file updated ${modified}` : null, checked: true };
        }
      }
    }
    if (entry.api_id && entry.last_updated) {
      const res = await timed(`https://api.data.gov.my/data-catalogue/?id=${encodeURIComponent(entry.api_id)}&limit=1&meta=true`);
      if (res.ok) {
        const meta = ((await res.json()) as { meta?: { last_updated?: string; data_as_of?: string } }).meta;
        if (meta?.last_updated) {
          return {
            reason: meta.last_updated !== entry.last_updated ? `publisher updated ${meta.last_updated.slice(0, 10)}` : null,
            checked: true,
          };
        }
      }
    }
  } catch {
    /* a source that cannot be reached right now is reported as "unchecked", never as "newer" */
  }
  return { reason: null, checked: false };
}

export async function check(): Promise<CheckResult> {
  const res = await timed(`${siteUrl()}data/dataset_inventory.json`, { headers: { "Cache-Control": "no-cache" } });
  if (!res.ok) throw new Error(`inventory HTTP ${res.status}`);
  const inventory = (await res.json()) as Inventory;
  const names = new Map((inventory.datasets ?? []).map((d) => [d.id, d.name]));
  const entries = Object.entries(inventory.source_status ?? {});
  const results = await Promise.all(entries.map(async ([id, entry]) => ({ id, ...(await newerReason(entry)) })));
  return {
    checkedAt: new Date().toISOString(),
    total: entries.length,
    newer: results.filter((r) => r.reason).map((r) => ({ id: r.id, name: names.get(r.id) ?? r.id, reason: r.reason as string })),
    unchecked: results.filter((r) => !r.checked).length,
  };
}

async function cachedCheck(): Promise<CheckResult> {
  const store = getStore("refresh");
  try {
    const hit = JSON.parse((await store.get("check")) ?? "null") as CheckResult | null;
    if (hit && Date.now() - Date.parse(hit.checkedAt) < CHECK_TTL_MS) return hit;
  } catch {
    /* no usable cache */
  }
  const fresh = await check();
  try {
    await store.set("check", JSON.stringify(fresh));
  } catch {
    /* caching is an optimisation only */
  }
  return fresh;
}

function githubHeaders(token: string | undefined): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "mhet-refresh",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function latestRun(workflow: string, token: string | undefined): Promise<RunInfo | null> {
  try {
    const res = await timed(`https://api.github.com/repos/${REPO}/actions/workflows/${workflow}/runs?per_page=1&branch=main`, {
      headers: githubHeaders(token),
    });
    if (!res.ok) return null;
    const run = ((await res.json()) as { workflow_runs?: { status: string; conclusion: string | null; created_at: string; html_url: string }[] })
      .workflow_runs?.[0];
    return run ? { status: run.status, conclusion: run.conclusion, createdAt: run.created_at, url: run.html_url } : null;
  } catch {
    return null;
  }
}

const isActive = (r: RunInfo | null) => r !== null && (r.status === "queued" || r.status === "in_progress" || r.status === "waiting");

async function state(token: string | undefined) {
  const [update, deploy] = await Promise.all([latestRun(UPDATE_WORKFLOW, token), latestRun(DEPLOY_WORKFLOW, token)]);
  const cooldownUntil = update && Date.now() - Date.parse(update.createdAt) < COOLDOWN_MS ? new Date(Date.parse(update.createdAt) + COOLDOWN_MS).toISOString() : null;
  return { update, deploy, cooldownUntil };
}

async function handle(request: Request, context: Context, origin: string | null): Promise<Response> {
  const token = Netlify.env.get("GITHUB_DISPATCH_TOKEN");
  if (!(await underRateLimit(request, context.ip))) return json({ error: "Too many requests - please slow down." }, 429, origin);

  let found: CheckResult;
  try {
    found = await cachedCheck();
  } catch {
    return json({ error: "Couldn't reach the data sources to check them. Please try again shortly." }, 502, origin);
  }
  const s = await state(token);
  const base = { ...found, canUpdate: Boolean(token), update: s.update, deploy: s.deploy, cooldownUntil: s.cooldownUntil };

  if (request.method === "GET") return json(base, 200, origin);

  // POST: act only if something is genuinely newer
  if (found.newer.length === 0) return json({ ...base, status: "up-to-date" }, 200, origin);
  if (!token) return json({ ...base, status: "not-configured" }, 200, origin);
  if (isActive(s.update)) return json({ ...base, status: "already-running" }, 200, origin);
  if (s.cooldownUntil) return json({ ...base, status: "cooldown" }, 200, origin);

  const res = await timed(`https://api.github.com/repos/${REPO}/actions/workflows/${UPDATE_WORKFLOW}/dispatches`, {
    method: "POST",
    headers: { ...githubHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ ref: "main", inputs: { publish: "auto" } }),
  });
  if (res.status !== 204) return json({ ...base, status: "failed" }, 502, origin);
  return json({ ...base, status: "started", update: { status: "queued", conclusion: null, createdAt: new Date().toISOString(), url: `https://github.com/${REPO}/actions` } }, 200, origin);
}

export default async (request: Request, context: Context): Promise<Response> => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (request.method === "GET" || request.method === "POST") {
    try {
      return await handle(request, context, origin);
    } catch {
      return json({ error: "Something went wrong. Please try again." }, 500, origin);
    }
  }
  return json({ error: "Not found." }, 404, origin);
};

export const config: Config = { path: "/refresh" };
