import { bundleFor } from "./pageData";
import { SYSTEM_PROMPT } from "./systemPrompt";
import { callGemini, GeminiError, type ChatMessage } from "./gemini";

export interface Env {
  GEMINI_API_KEY: string;
  RATE_LIMIT_KV: KVNamespace;
}

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

async function checkRateLimit(kv: KVNamespace, ip: string): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 60000);
  const key = `rl:${ip}:${bucket}`;
  const current = parseInt((await kv.get(key)) ?? "0", 10);
  if (current >= RATE_LIMIT_PER_MINUTE) return false;
  await kv.put(key, String(current + 1), { expirationTtl: 90 });
  return true;
}

async function fetchDataFile(name: string): Promise<{ name: string; body: string } | null> {
  const url = GH_PAGES_BASE + name;
  const cache = caches.default;
  const cacheKey = new Request(url);
  let res = await cache.match(cacheKey);
  if (!res) {
    let upstream: Response;
    try {
      upstream = await fetch(url);
    } catch {
      return null;
    }
    if (!upstream.ok) return null;
    const body = await upstream.text();
    res = new Response(body, {
      headers: { "Content-Type": "application/json", "Cache-Control": "max-age=14400" },
    });
    // Cache asynchronously without blocking the response.
    await cache.put(cacheKey, res.clone());
  }
  return { name, body: await res.text() };
}

function buildContextBlock(files: { name: string; body: string }[], missing: string[]): string {
  const parts = files.map((f) => `### ${f.name}\n${f.body}`);
  if (missing.length > 0) {
    parts.push(`### NOTE: the following files failed to load this turn and are unavailable: ${missing.join(", ")}`);
  }
  return `Here is the real data currently relevant to the page the user is on, plus the dataset catalogue:\n\n${parts.join("\n\n")}`;
}

async function handleChat(request: Request, env: Env, origin: string | null): Promise<Response> {
  if (!env.GEMINI_API_KEY) {
    return json({ error: "Chat is not configured yet." }, 500, origin);
  }

  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const withinLimit = await checkRateLimit(env.RATE_LIMIT_KV, ip);
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
    const reply = await callGemini(env.GEMINI_API_KEY, SYSTEM_PROMPT, contextBlock, messages);
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (request.method === "POST" && url.pathname === "/chat") {
      try {
        return await handleChat(request, env, origin);
      } catch {
        return json({ error: "Unexpected server error." }, 500, origin);
      }
    }

    return json({ error: "Not found." }, 404, origin);
  },
};
