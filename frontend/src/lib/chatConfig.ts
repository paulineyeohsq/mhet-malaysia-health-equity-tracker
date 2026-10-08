/**
 * Public URL of the deployed chat-proxy backend (a Netlify Edge Function, see
 * netlify-chat/README.md). Not sensitive — this is a public endpoint the
 * browser calls directly. The same URL is used in local dev: the function's
 * CORS allow-list includes localhost:5173, and there is no local server for it.
 *
 * VITE_CHAT_URL overrides it, e.g. to point at a different deployment.
 */
export const CHAT_URL: string = import.meta.env.VITE_CHAT_URL ?? "https://mhet-chat.netlify.app";
