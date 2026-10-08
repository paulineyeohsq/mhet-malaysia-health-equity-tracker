import { isStaleYear, latestYearIn } from "../lib/dataAge";

export default function StatTile({
  label,
  value,
  unit,
  sublabel,
  accent = "series-1",
  caution,
  year,
}: {
  label: string;
  value: string;
  unit?: string;
  sublabel?: string;
  accent?: string;
  /** When set, renders a small ⚠ badge with this text as the tooltip/accessible
   * description — used for small-underlying-count caution, not a computed CI. */
  caution?: string;
  /** Year the figure refers to. When omitted, the latest year mentioned in `sublabel` is used. A figure more than
   * three years old gets a prominent badge so it is never mistaken for current. */
  year?: number | null;
}) {
  const shownYear = year ?? latestYearIn(sublabel);
  const stale = isStaleYear(shownYear);
  return (
    <div className="rounded-lg border border-line-grid bg-surface p-4">
      <div className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-ink-muted">
        <span>{label}</span>
        {caution && (
          <span title={caution} aria-label={caution} className="cursor-help text-amber-600">
            ⚠
          </span>
        )}
        {stale && (
          <span
            title={`This figure is from ${shownYear}, more than 3 years ago.`}
            className="ml-auto shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold normal-case tracking-normal text-amber-900"
          >
            {shownYear} data
          </span>
        )}
      </div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className={`text-2xl font-semibold tabular-nums text-ink-primary`}>{value}</span>
        {unit && <span className="text-sm text-ink-secondary">{unit}</span>}
      </div>
      {sublabel && <div className="mt-1 text-xs text-ink-secondary">{sublabel}</div>}
      <span className="sr-only">{accent}</span>
    </div>
  );
}
