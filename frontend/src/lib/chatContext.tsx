import { createContext, useCallback, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useLocation } from "react-router-dom";
import { CHAT_WORKER_URL } from "./chatConfig";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatContextValue {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  clearError: () => void;
  /** Sends `text` as a user turn through the existing /chat endpoint. */
  send: (text: string) => Promise<void>;
  /** Opens the panel and sends a pre-built prompt — used by chart "Explain this" buttons. */
  explain: (prompt: string) => void;
}

const EXPLAIN_ROW_CAP = 60;

/**
 * Builds the "Explain this" prompt from a chart's own title + CSV export
 * data (the exact string each chart already builds for its Export CSV
 * button — pass it in rather than re-deriving here, so this stays
 * decoupled from DataTable's Column/toCSV types). Caps to the first 60
 * rows so the request stays a reasonable size; discloses the cap rather
 * than silently truncating, matching this project's data-integrity
 * convention elsewhere (small-count flags, "showing first N of M" notes).
 */
export function buildExplainPrompt(title: string, csv: string, totalRows: number): string {
  const lines = csv.split("\n");
  const capped = lines.length > EXPLAIN_ROW_CAP + 1 ? [...lines.slice(0, EXPLAIN_ROW_CAP + 1)].join("\n") : csv;
  const truncationNote = totalRows > EXPLAIN_ROW_CAP ? `\n(showing the first ${EXPLAIN_ROW_CAP} of ${totalRows} rows)` : "";
  return `Explain this chart in plain, simple language for someone without a statistics background: "${title}".\n\nHere is the data behind it (CSV):\n${capped}${truncationNote}\n\nCover: what it shows, whether the pattern is meaningful given this dataset's known caveats, and one plain-language takeaway.`;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within a ChatProvider");
  return ctx;
}

/**
 * Owns the "Ask MY-HEO" chat state so both the chat panel itself and any
 * chart's "Explain this" button can drive the same conversation. Grounding
 * (which real data files the assistant sees) is decided server-side in
 * worker/src/pageData.ts, keyed by location.pathname — unchanged from the
 * original ChatPanel-local implementation this was extracted from.
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;
      const next: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
      setMessages(next);
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${CHAT_WORKER_URL}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: next, path: location.pathname }),
        });
        const data = (await res.json()) as { reply?: string; error?: string };
        if (!res.ok || !data.reply) {
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        setMessages([...next, { role: "assistant", content: data.reply }]);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [messages, loading, location.pathname]
  );

  const explain = useCallback(
    (prompt: string) => {
      setOpen(true);
      void send(prompt);
    },
    [send]
  );

  const value: ChatContextValue = {
    open,
    setOpen,
    messages,
    loading,
    error,
    clearError: () => setError(null),
    send,
    explain,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
