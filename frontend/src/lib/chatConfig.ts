/**
 * Public URL of the deployed chat-proxy backend. Not sensitive — this is a
 * public endpoint the browser calls directly, no env var machinery needed.
 * In local dev (`npm run dev`), points at `wrangler dev`'s default local
 * port for the Cloudflare Worker (see /worker) — there's no local dev
 * server for the active Netlify Edge Function deployment (see
 * netlify-chat/README.md), so local chat testing still goes through
 * /worker if you have Node 22+. Production points at the live Netlify
 * deployment (see netlify-chat/README.md for how it's deployed).
 *
 * VITE_CHAT_URL overrides both — e.g. `VITE_CHAT_URL=https://mhet-chat.netlify.app
 * npm run dev` lets the AI features be tried from localhost:5173, which the
 * Netlify function's CORS allow-list permits.
 */
export const CHAT_WORKER_URL: string =
  import.meta.env.VITE_CHAT_URL ?? (import.meta.env.DEV ? "http://localhost:8787" : "https://mhet-chat.netlify.app");
