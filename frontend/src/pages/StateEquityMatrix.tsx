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
  Legend,
} from "recharts";
import PageHeader from "../components/PageHeader";
import StatTile from "../components/StatTile";
import SourceNote from "../components/SourceNote";
import InsufficientData from "../components/InsufficientData";
import CorrelationCaveat from "../components/CorrelationCaveat";
import { useData } from "../lib/useData";
import type { Row } from "../lib/equity";
import { findBestYear, buildPairs, computeCorrelationStats, CORRELATION_MIN_PAIRS } from "../lib/correlation";
import { OUTCOME_FIELDS, DETERMINANT_FIELDS, type FieldDef } from "../lib/determinantFields";
import { MALAYSIA_STATES } from "../lib/geoConstants";

/**
 * "Resource" indicators for this page — the subset of DETERMINANT_FIELDS
 * that represent health-system capacity/supply, as opposed to broader
 * socioeconomic determinants (income/poverty/Gini). Kept as a filtered
 * view of the same field list Determinants Explorer already uses, so
 * there is exactly one place each field's file/unit/source is defined.
 */
const RESOURCE_FIELD_IDS = ["beds_det", "staff_det"];
const RESOURCE_FIELDS: FieldDef[] = DETERMINANT_FIELDS.filter((f) => RESOURCE_FIELD_IDS.includes(f.id));
const ALL_RESOURCE_CANDIDATE_FIELDS: FieldDef[] = DETERMINANT_FIELDS; // full list stays selectable for broader "what resource" framing

