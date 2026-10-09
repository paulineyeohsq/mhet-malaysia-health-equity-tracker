import { useCallback, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { canonicalPath } from "./routes";
import {
  aiErrorMessage,
  ChatContext,
  postChat,
  ChatError,
  type ChatContextValue,
  type ChatMessage,
} from "./chatCore";

/**
 * Owns the "Ask MY-HEO" chat state so both the chat panel itself and any
 * chart's "Explain this" button can drive the same conversation. Grounding
 * (which real data files the assistant sees) is decided server-side in
 * netlify-chat/netlify/edge-functions/lib/pageData.ts, keyed by location.pathname — unchanged from the
 * original ChatPanel-local implementation this was extracted from.
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (next: ChatMessage[]) => {
      setLoading(true);
      setError(null);
      try {
        const { reply } = await postChat({ messages: next, path: canonicalPath(location.pathname) });
        setMessages([...next, { role: "assistant", content: reply }]);
      } catch (e) {
        setError(aiErrorMessage(e));
      } finally {
        setLoading(false);
      }
    },
    [location.pathname]
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;
      const next: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
      setMessages(next);
      await run(next);
    },
    [messages, loading, run]
  );

  const retry = useCallback(async () => {
    if (loading || messages.length === 0 || messages[messages.length - 1].role !== "user") return;
    await run(messages);
  }, [messages, loading, run]);

  const explain = useCallback(
    (prompt: string) => {
      setOpen(true);
      void send(prompt);
    },
    [send]
  );

  const askDirect = useCallback(
    async (prompt: string, options?: { pageContext?: boolean }): Promise<string> => {
      // Exponential backoff — up to 3 retries after 3s, 6s, then 12s — when
      // the service is rate-limited: 503 (the backend's translation of
      // Gemini's 429 "busy") or 429 (the backend's own per-IP limit). These
      // are mostly per-minute limits that clear quickly, so patient retries
      // hide most of them from the user. The daily cap (code "daily_cap") will
      // not clear in seconds, so it fails immediately, as does anything else.
      const MAX_RETRIES = 3;
      for (let attempt = 0; ; attempt++) {
        try {
          const { reply } = await postChat({
            messages: [{ role: "user", content: prompt }],
            path: canonicalPath(location.pathname),
            ...(options?.pageContext ? {} : { context: "none" }),
          });
          return reply;
        } catch (e) {
          const retryable =
            e instanceof ChatError && (e.status === 503 || e.status === 429) && e.code !== "daily_cap";
          if (!retryable || attempt >= MAX_RETRIES) throw e;
          await new Promise((r) => setTimeout(r, 3000 * 2 ** attempt));
        }
      }
    },
    [location.pathname]
  );

  const value: ChatContextValue = {
    open,
    setOpen,
    messages,
    loading,
    error,
    clearError: () => setError(null),
    send,
    retry,
    explain,
    askDirect,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
