import InsufficientData from "./InsufficientData";
import Term from "./Term";
import type { EquityInsight } from "../lib/equityInsight";

export default function EquityInsightCard({
  insight,
  reason,
}: {
  insight: EquityInsight | null;
  reason: string;
}) {
  if (!insight) return <InsufficientData reason={reason} />;
  return (
    <div className="mb-4 rounded-lg border border-line-axis bg-plane p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-series-1">Key Equity Insight</div>
      <p className="mt-1 text-sm text-ink-primary">{insight.headline}</p>
      {insight.detail && (
        <p className="mt-1 text-xs text-ink-muted">
          {insight.detail}
          {insight.headline.includes("×") && (
            <>
              {" · "}
              <Term id="ratio">what does "×" mean?</Term>
            </>
          )}
        </p>
      )}
    </div>
  );
}
