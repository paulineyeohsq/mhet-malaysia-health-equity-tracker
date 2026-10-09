import { useEffect, useState } from "react";

/** One-line disclosure shown next to every AI button / the chat panel. */
export function AiPrivacyNote({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs text-ink-muted ${className}`}>
      Ask a question about the health data. Please do not submit personal or confidential information.
    </p>
  );
}

/**
 * Shown while an AI answer is on its way. Answers usually take around 10 seconds, and longer when the service is
 * busy and the request is being retried automatically, so the text changes as time passes rather than leaving a
 * bare "Thinking…". Mount it only while loading — the timer restarts each time it mounts.
 */
export function AiProgress({ label = "Asking the AI" }: { label?: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const message =
    seconds < 15
      ? `${label}… this usually takes about 10 seconds.`
      : seconds < 40
        ? `${label}… still working — the service may be busy, so this can take a little longer.`
        : `${label}… the service is very busy. It will keep retrying automatically; you can also try again later.`;
  return (
    <p role="status" className="text-sm text-ink-muted">
      {message} <span className="tabular-nums">({seconds}s)</span>
    </p>
  );
}

/** Plain-language AI failure with a retry button. */
export function AiError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-status-critical">
      <span>{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-status-critical px-3 py-1 text-xs font-medium text-status-critical hover:bg-status-critical/10"
        >
          Try again
        </button>
      )}
    </div>
  );
}
