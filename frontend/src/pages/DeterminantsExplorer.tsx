import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Scatter,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import PageHeader from "../components/PageHeader";
import StatTile from "../components/StatTile";
import SourceNote from "../components/SourceNote";
import InsufficientData from "../components/InsufficientData";
import CorrelationCaveat from "../components/CorrelationCaveat";
import MetadataPanel from "../components/MetadataPanel";
import { useData } from "../lib/useData";
import type { Row } from "../lib/equity";
import { findBestYear, buildPairs, computeCorrelationStats } from "../lib/correlation";
import { OUTCOME_FIELDS, DETERMINANT_FIELDS, type FieldDef } from "../lib/determinantFields";
import { INVENTORY_MAP } from "../lib/inventoryMap";

export default function DeterminantsExplorer() {
  const { data: healthOutcomes } = useData<Row[]>("health_outcomes_state.json");
  const { data: healthcareAccess } = useData<Row[]>("healthcare_access_state.json");
  const { data: socioeconomic } = useData<Row[]>("socioeconomic_state.json");

  const rowsByFile: Record<FieldDef["file"], Row[] | null> = {
    "health_outcomes_state.json": healthOutcomes,
    "healthcare_access_state.json": healthcareAccess,
    "socioeconomic_state.json": socioeconomic,
  };

  const [outcomeId, setOutcomeId] = useState(OUTCOME_FIELDS[0].id);
  const [determinantId, setDeterminantId] = useState(DETERMINANT_FIELDS[1].id);
  const outcome = OUTCOME_FIELDS.find((f) => f.id === outcomeId)!;
  const determinant = DETERMINANT_FIELDS.find((f) => f.id === determinantId)!;

  const outcomeRows = rowsByFile[outcome.file];
  const determinantRows = rowsByFile[determinant.file];

  const correlationInput = useMemo(() => {
    if (!outcomeRows || !determinantRows) return null;
    const { year, n } = findBestYear(determinantRows, outcomeRows, determinant.field, outcome.field);
    if (year === null) return { year, n, pairs: [] as { state: string; x: number; y: number }[] };
    const pairs = buildPairs(determinantRows, outcomeRows, year, determinant.field, outcome.field);
    return { year, n, pairs };
  }, [outcomeRows, determinantRows, outcome.field, determinant.field]);

  const stats = useMemo(() => computeCorrelationStats(correlationInput?.pairs ?? []), [correlationInput]);

  return (
    <div>
      <PageHeader
        title="Determinants Explorer"
        subtitle="WHY might health disparities be occurring? Examine how any health or healthcare-access outcome relates to any potential socioeconomic or healthcare-access determinant, at state level."
      />
      <div className="space-y-8 p-6 lg:p-10">
        <CorrelationCaveat />

        <div className="mb-4 flex flex-wrap items-end gap-4 rounded-lg border border-line-grid bg-surface p-4">
          <div>
            <label htmlFor="det-outcome" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
              Health outcome (y-axis)
            </label>
            <select
              id="det-outcome"
              value={outcomeId}
              onChange={(e) => setOutcomeId(e.target.value)}
              className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
            >
              {OUTCOME_FIELDS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="det-determinant" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
              Potential determinant (x-axis)
            </label>
            <select
              id="det-determinant"
              value={determinantId}
              onChange={(e) => setDeterminantId(e.target.value)}
              className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
            >
              {DETERMINANT_FIELDS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <p className="ml-auto max-w-md text-xs text-ink-muted">
            State-level only (16 states) — health outcomes are not published at district resolution in this
            dataset, so a district-level version of this explorer is not offered.
          </p>
        </div>

        {!correlationInput || correlationInput.year === null || !stats ? (
          <InsufficientData
            reason={
              correlationInput && correlationInput.year !== null
                ? `Only ${correlationInput.n} state(s) have non-null values for both "${determinant.label}" and "${outcome.label}" in ${correlationInput.year} (need at least 8). This outcome or determinant is not reported for enough states.`
                : `"${determinant.label}" and "${outcome.label}" share no common year with paired state-level data.`
            }
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="grid grid-cols-3 gap-3 lg:col-span-1 lg:grid-cols-1">
              <StatTile label="Pearson r" value={stats.pearson.toFixed(3)} sublabel="Linear association" />
              <StatTile label="Spearman ρ" value={stats.spearman.toFixed(3)} sublabel="Rank association" />
              <StatTile label="r²" value={stats.r2.toFixed(3)} sublabel={`n = ${stats.n} states, ${correlationInput.year}`} />
            </div>
            <div className="lg:col-span-2">
              <div className="rounded-lg border border-line-grid bg-surface p-4">
                <h3 className="mb-2 text-sm font-medium text-ink-primary">
                  {determinant.label} vs. {outcome.label} — {correlationInput.year}
                </h3>
                <ResponsiveContainer width="100%" height={320}>
                  <ComposedChart margin={{ top: 8, right: 20, bottom: 24, left: 8 }}>
                    <CartesianGrid stroke="#e1e0d9" />
                    <XAxis
                      type="number"
                      dataKey="x"
                      name={determinant.label}
                      stroke="#898781"
                      tick={{ fontSize: 11, fill: "#52514e" }}
                      tickLine={false}
                      label={{ value: `${determinant.label} (${determinant.unit})`, position: "insideBottom", offset: -16, fontSize: 12, fill: "#52514e" }}
                    />
                    <YAxis
                      type="number"
                      dataKey="y"
                      name={outcome.label}
                      stroke="#898781"
                      tick={{ fontSize: 11, fill: "#52514e" }}
                      tickLine={false}
                      axisLine={false}
                      width={56}
                      label={{ value: outcome.unit, angle: -90, position: "insideLeft", fontSize: 12, fill: "#52514e" }}
                    />
                    <Tooltip
                      cursor={{ strokeDasharray: "3 3" }}
                      contentStyle={{ fontSize: 12, border: "1px solid #e1e0d9", borderRadius: 6 }}
                      formatter={(value, name) => [String(value), String(name)]}
                      labelFormatter={() => ""}
                    />
                    <Scatter name="States" data={correlationInput.pairs} fill="#2a78d6" />
                    <Line
                      name="Linear fit"
                      data={stats.regressionLine}
                      dataKey="y"
                      stroke="#eb6834"
                      strokeWidth={2}
                      dot={false}
                      activeDot={false}
                      legendType="none"
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
                <p className="mt-2 text-xs text-ink-muted">
                  Each point is one Malaysian state in {correlationInput.year}. The orange line is a simple linear
                  regression fit, shown to summarise the linear trend only — it is descriptive, not predictive or
                  causal.
                </p>
              </div>
              <SourceNote sourceKey={determinant.sourceKey} year={correlationInput.year} />
              <SourceNote sourceKey={outcome.sourceKey} year={correlationInput.year} />
            </div>
          </div>
        )}

        <MetadataPanel
          datasetIds={Array.from(new Set([...(INVENTORY_MAP[outcome.file] ?? []), ...(INVENTORY_MAP[determinant.file] ?? [])]))}
        />
      </div>
    </div>
  );
}
