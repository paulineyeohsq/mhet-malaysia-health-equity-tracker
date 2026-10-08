// Model history (why this is a chain, not one model):
//   - gemini-2.0-flash / gemini-2.5-flash(-lite) are no longer available to new-user API
//     keys (404 "no longer available to new users").
//   - gemini-3.5-flash (non-preview) has a free-tier quota of only 20 requests/day
//     (GenerateRequestsPerDayPerProjectPerModel-FreeTier, confirmed against the live API) —
//     unusable as the primary, but fine as a last resort.
//   - gemini-3-flash-preview has a workable free quota, but is "-preview"-tagged (future
//     deprecation risk) and, on its own, was a single point of failure: once its daily or
//     per-minute quota was spent every chat/AI feature on the site returned "busy".
// Each model has its own separate quota bucket, so trying the next one when the first is
// exhausted gives real extra capacity. Order = preference. gemini-3.1-flash-lite is
// generally available (not a preview), so it also covers the preview model being retired.
// All three accept the generationConfig below (verified live).
const MODELS = ["gemini-3-flash-preview", "gemini-3.1-flash-lite", "gemini-3.5-flash"];

const geminiUrl = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

/** HTTP statuses where a different model can plausibly succeed: 404 = model not available to
 * this key, 429 = quota/rate limit, 500/503 = overloaded or unavailable. Anything else (400 bad
 * request, 401/403 bad key) would fail identically on every model, so it is thrown immediately. */
const FALLBACK_STATUSES = new Set([404, 429, 500, 503]);

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
 * Calls Gemini's generateContent endpoint, falling back through MODELS when one is out of
 * quota or unavailable. Returns the reply text and which model produced it. systemPrompt is
 * the static guardrail constant; contextBlock is the per-request, page-specific real data
 * appended after it (kept separate since it varies per turn/page).
 *
 * If every model fails with a quota/overload status, throws GeminiError(429) so the caller
 * reports "busy"; otherwise throws the last error seen.
 */
export async function callGemini(
  apiKey: string,
  systemPrompt: string,
  contextBlock: string,
  history: ChatMessage[]
): Promise<{ text: string; model: string }> {
  const contents = history.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const body = JSON.stringify({
    system_instruction: { parts: [{ text: `${systemPrompt}\n\n${contextBlock}` }] },
    contents,
    // These are thinking models — maxOutputTokens counts internal reasoning tokens too.
    // Confirmed live that with no thinkingBudget cap, a plain question spent 731/800 tokens
    // on invisible thinking and got cut off mid-answer (finishReason MAX_TOKENS).
    // thinkingBudget: 0 skips that for this grounded-QA use case (no multi-step reasoning
    // needed), and 1024 leaves headroom for the "explain this chart" exception in the
    // system prompt.
    generationConfig: { temperature: 0.2, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
  });

  let sawBusy = false;
  let lastError: GeminiError | null = null;

  for (const model of MODELS) {
    let res: Response;
    try {
      res = await fetch(geminiUrl(model), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body,
      });
    } catch (e) {
      lastError = new GeminiError(502, `network error calling ${model}: ${String(e)}`);
      continue;
    }

    if (res.ok) {
      const json = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) return { text, model };
      lastError = new GeminiError(502, `empty response from ${model}`);
      continue;
    }

    const detail = await res.text().catch(() => "");
    const err = new GeminiError(res.status, detail);
    if (!FALLBACK_STATUSES.has(res.status)) throw err;
    if (res.status === 429 || res.status === 503) sawBusy = true;
    lastError = err;
  }

  throw sawBusy ? new GeminiError(429, "every model is rate-limited or overloaded") : (lastError as GeminiError);
}
