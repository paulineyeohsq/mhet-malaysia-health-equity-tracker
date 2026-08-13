import { useState } from "react";
import { useLocation } from "react-router-dom";
import { CHAT_WORKER_URL } from "../lib/chatConfig";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Floating chat toggle + right-side drawer. Calls the chat-proxy Worker
 * (see /worker), which grounds answers in the real data relevant to
 * whatever page the user is currently on (location.pathname).
 */
export default function ChatPanel() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
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
  }

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Close MY-HEO Assistant" : "Open MY-HEO Assistant"}
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-series-1 text-white shadow-lg transition-transform hover:scale-105"
      >
        {open ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
            />
          </svg>
        )}
      </button>

      <aside
        aria-hidden={!open}
        className={`fixed top-0 right-0 z-50 flex h-full w-[400px] max-w-[90vw] flex-col border-l border-line-grid bg-surface shadow-xl transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="border-b border-line-grid p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-primary">MY-HEO Assistant</h2>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="text-ink-muted hover:text-ink-primary"
            >
              ✕
            </button>
          </div>
          <p className="mt-1.5 text-xs text-ink-muted">
            AI-generated answers grounded in this dashboard's published DOSM/MOH data. Always verify against the
            cited source — not for clinical or individual-level decisions.
          </p>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 && (
            <p className="text-sm text-ink-secondary">
              Ask a question about the data on this page — e.g. "Which state has the lowest median income?"
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                  m.role === "user" ? "bg-seq-100 text-ink-primary" : "border border-line-grid bg-plane text-ink-primary"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-lg border border-line-grid bg-plane px-3 py-2 text-sm text-ink-muted">
                Thinking…
              </div>
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-status-critical bg-status-critical/10 px-3 py-2 text-sm text-status-critical">
              {error}
              <button type="button" onClick={() => setError(null)} className="ml-2 underline">
                Dismiss
              </button>
            </div>
          )}
        </div>

        <div className="border-t border-line-grid p-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
              disabled={loading}
              placeholder="Ask a question…"
              className="flex-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={send}
              disabled={loading || !input.trim()}
              className="rounded-md bg-series-1 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
