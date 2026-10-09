import { useRef, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import ChartToolbar from "./ChartToolbar";
import ChartFigure from "./ChartFigure";
import DataTable, { type Column } from "./DataTable";
import { toCSV, downloadCSV } from "../lib/csv";
import { svgToPngDataUrl, downloadDataUrl } from "../lib/exportChart";
import { useChat, buildExplainPrompt } from "../lib/chatCore";

export interface Series {
  key: string;
  label: string;
  color: string;
}

export default function LineChartCard({
  title,
  data,
  xKey,
  series,
  unit,
  height = 280,
  yDomain,
}: {
  title?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any[];
  xKey: string;
  series: Series[];
  unit?: string;
  height?: number;
  /** Y-axis range; leave unset for the default (starts at zero). For series that vary within a narrow band, e.g. life expectancy. */
  yDomain?: [number | ((dataMin: number) => number), number | ((dataMax: number) => number)];
}) {
  // One sentence per series: first and last real point, plus the low and high - read aloud in place of the drawing.
  const seriesSummary = series
    .map((s) => {
      const pts = data.filter((d) => typeof d[s.key] === "number");
      if (pts.length === 0) return `${s.label}: no data.`;
      const vals = pts.map((d) => d[s.key] as number);
      const first = pts[0];
      const last = pts[pts.length - 1];
      return `${s.label}: ${pts.length} points, from ${first[s.key]} (${first[xKey]}) to ${last[s.key]} (${last[xKey]}), low ${Math.min(...vals)}, high ${Math.max(...vals)}.`;
    })
    .join(" ");
  const summary = `Line chart${unit ? ` in ${unit}` : ""}. ${seriesSummary} Use View as table for every value.`;

  const [showTable, setShowTable] = useState(false);
  const [pngPending, setPngPending] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const { explain } = useChat();

  const tableColumns: Column[] = [
    { key: xKey, label: xKey },
    ...series.map((s) => ({ key: s.key, label: unit ? `${s.label} (${unit})` : s.label, numeric: true })),
  ];

  function handleExportCSV() {
    const csv = toCSV(tableColumns, data as Record<string, unknown>[]);
    downloadCSV(`${(title ?? "chart").replace(/[^a-z0-9]+/gi, "_").toLowerCase()}.csv`, csv);
  }

  function handleExplain() {
    const rows = data as Record<string, unknown>[];
    const csv = toCSV(tableColumns, rows.slice(0, 60));
    explain(buildExplainPrompt(title ?? "this chart", csv, rows.length));
  }

  async function handleExportPNG() {
    const svg = chartRef.current?.querySelector("svg");
    if (!svg) return;
    setPngPending(true);
    try {
      const dataUrl = await svgToPngDataUrl(svg);
      downloadDataUrl(dataUrl, `${(title ?? "chart").replace(/[^a-z0-9]+/gi, "_").toLowerCase()}.png`);
    } catch {
      // See BarRankingCard's handleExportPNG — fail silently, CSV remains available.
    } finally {
      setPngPending(false);
    }
  }

  return (
    <div className="rounded-lg border border-line-grid bg-surface p-4">
      {title && <h3 className="mb-2 text-sm font-medium text-ink-primary">{title}</h3>}
      <ChartToolbar
        showingTable={showTable}
        onToggleTable={() => setShowTable((v) => !v)}
        onExportCSV={handleExportCSV}
        onExportPNG={handleExportPNG}
        onExplain={handleExplain}
        pngPending={pngPending}
      />
      {showTable ? (
        <DataTable columns={tableColumns} rows={data as Record<string, unknown>[]} searchable={false} pageSize={data.length || 1} />
      ) : (
        <div ref={chartRef}>
          <ChartFigure label={title ?? "Line chart"} summary={summary}>
          <ResponsiveContainer width="100%" height={height}>
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
              <CartesianGrid stroke="#e1e0d9" vertical={false} />
              <XAxis dataKey={xKey} stroke="#898781" tick={{ fontSize: 12, fill: "#52514e" }} tickLine={false} />
              <YAxis
                stroke="#898781"
                tick={{ fontSize: 12, fill: "#52514e" }}
                tickLine={false}
                axisLine={false}
                width={48}
                domain={yDomain}
                unit={unit ? ` ${unit}` : undefined}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, border: "1px solid #e1e0d9", borderRadius: 6 }}
                labelStyle={{ color: "#0b0b0b", fontWeight: 600 }}
              />
              {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
              {series.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          </ChartFigure>
        </div>
      )}
    </div>
  );
}
