import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";

export default function BarRankingCard({
  title,
  data,
  nameKey,
  valueKey,
  unit,
  height,
  color = "#2a78d6",
  highlightWorst,
}: {
  title?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any[];
  nameKey: string;
  valueKey: string;
  unit?: string;
  height?: number;
  color?: string;
  highlightWorst?: boolean;
}) {
  const sorted = [...data].sort(
    (a, b) => (Number(b[valueKey]) || 0) - (Number(a[valueKey]) || 0)
  );
  const h = height ?? Math.max(180, sorted.length * 26);
  const max = Math.max(...sorted.map((d) => Number(d[valueKey]) || 0), 1);

  return (
    <div className="rounded-lg border border-line-grid bg-surface p-4">
      {title && <h3 className="mb-2 text-sm font-medium text-ink-primary">{title}</h3>}
      <ResponsiveContainer width="100%" height={h}>
        <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="#e1e0d9" horizontal={false} />
          <XAxis type="number" stroke="#898781" tick={{ fontSize: 11, fill: "#52514e" }} tickLine={false} axisLine={false} />
          <YAxis
            type="category"
            dataKey={nameKey}
            stroke="#898781"
            tick={{ fontSize: 12, fill: "#0b0b0b" }}
            tickLine={false}
            axisLine={false}
            width={130}
          />
          <Tooltip
            formatter={(v) => [`${v}${unit ? " " + unit : ""}`, ""]}
            contentStyle={{ fontSize: 12, border: "1px solid #e1e0d9", borderRadius: 6 }}
          />
          <Bar dataKey={valueKey} radius={[0, 4, 4, 0]} maxBarSize={16}>
            {sorted.map((d, i) => (
              <Cell
                key={i}
                fill={
                  highlightWorst && Number(d[valueKey]) === max ? "#d03b3b" : color
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
