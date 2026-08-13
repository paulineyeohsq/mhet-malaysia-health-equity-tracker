/**
 * Public URL of the deployed chat-proxy Cloudflare Worker (see /worker).
 * Not sensitive — this is a public endpoint the browser calls directly, no
 * env var machinery needed. In local dev (`npm run dev`), points at
 * `wrangler dev`'s default local port; update the production line below
 * once you've run `wrangler deploy` (see worker/README.md).
 */
export const CHAT_WORKER_URL = import.meta.env.DEV
  ? "http://localhost:8787"
  : "https://REPLACE-ME.workers.dev"; // fill in after `wrangler deploy`
