import { createContext, useContext, type Dispatch, type SetStateAction } from "react";
import { CHAT_URL } from "./chatConfig";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatContextValue {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  clearError: () => void;
  /** Sends `text` as a user turn through the existing /chat endpoint. */
  send: (text: string) => Promise<void>;
  /** Re-sends the conversation as it stands (after a failed send) without adding a duplicate user turn. */
  retry: () => Promise<void>;
  /** Opens the panel and sends a pre-built prompt — used by chart "Explain this" buttons. */
  explain: (prompt: string) => void;
  /**
   * One-off call to the same /chat endpoint that returns the reply text
   * directly to the caller instead of opening the panel or touching the
   * shared `messages`/`open` state — for callers that want to render the
   * AI's answer inline in their own card (e.g. Research Opportunities'
   * suggestion cards) rather than in the global chat panel. Throws on
   * failure; callers own their own loading/error state.
   *
   * The backend attaches the current page's data files to ordinary chat turns. askDirect
   * callers (the Research Opportunities cards) put all the data they need in the prompt
   * itself, so by default this opts out of that ("context: none") — it saves a large
   * share of the Gemini quota. Pass { pageContext: true } to keep the page data attached.
   */
  askDirect: (prompt: string, options?: { pageContext?: boolean }) => Promise<string>;
}

const EXPLAIN_ROW_CAP = 60;

/** An AI-request failure whose `message` is already written for end users (no "Failed to fetch"/"HTTP 500"). */
export class ChatError extends Error {
  code?: string;
  status?: number;
  constructor(message: string, code?: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function friendlyStatusMessage(status: number): string {
  if (status === 429 || status === 503) return "The AI service is busy right now. Please try again in a moment.";
  if (status >= 500) return "The AI service had a problem. Please try again in a moment.";
  return "The AI service couldn't process that request. Please try again.";
}

/** Turns anything thrown by an AI call into a sentence safe to show users. */
export function aiErrorMessage(e: unknown): string {
  if (e instanceof ChatError) return e.message;
  return "Something went wrong while contacting the AI service. Please try again.";
}

export async function postChat(body: unknown): Promise<{ reply: string }> {
  let res: Response;
  try {
    res = await fetch(`${CHAT_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ChatError("Couldn't reach the AI service. Check your internet connection and try again.", "network");
  }
  let data: { reply?: string; error?: string; code?: string } = {};
  try {
    data = await res.json();
  } catch {
    /* non-JSON error page — handled below */
  }
  if (res.ok && data.reply) return { reply: data.reply };
  throw new ChatError(data.error ?? friendlyStatusMessage(res.status), data.code, res.status);
}

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

export const ChatContext = createContext<ChatContextValue | null>(null);

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within a ChatProvider");
  return ctx;
}
