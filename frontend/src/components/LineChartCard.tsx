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
  return (
    <div className="rounded-lg border border-line-grid bg-surface p-4">
      {title && <h3 className="mb-2 text-sm font-medium text-ink-primary">{title}</h3>}
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
  );
}
