import { useEffect, useRef, useState } from "react";
import { useChat } from "../lib/chatCore";
import MarkdownLite from "./MarkdownLite";
import { AiError, AiPrivacyNote, AiProgress } from "./AiStatus";

const CHAT_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
    />
  </svg>
);

/**
 * Opens and closes the assistant. It lives in the navigation (the sidebar on desktop, the top bar on phones) instead of
 * floating over the page, where a round button in the corner sat on top of table pagination, chart toolbars and whatever
 * was at the bottom of the screen.
 */
export function ChatLauncher({ variant }: { variant: "sidebar" | "bar" }) {
  const { open, setOpen } = useChat();
  const label = open ? "Close MY-HEO Assistant" : "Open MY-HEO Assistant";
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={open}
      aria-controls="chat-drawer"
      onClick={() => setOpen((v) => !v)}
      className={
        variant === "sidebar"
          ? "flex w-full items-center gap-2 rounded-md bg-series-1 px-3 py-2 text-sm font-medium text-white hover:opacity-90"
          : "flex h-10 items-center gap-2 rounded-md bg-series-1 px-3 text-sm font-medium text-white hover:opacity-90"
      }
    >
      {CHAT_ICON}
      {variant === "sidebar" ? (open ? "Close MY-HEO Assistant" : "Open MY-HEO Assistant") : "Assistant"}
    </button>
  );
}

/**
 * The assistant's right-hand drawer. State/networking lives in ChatProvider (see lib/chatContext.tsx) so other
 * components - e.g. a chart's "Explain this" button - can drive the same conversation; this component is
 * presentation only. On wide screens (xl and up) the page makes room for it (see Layout); on narrower ones it slides
 * over the page with a dimmed backdrop that closes it.
 */
export default function ChatPanel() {
  const { open, setOpen, messages, loading, error, clearError, send, retry } = useChat();
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);

  // Move focus into the drawer when it opens and back to whatever opened it when it closes; Escape closes it.
  useEffect(() => {
    if (open) {
      opener.current = document.activeElement as HTMLElement | null;
      inputRef.current?.focus();
    } else if (wasOpen.current) {
      opener.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  function handleSend() {
    if (!input.trim() || loading) return;
    void send(input);
    setInput("");
  }

  return (
    <>
      {open && (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Close the assistant"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[45] cursor-default bg-black/30 xl:hidden"
        />
      )}

      <aside
        id="chat-drawer"
        aria-label="MY-HEO Assistant"
        aria-hidden={!open}
        // inert takes the closed drawer out of the tab order and the accessibility tree; aria-hidden alone left
        // its buttons and input focusable while invisible.
        inert={!open}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className={`fixed top-0 right-0 z-50 flex h-full w-[380px] max-w-[92vw] flex-col border-l border-line-grid bg-surface shadow-xl transition-transform duration-200 ${
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
          <AiPrivacyNote className="mt-1.5" />
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
                {m.role === "assistant" ? <MarkdownLite text={m.content} /> : m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-lg border border-line-grid bg-plane px-3 py-2">
                <AiProgress label="Thinking" />
              </div>
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-status-critical bg-status-critical/10 px-3 py-2">
              <AiError message={error} onRetry={() => void retry()} />
              <button type="button" onClick={clearError} className="mt-1 text-xs text-status-critical underline">
                Dismiss
              </button>
            </div>
          )}
        </div>

        <div className="border-t border-line-grid p-3">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              aria-label="Your question"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSend();
              }}
              disabled={loading}
              placeholder="Ask a question…"
              className="flex-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={handleSend}
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
