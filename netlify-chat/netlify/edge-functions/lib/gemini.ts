// gemini-2.0-flash / gemini-2.5-flash are no longer available to new-user
// API keys as of this session. Tried gemini-3.5-flash (non-preview, to
// dodge deprecation risk) but its free-tier quota is
// GenerateRequestsPerDayPerProjectPerModel-FreeTier: 20 requests/day —
// confirmed directly against the live API — which is unusable for a real
// chat feature. Reverted to gemini-3-flash-preview: still "-preview"-
// tagged (real future deprecation risk), but its free-tier daily quota is
// high enough to actually function, and each model has its own separate
// quota bucket so this one wasn't affected by exhausting 3.5-flash's.
//
// Kept in sync verbatim with worker/src/gemini.ts (the Cloudflare version
// of this same backend) — update both if either changes.
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export class GeminiError extends Error {
  constructor(
    public status: number,
    detail: string
  ) {
    super(`Gemini API error ${status}: ${detail}`);
  }
}

/**
 * Calls Gemini's generateContent endpoint. systemPrompt is the static
 * guardrail constant; contextBlock is the per-request, page-specific real
 * data appended after it (kept separate since it varies per turn/page).
 */
export async function callGemini(
  apiKey: string,
  systemPrompt: string,
  contextBlock: string,
  history: ChatMessage[]
): Promise<string> {
  const contents = history.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const body = {
    system_instruction: { parts: [{ text: `${systemPrompt}\n\n${contextBlock}` }] },
    contents,
    // gemini-3-flash-preview is a thinking model — maxOutputTokens counts
    // internal reasoning tokens too. Confirmed live that with no
    // thinkingBudget cap, a plain question spent 731/800 tokens on
    // invisible thinking and got cut off mid-answer (finishReason
    // MAX_TOKENS). thinkingBudget: 0 skips that for this grounded-QA use
    // case (no multi-step reasoning needed), and 1024 leaves headroom for
    // the "explain this chart" exception in the system prompt.
    generationConfig: { temperature: 0.2, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
  };

  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new GeminiError(res.status, detail);
  }

  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new GeminiError(502, "empty response from Gemini");
  return text;
}
