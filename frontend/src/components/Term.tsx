import { GLOSSARY, type GlossaryTermId } from "../lib/glossary";

/**
 * Inline jargon helper: dotted-underline text with the definition available
 * as a native title tooltip (keyboard-focusable via tabIndex, same "cursor-help"
 * convention StatTile already uses for its small-count caution badge) plus a
 * deep link to the matching entry on the Methodology glossary for anyone who
 * wants the fuller context.
 */
export default function Term({ id, children }: { id: GlossaryTermId; children?: React.ReactNode }) {
  const entry = GLOSSARY[id];
  if (!entry) return <>{children}</>;
  return (
    <a
      href={`#/methodology#glossary-${entry.id}`}
      title={entry.definition}
      aria-label={`${children ?? entry.term}: ${entry.definition}`}
      className="cursor-help underline decoration-dotted decoration-ink-muted underline-offset-2 hover:decoration-series-1"
    >
      {children ?? entry.term}
    </a>
  );
}
