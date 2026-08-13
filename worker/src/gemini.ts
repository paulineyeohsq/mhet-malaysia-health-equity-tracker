const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

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
    generationConfig: { temperature: 0.2, maxOutputTokens: 800 },
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
