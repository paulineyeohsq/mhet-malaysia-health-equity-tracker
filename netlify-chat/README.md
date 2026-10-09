# `/netlify-chat` — MY-HEO chat proxy (Netlify Edge Function, active deployment)

Relays "Ask MY-HEO" chat and "Explain this chart" requests to Google Gemini
with a server-held API key, grounded in the same public static JSON everyone
else reads from `frontend/public/data/*.json`. (An equivalent Cloudflare Worker
used to live in `/worker`; it was never deployed and has been removed.)

Rate limiting uses Netlify Blobs, which has no built-in TTL — old per-minute
buckets aren't cleaned up; negligible at this project's traffic scale. GH Pages
JSON is fetched fresh on each request (no edge cache) — a latency cost, not a
correctness one.

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
    lib/                             # shared modules — must live outside the top level of
                                      # edge-functions/, since Netlify's bundler treats every
                                      # top-level .ts file there as its own function and errors
                                      # on ones with no `export default` handler
      config.ts                      # the site address, repository and allowed origins - the one place
                                      # both functions read them from (SITE_URL env var overrides the address)
      pageData.ts                    # route → data-file map 
      systemPrompt.ts                # guardrail prompt 
      gemini.ts                      # Gemini API client 
```

## Local development

Netlify Edge Functions run on Deno, not Node — there's no local
`npm install`/typecheck step for this directory.
`netlify-cli`'s `netlify dev` requires Node >=22.13.0 to run at all; if your
machine is on an older Node, you can't run it locally and must rely on the deployed environment,
or the Netlify REST API directly, to verify changes.

`package.json` here exists solely so Netlify's build step can resolve the
bare `@netlify/blobs` import in `chat.ts` — confirmed via isolated testing
that a build-based deploy fails with a generic "exit code 2" error if this
dependency isn't declared, even though nothing here runs `npm install`
against it directly otherwise. Don't add a `scripts` field — an
auto-detected build script that doesn't apply to this site is a separate
way to break the same build stage.

## `/refresh` - "Check for newer data" / "Update now"

Used by the card on the dashboard's home page (`edge-functions/refresh.ts`).

- `GET /refresh` asks every publisher whether it has released anything since the pipeline last ingested it (a HEAD
  request on each downloaded file and the data.gov.my catalogue metadata, compared with the baseline the pipeline
  stored in `dataset_inventory.json` > `source_status`), and returns the latest `update-data.yml` and `deploy-pages.yml`
  runs so the page can show progress, plus `reviewPending` (the open `automated/data-refresh` pull request, if a refresh
  was held for a person to approve). Results are shared for 5 minutes.
- `POST /refresh` starts `update-data.yml` on `main`, **only if** something really is newer, no refresh is already running,
  and the last one started more than 3 hours ago. The workflow still has to pass lint, tests and the browser suite before
  anything is published.

To switch on the "Update the dashboard now" button, create a **fine-grained personal access token** (GitHub > Settings >
Developer settings) restricted to the one repository `paulineyeohsq/mhet-malaysia-health-equity-tracker` with
**Actions: Read and write** (and the default Metadata: Read), and add it to this Netlify site as the environment variable
`GITHUB_DISPATCH_TOKEN` (scope: Functions / edge functions), then redeploy. The token never leaves the function. Without
it the check still works and the page tells visitors the data refreshes itself every Monday. Set an expiry on the token
and renew it; when it expires the button quietly falls back to that message.

## Tests

`test/chat.test.ts` and `test/refresh.test.ts` check the functions's behaviour (per-IP limit, the no-IP fingerprint bucket, the daily
cap and its message, CORS, input validation, that rejected requests never reach Gemini) under
[Deno](https://deno.com) with in-memory stand-ins for Netlify Blobs and the outbound calls, so it needs no
network, API key or Netlify account:

```bash
cd netlify-chat
deno run -A --no-check --import-map=test/import_map.json test/chat.test.ts
deno run -A --no-check --import-map=test/import_map.json test/refresh.test.ts
deno run -A --no-check --import-map=test/import_map.json test/config.test.ts
```

It does not exercise Netlify's own runtime, so the deploy preview is still the final check.

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
the dashboard origins listed in `lib/config.ts` (`https://my-heo.netlify.app`, the original GitHub Pages site) and
`localhost:5173` for local dev.
Rate-limited to 10 requests/IP/minute via Netlify Blobs.