function fmtVal(v: number | null, decimals = 1): string {
  if (v === null || Number.isNaN(v)) return "—";
  return v.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

export default function StateEquityMatrix() {
  const { data: healthOutcomes } = useData<Row[]>("health_outcomes_state.json");
  const { data: healthcareAccess } = useData<Row[]>("healthcare_access_state.json");
  const { data: socioeconomic } = useData<Row[]>("socioeconomic_state.json");
  const { data: nhmsNcd } = useData<Row[]>("nhms_ncd_state.json");
  const { data: nhmsAdolescentMentalHealth } = useData<Row[]>("nhms_adolescent_mental_health_state.json");

  const rowsByFile: Record<FieldDef["file"], Row[] | null> = useMemo(
    () => ({
      "health_outcomes_state.json": healthOutcomes,
      "healthcare_access_state.json": healthcareAccess,
      "socioeconomic_state.json": socioeconomic,
      "nhms_ncd_state.json": nhmsNcd,
      "nhms_adolescent_mental_health_state.json": nhmsAdolescentMentalHealth,
    }),
    [healthOutcomes, healthcareAccess, socioeconomic, nhmsNcd, nhmsAdolescentMentalHealth]
  );

  const [resourceId, setResourceId] = useState("beds_det");
  const [burdenId, setBurdenId] = useState("cdr");
  const [stateA, setStateA] = useState("Kelantan");
  const [stateB, setStateB] = useState("Selangor");

  const resource = ALL_RESOURCE_CANDIDATE_FIELDS.find((f) => f.id === resourceId)!;
  const burden = OUTCOME_FIELDS.find((f) => f.id === burdenId)!;

  const resourceRows = rowsByFile[resource.file];
  const burdenRows = rowsByFile[burden.file];

  const { year } = useMemo(() => {
    if (!resourceRows || !burdenRows) return { year: null as number | null, n: 0 };
    return findBestYear(resourceRows, burdenRows, resource.field, burden.field);
  }, [resourceRows, burdenRows, resource, burden]);

  const pairs = useMemo(() => {
    if (!resourceRows || !burdenRows || year === null) return [];
    return buildPairs(resourceRows, burdenRows, year, resource.field, burden.field);
  }, [resourceRows, burdenRows, year, resource, burden]);

  const stats = useMemo(() => computeCorrelationStats(pairs), [pairs]);

  const otherPairs = pairs.filter((p) => p.state !== stateA && p.state !== stateB);
  const pairA = pairs.find((p) => p.state === stateA) ?? null;
  const pairB = pairs.find((p) => p.state === stateB) ?? null;

  function predictedAt(x: number): number | null {
    if (!stats) return null;
    return stats.slope * x + stats.intercept;
  }

  function deviationLabel(actual: number, predicted: number): string {
    const diff = actual - predicted;
    if (Math.abs(diff) < 0.01) return "Right on the expected line for its resource level.";
    const worse = burden.higherIsWorse ? diff > 0 : diff < 0;
    return worse
      ? `${fmtVal(Math.abs(diff), 2)} ${burden.unit} worse than expected given its ${resource.label.toLowerCase()} — burden exceeds what this state's resource level would predict.`
      : `${fmtVal(Math.abs(diff), 2)} ${burden.unit} better than expected given its ${resource.label.toLowerCase()} — burden is lower than this state's resource level would predict.`;
  }

  return (
    <div>
      <PageHeader
        title="State Equity Gap Matrix"
        subtitle="Correlation engine: pick a health-resource indicator and a disease-burden indicator, then compare any two states against the 16-state trend to see where resources deviate from burden."
      />
      <div className="space-y-6 p-6 lg:p-10">
        <CorrelationCaveat />

        <div className="flex flex-wrap items-end gap-4 rounded-lg border border-line-grid bg-surface p-4">
          <div>
            <label htmlFor="matrix-resource" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
              Health resource / determinant (x-axis)
            </label>
            <select
              id="matrix-resource"
              value={resourceId}
              onChange={(e) => setResourceId(e.target.value)}
              className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
            >
              <optgroup label="Health-system resources">
                {RESOURCE_FIELDS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Broader socioeconomic determinants">
                {DETERMINANT_FIELDS.filter((f) => !RESOURCE_FIELD_IDS.includes(f.id)).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          <div>
            <label htmlFor="matrix-burden" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
              Disease burden / health outcome (y-axis)
            </label>
            <select
              id="matrix-burden"
              value={burdenId}
              onChange={(e) => setBurdenId(e.target.value)}
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
            <label htmlFor="matrix-state-a" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
              State A
            </label>
            <select
              id="matrix-state-a"
              value={stateA}
              onChange={(e) => setStateA(e.target.value)}
              className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
            >
              {MALAYSIA_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="matrix-state-b" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
              State B
            </label>
            <select
              id="matrix-state-b"
              value={stateB}
              onChange={(e) => setStateB(e.target.value)}
              className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
            >
              {MALAYSIA_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!year || pairs.length < 2 ? (
          <InsufficientData
            reason={
              year
                ? `Only ${pairs.length} state(s) have paired data for "${resource.label}" and "${burden.label}" in ${year} — not enough to plot.`
                : `"${resource.label}" and "${burden.label}" share no common year with paired state-level data.`
            }
          />
        ) : (
          <>
            <div className="rounded-lg border border-line-grid bg-surface p-4">
              <h2 className="mb-2 text-sm font-medium text-ink-primary">
                {resource.label} vs. {burden.label} — {year}
                {!stats && <span className="ml-2 text-xs font-normal text-ink-muted">(trend line needs ≥{CORRELATION_MIN_PAIRS} states; {pairs.length} available)</span>}
              </h2>
              <ResponsiveContainer width="100%" height={380}>
                <ComposedChart margin={{ top: 8, right: 24, bottom: 28, left: 8 }}>
                  <CartesianGrid stroke="#e1e0d9" />
                  <XAxis
                    type="number"
                    dataKey="x"
                    name={resource.label}
                    stroke="#898781"
                    tick={{ fontSize: 11, fill: "#52514e" }}
                    tickLine={false}
                    label={{ value: `${resource.label}${resource.unit ? ` (${resource.unit})` : ""}`, position: "insideBottom", offset: -18, fontSize: 12, fill: "#52514e" }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name={burden.label}
                    stroke="#898781"
                    tick={{ fontSize: 11, fill: "#52514e" }}
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    label={{ value: burden.unit, angle: -90, position: "insideLeft", fontSize: 12, fill: "#52514e" }}
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    contentStyle={{ fontSize: 12, border: "1px solid #e1e0d9", borderRadius: 6 }}
                    formatter={(value, _name, item) => [String(value), item?.payload?.state ?? ""]}
                    labelFormatter={() => ""}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} verticalAlign="top" />
                  <Scatter name="Other states" data={otherPairs} fill="#c9c7bf" />
                  {stats && (
                    <Line
                      name="Linear trend (16 states)"
                      data={stats.regressionLine}
                      dataKey="y"
                      stroke="#898781"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      dot={false}
                      activeDot={false}
                      legendType="none"
                      isAnimationActive={false}
                    />
                  )}
                  {pairA && <Scatter name={stateA} data={[pairA]} fill="#2a78d6" shape="circle" legendType="circle" />}
                  {pairB && <Scatter name={stateB} data={[pairB]} fill="#eb6834" shape="circle" legendType="circle" />}
                </ComposedChart>
              </ResponsiveContainer>
              <p className="mt-2 text-xs text-ink-muted">
                Each grey point is one of the other Malaysian states in {year}; {stateA} is highlighted blue, {stateB}
                orange. The dashed line is a simple linear trend across all states with paired data — descriptive
                only, not predictive or causal.
              </p>
              <SourceNote sourceKey={resource.sourceKey} year={year} />
              <SourceNote sourceKey={burden.sourceKey} year={year} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {[
                { name: stateA, pair: pairA, color: "#2a78d6" },
                { name: stateB, pair: pairB, color: "#eb6834" },
              ].map(({ name, pair, color }) => (
                <div key={name} className="rounded-lg border border-line-grid bg-surface p-4">
                  <h3 className="mb-2 text-sm font-medium" style={{ color }}>
                    {name}
                  </h3>
                  {!pair ? (
                    <InsufficientData reason={`No paired ${resource.label.toLowerCase()} / ${burden.label.toLowerCase()} data for ${name} in ${year}.`} />
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <StatTile label={resource.label} value={fmtVal(pair.x, 1)} unit={resource.unit} />
                        <StatTile label={burden.label} value={fmtVal(pair.y, 1)} unit={burden.unit} />
                      </div>
                      {stats ? (
                        <p className="text-sm text-ink-secondary">
                          {deviationLabel(pair.y, predictedAt(pair.x)!)}
                        </p>
                      ) : (
                        <p className="text-xs text-ink-muted">
                          Fewer than {CORRELATION_MIN_PAIRS} states have paired data this year, so no trend line was
                          fitted — deviation from an expected value cannot be computed, only the raw values above.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
