import StatTile from "./StatTile";

export interface KPIItem {
  label: string;
  value: string;
  unit?: string;
  sublabel?: string;
}

const GRID_COLS: Record<2 | 3 | 4 | 5, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
  5: "sm:grid-cols-3 lg:grid-cols-5",
};

/**
 * Reusable KPI-tile grid — wraps StatTile so pages don't each repeat the
 * same grid markup. Purely a layout wrapper; StatTile itself is unchanged.
 */
export default function KPISummarySection({
  title,
  headingId,
  items,
  columns = 4,
}: {
  title?: string;
  headingId?: string;
  items: KPIItem[];
  columns?: 2 | 3 | 4 | 5;
}) {
  return (
    <section aria-labelledby={title ? headingId : undefined}>
      {title && (
        <h2 id={headingId} className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
          {title}
        </h2>
      )}
      <div className={`grid grid-cols-2 gap-3 ${GRID_COLS[columns]}`}>
        {items.map((item, i) => (
          <StatTile key={i} label={item.label} value={item.value} unit={item.unit} sublabel={item.sublabel} />
        ))}
      </div>
    </section>
  );
}
