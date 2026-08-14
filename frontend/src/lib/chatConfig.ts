/**
 * Public URL of the deployed chat-proxy backend. Not sensitive — this is a
 * public endpoint the browser calls directly, no env var machinery needed.
 * In local dev (`npm run dev`), points at `wrangler dev`'s default local
 * port for the Cloudflare Worker (see /worker) — there's no local dev
 * server for the active Netlify Edge Function deployment (see
 * netlify-chat/README.md), so local chat testing still goes through
 * /worker if you have Node 22+. Production points at the live Netlify
 * deployment (see netlify-chat/README.md for how it's deployed).
 */
export const CHAT_WORKER_URL = import.meta.env.DEV
  ? "http://localhost:8787"
  : "https://mhet-chat.netlify.app";
