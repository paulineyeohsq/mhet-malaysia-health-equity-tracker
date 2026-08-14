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
import DataTable, { toCSV, downloadCSV, type Column } from "./DataTable";
import { svgToPngDataUrl, downloadDataUrl } from "../lib/exportChart";
import { useChat, buildExplainPrompt } from "../lib/chatContext";

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
}: {
  title?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any[];
  xKey: string;
  series: Series[];
  unit?: string;
  height?: number;
}) {
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
        </div>
      )}
    </div>
  );
}
