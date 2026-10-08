import { useId, type ReactNode } from "react";

/**
 * Gives a chart an accessible name and a plain-text summary. The drawing itself is not readable by a screen
 * reader (it is SVG marks), so it is exposed as one image labelled `label` and described by `summary`; the same
 * numbers are available as a table through the card's "View as table" / "Export CSV" buttons. Keep the summary to
 * what the chart shows (counts, extremes, the headline statistic) - it is read aloud in full.
 */
export default function ChartFigure({ label, summary, children }: { label: string; summary: string; children: ReactNode }) {
  const id = useId();
  return (
    <div role="img" aria-label={label} aria-describedby={`${id}-summary`}>
      {children}
      <p id={`${id}-summary`} className="sr-only">
        {summary}
      </p>
    </div>
  );
}
