import InsufficientData from "./InsufficientData";
import { computeGroupGapStats, fmt, type Row } from "../lib/equity";

export interface EquityInsight {
  headline: string;
  detail?: string;
}

/**
 * Wraps computeGroupGapStats and formats a plain-language disparity sentence
 * from the already-loaded rows for the page's current filter selection.
 * Returns null (never a fabricated sentence) when there aren't at least two
 * comparable groups reporting real data for the given year/field.
 */
export function buildEquityInsight(opts: {
  rows: Row[] | null;
  year: number | null;
  valueField: string;
  metricLabel: string;
  unit: string;
  higherIsWorse: boolean;
  groupField?: string;
  groupNoun?: string;
  decimals?: number;
}): EquityInsight | null {
  const {
    rows,
    year,
    valueField,
    metricLabel,
    unit,
    higherIsWorse,
    groupField = "state",
    groupNoun = "state",
    decimals = 1,
  } = opts;
  const stats = computeGroupGapStats(rows, year, valueField, higherIsWorse, groupField);
  if (!stats) return null;

  const unitSuffix = unit ? ` ${unit}` : "";
  const worstVal = fmt(stats.worst.value, decimals);
  const bestVal = fmt(stats.best.value, decimals);
  const direction = higherIsWorse ? "higher" : "lower";

  const headline =
    stats.ratio !== null
      ? `${stats.worst.name} has a ${fmt(stats.ratio, 1)}× ${direction} ${metricLabel.toLowerCase()} than ${stats.best.name} (${worstVal}${unitSuffix} vs ${bestVal}${unitSuffix}).`
      : `${stats.worst.name} has a ${metricLabel.toLowerCase()} of ${worstVal}${unitSuffix}, compared with ${bestVal}${unitSuffix} in ${stats.best.name} — the ratio is undefined because the lowest value is 0.`;

  const detail = `${year ?? ""}, ${stats.n} ${groupNoun}s compared.`;
  return { headline, detail };
}

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
      {insight.detail && <p className="mt-1 text-xs text-ink-muted">{insight.detail}</p>}
    </div>
  );
}
