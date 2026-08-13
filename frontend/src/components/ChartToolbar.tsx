/**
 * Small, accessible control row shared by BarRankingCard, LineChartCard and
 * ChoroplethMap: a "View as table" toggle (the chart's underlying data as a
 * real <table>, for screen-reader/keyboard users and anyone who just wants
 * the numbers) plus CSV/PNG export. Any handler left undefined simply omits
 * that button rather than rendering a disabled one.
 */
export default function ChartToolbar({
  showingTable,
  onToggleTable,
  onExportCSV,
  onExportPNG,
  pngPending,
}: {
  showingTable: boolean;
  onToggleTable?: () => void;
  onExportCSV?: () => void;
  onExportPNG?: () => void;
  pngPending?: boolean;
}) {
  if (!onToggleTable && !onExportCSV && !onExportPNG) return null;

  const btnClass =
    "rounded border border-line-axis px-2 py-1 text-xs font-medium text-ink-secondary hover:border-series-1 hover:text-series-1 disabled:opacity-50";

  return (
    <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
      {onToggleTable && (
        <button type="button" onClick={onToggleTable} aria-pressed={showingTable} className={btnClass}>
          {showingTable ? "View as chart" : "View as table"}
        </button>
      )}
      {onExportCSV && (
        <button type="button" onClick={onExportCSV} className={btnClass}>
          Export CSV
        </button>
      )}
      {onExportPNG && (
        <button type="button" onClick={onExportPNG} disabled={pngPending} className={btnClass}>
          {pngPending ? "Exporting…" : "Export PNG"}
        </button>
      )}
    </div>
  );
}
