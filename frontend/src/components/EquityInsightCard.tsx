import InsufficientData from "./InsufficientData";
import Term from "./Term";
import type { EquityInsight } from "../lib/equityInsight";
import { isStaleYear, latestYearIn } from "../lib/dataAge";

export default function EquityInsightCard({
  insight,
  reason,
}: {
  insight: EquityInsight | null;
  reason: string;
}) {
  if (!insight) return <InsufficientData reason={reason} />;
  const year = latestYearIn(insight.detail);
  return (
    <div className="mb-4 rounded-lg border border-line-axis bg-plane p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-series-1">
        <span>Key Equity Insight</span>
        {isStaleYear(year) && (
          <span
            title={`This comparison uses ${year} data, more than 3 years old.`}
            className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] normal-case tracking-normal text-amber-900"
          >
            {year} data
          </span>
        )}
      </div>
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
