# `/worker` — MHET chat proxy

A small Cloudflare Worker that powers the "MHET Assistant" chat panel in the
dashboard. It does exactly one thing beyond what the static site already
does: relay chat messages to Google Gemini with a server-held API key, so
the key is never exposed in client-side code.

It does **not** have a database or a data pipeline of its own. On every
chat request it fetches the same public static JSON everyone reads from
`frontend/public/data/*.json` — live, from the deployed GitHub Pages site
— and passes the file(s) relevant to whatever page the user is chatting
from, plus `dataset_inventory.json` for citation/limitation context, to
Gemini as grounding. Every number the model can reference is therefore
traceable to the same audited static files described in the root
`README.md` and `docs/METHODOLOGY.md`.

## Local development

Requires **Node.js 22+** (the current `wrangler` major requires it; older
`wrangler` versions that run on Node 20 carry known vulnerabilities in their
local dev-server tooling, so this project pins to the current major instead
of downgrading). Deployment via `wrangler deploy` runs on Cloudflare's edge
runtime regardless of your local Node version, so this only affects
`wrangler dev`/`login`/`deploy` on your own machine.

```bash
npm install
# Create worker/.dev.vars (gitignored) with:
#   GEMINI_API_KEY=<your key from https://aistudio.google.com/apikey>
npx wrangler dev
```
Runs at `http://localhost:8787` by default, matching
`frontend/src/lib/chatConfig.ts`'s dev-mode URL.

## Deploy

```bash
npx wrangler login
npx wrangler kv namespace create RATE_LIMIT_KV   # copy the id into wrangler.toml
npx wrangler secret put GEMINI_API_KEY
npx wrangler deploy
```
Copy the printed `*.workers.dev` URL into
`frontend/src/lib/chatConfig.ts`'s production branch, then rebuild/redeploy
the frontend.

## Endpoint

`POST /chat` — body `{ messages: {role, content}[], path: string }`,
returns `{ reply: string }` or `{ error: string }`. CORS is restricted to
the production GitHub Pages origin and `localhost:5173` for local dev.
Rate-limited to 10 requests/IP/minute via the `RATE_LIMIT_KV` namespace.
