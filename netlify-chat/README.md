# `/netlify-chat` — MHET chat proxy (Netlify Edge Function, active deployment)

Same job as `/worker`'s Cloudflare Worker (see its README for the full
rationale) — relays "Ask MY-HEO" chat and "Explain this chart" requests to
Google Gemini with a server-held API key, grounded in the same public static
JSON everyone else reads from `frontend/public/data/*.json`. Ported here
because the maintainer has a Netlify account, not a Cloudflare one; the two
implementations are logically identical (same constants, same rules, same
`gemini-3-flash-preview` model) except where the platforms genuinely differ:

| | Cloudflare (`/worker`) | Netlify (`/netlify-chat`) |
|---|---|---|
| Env vars | `env.GEMINI_API_KEY` binding | `Netlify.env.get("GEMINI_API_KEY")` |
| Client IP | `CF-Connecting-IP` header | `context.ip` |
| Rate-limit store | Workers KV (`expirationTtl`) | Netlify Blobs (no built-in TTL — old per-minute buckets aren't cleaned up; negligible at this project's traffic scale, disclosed not silently dropped) |
| Response caching | Cloudflare Cache API | none — GH Pages JSON fetched fresh each request (GH Pages sets its own cache headers; a latency cost, not a correctness one) |

This directory is its own self-contained Netlify site — it does **not**
serve the dashboard itself (that stays on GitHub Pages); `public/index.html`
is a one-line placeholder since Netlify requires some publish directory.

## Structure

```
netlify-chat/
  netlify.toml                       # publish = "public"; the edge function's own
                                      # `export const config = { path: "/chat" }`
                                      # registers its route, no extra declaration needed
  public/index.html                  # placeholder — the real content is the /chat API
  netlify/edge-functions/
    chat.ts                          # handler — CORS, rate limit, grounding, Gemini call
    pageData.ts                      # route → data-file map (keep in sync with worker/src/pageData.ts)
    systemPrompt.ts                  # guardrail prompt (keep in sync with worker/src/systemPrompt.ts)
    gemini.ts                        # Gemini API client (keep in sync with worker/src/gemini.ts)
```

## Local development

Netlify Edge Functions run on Deno, not Node — there's no local
`npm install`/typecheck step for this directory the way `/worker` has one.
`netlify-cli`'s `netlify dev` requires Node >=22.13.0 to run at all (same
version floor Cloudflare's `wrangler` has); if your machine is on an older
Node, you can't run it locally and must rely on the deployed environment,
or the Netlify REST API directly, to verify changes.

## Deploy

Deployed via the Netlify REST API (`https://api.netlify.com/api/v1/`),
authenticated with a Personal Access Token — no `netlify-cli` involved, so
the Node version floor above doesn't block a deploy, only local `netlify dev`.
Broadly: create the site once (`POST /sites`), set `GEMINI_API_KEY` as a
site environment variable scoped for edge-function runtime access, then zip
this directory's contents and `POST` to `/sites/{id}/deploys`. Copy the
resulting `*.netlify.app` URL into `frontend/src/lib/chatConfig.ts`'s
production branch.

## Endpoint

`POST /chat` — body `{ messages: {role, content}[], path: string }`,
returns `{ reply: string }` or `{ error: string }`. CORS is restricted to
the production GitHub Pages origin and `localhost:5173` for local dev.
Rate-limited to 10 requests/IP/minute via Netlify Blobs.
