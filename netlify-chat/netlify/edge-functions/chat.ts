import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/edge-functions";
import { bundleFor } from "./lib/pageData.ts";
import { SYSTEM_PROMPT } from "./lib/systemPrompt.ts";
import { callGemini, GeminiError, type ChatMessage } from "./lib/gemini.ts";
import { buildCompactContext, NO_PAGE_CONTEXT } from "./lib/compactContext.ts";
import { allowedOrigin, siteUrl } from "./lib/config.ts";

/**
 * Netlify Edge Function: chat proxy for the dashboard's AI features — CORS,
 * per-IP rate limit (Netlify Blobs), data grounding, Gemini call. CORS headers
 * are kept deliberately: this API is called from a different origin (the
 * GitHub Pages frontend) than it's deployed on, so without
 * Access-Control-Allow-Origin the browser would block every response.
 *
 * Netlify Blobs has no built-in TTL, so old per-minute rate-limit buckets are
 * never cleaned up — a disclosed simplification; at this project's traffic
 * scale the extra unused keys are negligible.
 */

const MAX_BODY_BYTES = 20_000;
const MAX_TURNS = 8;
// 6000 (was 2000): the Research Opportunities prompts embed a ~26-row indicator table
// plus rules and a required response format, ~3-4k chars. At 2000 the slice below
// silently cut off the rules/format at the END of the prompt, so the model
// ignored the requested structure. Total body is still capped by MAX_BODY_BYTES.
const MAX_MESSAGE_CHARS = 6000;
const RATE_LIMIT_PER_MINUTE = 10;
// Requests whose client IP could not be determined get a much smaller per-minute allowance, keyed by a
// hash of their headers (user-agent + language) instead of one shared "unknown" bucket that every such
// caller would drain together.
const RATE_LIMIT_UNKNOWN_IP_PER_MINUTE = 3;
// Global cap on AI calls per UTC day across all callers, to bound Gemini quota/cost. Override with the
// DAILY_REQUEST_CAP environment variable (a positive integer; 0 or invalid falls back to the default).
const DEFAULT_DAILY_REQUEST_CAP = 1000;

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = allowedOrigin(origin);
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

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

/** Per-client, per-minute limit. Known IPs get RATE_LIMIT_PER_MINUTE; unknown ones a header-fingerprint bucket
 * with a smaller allowance. Read-then-write on Netlify Blobs is not atomic, so under heavy concurrency a few
 * extra requests can slip through — the limit is a soft guard, the daily cap below is the backstop. */
async function checkRateLimit(request: Request, ip: string | undefined): Promise<boolean> {
  const store = getStore("rate-limit");
  const bucket = Math.floor(Date.now() / 60000);
  let id: string;
  let limit: number;
  if (ip) {
    id = ip;
    limit = RATE_LIMIT_PER_MINUTE;
  } else {
    id = `fp-${await sha256Hex(`${request.headers.get("user-agent") ?? ""}|${request.headers.get("accept-language") ?? ""}`)}`;
    limit = RATE_LIMIT_UNKNOWN_IP_PER_MINUTE;
  }
  const key = `rl:${id}:${bucket}`;
  const current = parseInt((await store.get(key)) ?? "0", 10);
  if (current >= limit) return false;
  await store.set(key, String(current + 1));
  return true;
}

function dailyCap(): number {
  const n = parseInt(Netlify.env.get("DAILY_REQUEST_CAP") ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_DAILY_REQUEST_CAP;
}

/** Counts this request against today's (UTC) global total; false once the cap has been reached. Same
 * non-atomic caveat as above: the cap can be overshot slightly under concurrency. */
async function takeDailyBudget(): Promise<boolean> {
  const store = getStore("rate-limit");
  const key = `daily:${new Date().toISOString().slice(0, 10)}`;
  const used = parseInt((await store.get(key)) ?? "0", 10);
  if (used >= dailyCap()) return false;
  await store.set(key, String(used + 1));
  return true;
}

async function fetchDataFile(name: string): Promise<{ name: string; body: string } | null> {
  const url = `${siteUrl()}data/${name}`;
  try {
    const upstream = await fetch(url);
    if (!upstream.ok) return null;
    return { name, body: await upstream.text() };
  } catch {
    return null;
  }
}

async function handleChat(request: Request, context: Context, origin: string | null): Promise<Response> {
  const apiKey = Netlify.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    return json({ error: "The assistant is currently unavailable." }, 500, origin);
  }

  const withinLimit = await checkRateLimit(request, context.ip);
  if (!withinLimit) {
    return json({ error: "Too many requests — please slow down." }, 429, origin);
  }

  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    return json({ error: "That question is too long. Please shorten it and try again." }, 413, origin);
  }

  let parsed: { messages?: unknown; path?: unknown; context?: unknown };
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return json({ error: "That question couldn't be processed. Please try again." }, 400, origin);
  }

  if (!Array.isArray(parsed.messages)) {
    return json({ error: "That question couldn't be processed. Please try again." }, 400, origin);
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
    return json({ error: "Please type a question first." }, 400, origin);
  }

  // Callers whose message already carries all the data they need (the Research Opportunities cards) send
  // context: "none", so no page data is attached. Otherwise the page's data files are attached in a compacted
  // form (see lib/compactContext.ts) — verbatim they ran to 28k-1.5M tokens per request.
  let contextBlock: string;
  if (parsed.context === "none") {
    contextBlock = NO_PAGE_CONTEXT;
  } else {
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
        { error: "Data for this section is currently unavailable. Please try again shortly." },
        502,
        origin
      );
    }
    contextBlock = buildCompactContext(files, missing);
  }

  // Counted only once the request is valid and about to cost a Gemini call.
  if (!(await takeDailyBudget())) {
    return json(
      {
        error:
          "The AI assistant has reached its daily limit and is paused until tomorrow (resets at 8:00 am Malaysia time). The charts, maps and tables all still work.",
        code: "daily_cap",
      },
      429,
      origin
    );
  }

  try {
    const { text: reply, model } = await callGemini(apiKey, SYSTEM_PROMPT, contextBlock, messages);
    return json({ reply, model }, 200, origin);
  } catch (e) {
    if (e instanceof GeminiError) {
      if (e.status === 401 || e.status === 403) {
        return json({ error: "The assistant is currently unavailable." }, 502, origin);
      }
      if (e.status === 429 || e.status === 503) {
        return json({ error: "The AI service is temporarily busy — try again in a moment." }, 503, origin);
      }
      return json({ error: "Couldn't reach the AI service — try again shortly." }, 502, origin);
    }
    return json({ error: "The assistant is currently unavailable." }, 500, origin);
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
      return json({ error: "Something went wrong. Please try again." }, 500, origin);
    }
  }

  return json({ error: "Not found." }, 404, origin);
};

export const config: Config = { path: "/chat" };
