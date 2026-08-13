import { useNavigate } from "react-router-dom";
import { ASK_MHET_QUESTIONS } from "../lib/askMhetQuestions";

/**
 * A curated shortcut list, not a chat/free-text search — selecting a
 * question navigates to the relevant page with a real filter pre-applied.
 */
export default function AskMhet() {
  const navigate = useNavigate();

  return (
    <div className="flex items-center gap-2 border-b border-line-grid bg-surface px-4 py-2 lg:px-6">
      <label htmlFor="ask-mhet" className="text-xs font-medium uppercase tracking-wide text-ink-muted">
        Ask MY-HEO
      </label>
      <select
        id="ask-mhet"
        defaultValue=""
        onChange={(e) => {
          const q = ASK_MHET_QUESTIONS.find((q) => q.id === e.target.value);
          if (q) navigate(q.path, { state: q.state });
          e.target.value = "";
        }}
        className="max-w-md flex-1 rounded-md border border-line-axis px-2 py-1.5 text-sm sm:max-w-sm"
      >
        <option value="" disabled>
          Choose a question to jump to the relevant view…
        </option>
        {ASK_MHET_QUESTIONS.map((q) => (
          <option key={q.id} value={q.id}>
            {q.question}
          </option>
        ))}
      </select>
    </div>
  );
}
