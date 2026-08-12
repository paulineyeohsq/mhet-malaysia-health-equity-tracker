export default function StatTile({
  label,
  value,
  unit,
  sublabel,
  accent = "series-1",
}: {
  label: string;
  value: string;
  unit?: string;
  sublabel?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-line-grid bg-surface p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1">
        <span className={`text-2xl font-semibold tabular-nums text-ink-primary`}>{value}</span>
        {unit && <span className="text-sm text-ink-secondary">{unit}</span>}
      </div>
      {sublabel && <div className="mt-1 text-xs text-ink-secondary">{sublabel}</div>}
      <span className="sr-only">{accent}</span>
    </div>
  );
}
