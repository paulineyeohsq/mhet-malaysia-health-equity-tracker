import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/edge-functions";
import { bundleFor } from "./pageData.ts";
import { SYSTEM_PROMPT } from "./systemPrompt.ts";
import { callGemini, GeminiError, type ChatMessage } from "./gemini.ts";

/**
 * Netlify Edge Function port of worker/src/index.ts (the Cloudflare
 * version of this same backend) — same CORS/rate-limit/size logic, same
 * grounding strategy. CORS headers are kept deliberately (Netlify's
 * general guidance is to skip them unless the architecture genuinely
 * needs cross-origin access) — this API is called from a different
 * origin (the GitHub Pages frontend) than it's deployed on, so without
 * Access-Control-Allow-Origin the browser would block every response.
 *
 * Differences from the Cloudflare version, all forced by the platform:
 *   - env var access: Netlify.env.get() instead of an `env` binding
 *   - client IP: context.ip instead of a CF-Connecting-IP header
 *   - rate-limit store: Netlify Blobs instead of Workers KV — Blobs has no
 *     built-in TTL (Workers KV's expirationTtl doesn't have an equivalent
 *     here), so old per-minute buckets are never cleaned up. Disclosed
 *     simplification: at this project's traffic scale the extra unused
 *     keys are negligible, not a silent shortcut.
 *   - no Cloudflare Cache API — GH Pages JSON is fetched directly each
 *     request rather than edge-cached; GH Pages itself sets its own
 *     caching headers, so this is a minor latency cost, not a correctness one.
 */

const GH_PAGES_BASE = "https://paulineyeohsq.github.io/mhet-malaysia-health-equity-tracker/data/";
const ALLOWED_ORIGINS = new Set(["https://paulineyeohsq.github.io", "http://localhost:5173"]);
const MAX_BODY_BYTES = 20_000;
const MAX_TURNS = 8;
const MAX_MESSAGE_CHARS = 2000;
const RATE_LIMIT_PER_MINUTE = 10;

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

async function checkRateLimit(ip: string): Promise<boolean> {
  const store = getStore("rate-limit");
  const bucket = Math.floor(Date.now() / 60000);
  const key = `rl:${ip}:${bucket}`;
  const current = parseInt((await store.get(key)) ?? "0", 10);
  if (current >= RATE_LIMIT_PER_MINUTE) return false;
  await store.set(key, String(current + 1));
  return true;
}

async function fetchDataFile(name: string): Promise<{ name: string; body: string } | null> {
  const url = GH_PAGES_BASE + name;
  try {
    const upstream = await fetch(url);
    if (!upstream.ok) return null;
    return { name, body: await upstream.text() };
  } catch {
    return null;
  }
}

function buildContextBlock(files: { name: string; body: string }[], missing: string[]): string {
  const parts = files.map((f) => `### ${f.name}\n${f.body}`);
  if (missing.length > 0) {
    parts.push(`### NOTE: the following files failed to load this turn and are unavailable: ${missing.join(", ")}`);
  }
  return `Here is the real data currently relevant to the page the user is on, plus the dataset catalogue:\n\n${parts.join("\n\n")}`;
}

async function handleChat(request: Request, context: Context, origin: string | null): Promise<Response> {
  const apiKey = Netlify.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return json({ error: "Chat is not configured yet." }, 500, origin);
  }

  const ip = context.ip || "unknown";
  const withinLimit = await checkRateLimit(ip);
  if (!withinLimit) {
    return json({ error: "Too many requests — please slow down." }, 429, origin);
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return json({ error: "Request too large." }, 413, origin);
  }

  let parsed: { messages?: unknown; path?: unknown };
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON body." }, 400, origin);
  }

  if (!Array.isArray(parsed.messages)) {
    return json({ error: "messages must be an array." }, 400, origin);
  }
  const messages: ChatMessage[] = parsed.messages
    .filter(
      (m): m is ChatMessage =>
        typeof m === "object" &&
        m !== null &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string"
    )
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }))
    .slice(-MAX_TURNS);

  if (messages.length === 0) {
    return json({ error: "No valid messages provided." }, 400, origin);
  }

  const path = typeof parsed.path === "string" ? parsed.path : "";
  const fileNames = Array.from(new Set(["dataset_inventory.json", ...bundleFor(path)]));

  const results = await Promise.allSettled(fileNames.map(fetchDataFile));
  const files: { name: string; body: string }[] = [];
  const missing: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value) {
      files.push(r.value);
    } else {
      missing.push(fileNames[i]);
    }
  });

  if (files.length === 0) {
    return json(
      { error: "Couldn't load current dashboard data right now — please try again shortly." },
      502,
      origin
    );
  }

  const contextBlock = buildContextBlock(files, missing);

  try {
    const reply = await callGemini(apiKey, SYSTEM_PROMPT, contextBlock, messages);
    return json({ reply }, 200, origin);
  } catch (e) {
    if (e instanceof GeminiError) {
      if (e.status === 401 || e.status === 403) {
        return json({ error: "Chat service auth error — the API key may be invalid." }, 502, origin);
      }
      if (e.status === 429) {
        return json({ error: "The AI service is temporarily busy — try again in a moment." }, 503, origin);
      }
      return json({ error: "Couldn't reach the AI service — try again shortly." }, 502, origin);
    }
    return json({ error: "Unexpected error handling the chat request." }, 500, origin);
  }
}

export default async (request: Request, context: Context): Promise<Response> => {
  const origin = request.headers.get("Origin");

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (request.method === "POST") {
    try {
      return await handleChat(request, context, origin);
    } catch {
      return json({ error: "Unexpected server error." }, 500, origin);
    }
  }

  return json({ error: "Not found." }, 404, origin);
};

export const config: Config = { path: "/chat" };
