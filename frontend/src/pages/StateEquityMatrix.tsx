import { useEffect, useMemo, useState } from "react";
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
import ChartToolbar from "../components/ChartToolbar";
import { toCSV, type Column } from "../components/DataTable";
import { useData } from "../lib/useData";
import type { Row } from "../lib/equity";
import { findBestYear, buildPairs, buildPooledPairs, findYearsWithPairs, computeCorrelationStats, CORRELATION_MIN_PAIRS, type CorrelationPair } from "../lib/correlation";
import { OUTCOME_FIELDS, DETERMINANT_FIELDS, rowsForField, type FieldDef } from "../lib/determinantFields";
import { MALAYSIA_STATES } from "../lib/geoConstants";
import { useChat, buildExplainPrompt } from "../lib/chatContext";
import MetadataPanel from "../components/MetadataPanel";
import { INVENTORY_MAP } from "../lib/inventoryMap";
import { isSmallCount, SMALL_COUNT_CAUTION_TEXT } from "../lib/reliability";

/** Which OUTCOME_FIELDS ids are built from small administrative event counts
 * (deaths/births), and the underlying row field carrying that raw count —
 * same abs-count fields HealthOutcomes.tsx already flags, reused here so
 * this page's per-state comparison tiles carry the same small-count caution. */
const OUTCOME_ABS_FIELD: Record<string, string> = {
  cdr: "deaths_abs",
  mmr: "maternal_deaths_abs",
  imr: "infant_deaths_abs",
  u5mr: "under5_deaths_abs",
  cbr: "births_abs",
};

type MatrixPair = CorrelationPair & { year?: number };

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
  const { explain } = useChat();
  const { data: healthOutcomes } = useData<Row[]>("health_outcomes_state.json");
  const { data: healthcareAccess } = useData<Row[]>("healthcare_access_state.json");
  const { data: socioeconomic } = useData<Row[]>("socioeconomic_state.json");
  const { data: nhmsNcd } = useData<Row[]>("nhms_ncd_state.json");
  const { data: nhmsAdolescentMentalHealth } = useData<Row[]>("nhms_adolescent_mental_health_state.json");
  const { data: sanitation } = useData<Row[]>("sanitation_access_state.json");
  const { data: water } = useData<Row[]>("water_access_state.json");
  const { data: marriages } = useData<Row[]>("marriages_state.json");
  const { data: fertility } = useData<Row[]>("fertility_state.json");
  const { data: healthProgrammes } = useData<Row[]>("health_programmes_state.json");
  const { data: forestReserve } = useData<Row[]>("forest_reserve_state.json");
  const { data: waterConsumption } = useData<Row[]>("water_consumption_state.json");
  const { data: waterProduction } = useData<Row[]>("water_production_state.json");

  const rowsByFile: Record<FieldDef["file"], Row[] | null> = useMemo(
    () => ({
      "health_outcomes_state.json": healthOutcomes,
      "healthcare_access_state.json": healthcareAccess,
      "socioeconomic_state.json": socioeconomic,
      "nhms_ncd_state.json": nhmsNcd,
      "nhms_adolescent_mental_health_state.json": nhmsAdolescentMentalHealth,
      "sanitation_access_state.json": sanitation,
      "water_access_state.json": water,
      "marriages_state.json": marriages,
      "fertility_state.json": fertility,
      "health_programmes_state.json": healthProgrammes,
      "forest_reserve_state.json": forestReserve,
      "water_consumption_state.json": waterConsumption,
      "water_production_state.json": waterProduction,
    }),
    [
      healthOutcomes, healthcareAccess, socioeconomic, nhmsNcd, nhmsAdolescentMentalHealth, sanitation, water,
      marriages, fertility, healthProgrammes, forestReserve, waterConsumption, waterProduction,
    ]
  );

  const [resourceId, setResourceId] = useState("beds_det");
  const [burdenId, setBurdenId] = useState("cdr");
  const [stateA, setStateA] = useState("Kelantan");
  const [stateB, setStateB] = useState("Selangor");
  const [yearMode, setYearMode] = useState<string>("auto");

  const resource = ALL_RESOURCE_CANDIDATE_FIELDS.find((f) => f.id === resourceId)!;
  const burden = OUTCOME_FIELDS.find((f) => f.id === burdenId)!;

  const resourceRows = rowsForField(rowsByFile[resource.file], resource);
  const burdenRows = rowsForField(rowsByFile[burden.file], burden);

  // Whether each resource option could ever produce a chart against the
  // currently selected burden — viable if EITHER the best single year, OR
  // pooling across all years, reaches the minimum pair count. Mirrors
  // Determinants Explorer's determinantViability pattern.
  const resourceViability = useMemo(() => {
    const result: Record<string, boolean> = {};
    if (!burdenRows) return result;
    for (const res of ALL_RESOURCE_CANDIDATE_FIELDS) {
      const rRows = rowsForField(rowsByFile[res.file], res);
      if (!rRows) {
        result[res.id] = true; // still loading
        continue;
      }
      const { n } = findBestYear(rRows, burdenRows, res.field, burden.field);
      const pooledN = buildPooledPairs(rRows, burdenRows, res.field, burden.field).length;
      result[res.id] = n >= CORRELATION_MIN_PAIRS || pooledN >= CORRELATION_MIN_PAIRS;
    }
    return result;
  }, [burden, burdenRows, rowsByFile]);

  useEffect(() => {
    if (resourceViability[resourceId] === false) {
      const firstViable = ALL_RESOURCE_CANDIDATE_FIELDS.find((f) => resourceViability[f.id] !== false);
      if (firstViable) setResourceId(firstViable.id);
    }
  }, [resourceViability, resourceId]);

  const availableYears = useMemo(() => {
    if (!resourceRows || !burdenRows) return [];
    return findYearsWithPairs(resourceRows, burdenRows, resource.field, burden.field);
  }, [resourceRows, burdenRows, resource.field, burden.field]);

  useEffect(() => {
    if (yearMode === "auto" || yearMode === "pooled") return;
    if (!availableYears.some((y) => String(y.year) === yearMode)) setYearMode("auto");
  }, [availableYears, yearMode]);

  const isPooled = yearMode === "pooled";
  const fixedYear = yearMode !== "auto" && yearMode !== "pooled" ? Number(yearMode) : null;

  const { year, pairs } = useMemo(() => {
    if (!resourceRows || !burdenRows) return { year: null as number | null, pairs: [] as MatrixPair[] };
    if (isPooled) {
      return { year: null as number | null, pairs: buildPooledPairs(resourceRows, burdenRows, resource.field, burden.field) };
    }
    if (fixedYear !== null) {
      return { year: fixedYear, pairs: buildPairs(resourceRows, burdenRows, fixedYear, resource.field, burden.field) };
    }
    const best = findBestYear(resourceRows, burdenRows, resource.field, burden.field);
    if (best.year === null) return { year: null as number | null, pairs: [] as MatrixPair[] };
    return { year: best.year, pairs: buildPairs(resourceRows, burdenRows, best.year, resource.field, burden.field) };
  }, [resourceRows, burdenRows, resource.field, burden.field, isPooled, fixedYear]);

  const yearLabel = isPooled ? "pooled, all years" : String(year ?? "");

  const stats = useMemo(() => computeCorrelationStats(pairs), [pairs]);

  // States actually present in the resolved pairs for the current mode —
  // used to grey out State A/B options that would otherwise look pickable
  // but resolve to nothing.
  const statesWithData = useMemo(() => new Set(pairs.map((p) => p.state)), [pairs]);

  useEffect(() => {
    if (statesWithData.size === 0) return;
    if (!statesWithData.has(stateA)) {
      const fallback = MALAYSIA_STATES.find((s) => statesWithData.has(s));
      if (fallback) setStateA(fallback);
    }
    if (!statesWithData.has(stateB)) {
      const fallback = MALAYSIA_STATES.find((s) => statesWithData.has(s) && s !== stateA);
      if (fallback) setStateB(fallback);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statesWithData]);

  const otherPairs = pairs.filter((p) => p.state !== stateA && p.state !== stateB);
  const pairsForA = pairs.filter((p) => p.state === stateA);
  const pairsForB = pairs.filter((p) => p.state === stateB);
  // The single most-recent point per state, used for the deviation panel —
  // in pooled mode a state can have several points (one per year); the
  // panel shows the latest one rather than trying to average across years.
  const representative = (statePairs: MatrixPair[]) =>
    statePairs.length === 0 ? null : statePairs.reduce((latest, p) => ((p.year ?? 0) >= (latest.year ?? 0) ? p : latest), statePairs[0]);
  const pairA = representative(pairsForA);
  const pairB = representative(pairsForB);

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
        <MetadataPanel
          datasetIds={Array.from(
            new Set(
              [...ALL_RESOURCE_CANDIDATE_FIELDS, ...OUTCOME_FIELDS].flatMap((f) => INVENTORY_MAP[f.file] ?? [])
            )
          )}
        />

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
                {RESOURCE_FIELDS.map((f) => {
                  const viable = resourceViability[f.id] ?? true;
                  return (
                    <option
                      key={f.id}
                      value={f.id}
                      disabled={!viable}
                      title={viable ? undefined : `${f.label} and ${burden.label} never share enough paired state data, in any year or pooled — no correlation is possible for this pair.`}
                    >
                      {f.label}
                      {!viable ? " (no usable data with this burden)" : ""}
                    </option>
                  );
                })}
              </optgroup>
              <optgroup label="Broader socioeconomic determinants">
                {DETERMINANT_FIELDS.filter((f) => !RESOURCE_FIELD_IDS.includes(f.id)).map((f) => {
                  const viable = resourceViability[f.id] ?? true;
                  return (
                    <option
                      key={f.id}
                      value={f.id}
                      disabled={!viable}
                      title={viable ? undefined : `${f.label} and ${burden.label} never share enough paired state data, in any year or pooled — no correlation is possible for this pair.`}
                    >
                      {f.label}
                      {!viable ? " (no usable data with this burden)" : ""}
                    </option>
                  );
                })}
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
            <label htmlFor="matrix-year" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
              Year
            </label>
            <select
              id="matrix-year"
              value={yearMode}
              onChange={(e) => setYearMode(e.target.value)}
              className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
            >
              <option value="auto">Auto (best year)</option>
              <option value="pooled">Combine all years (pooled)</option>
              {availableYears.map((y) => (
                <option key={y.year} value={String(y.year)}>
                  {y.year} ({y.n} states)
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
              {MALAYSIA_STATES.map((s) => {
                const has = statesWithData.size === 0 || statesWithData.has(s);
                return (
                  <option key={s} value={s} disabled={!has} title={has ? undefined : `No ${resource.label.toLowerCase()} / ${burden.label.toLowerCase()} data for ${s} in this year mode.`}>
                    {s}
                    {!has ? " (no data)" : ""}
                  </option>
                );
              })}
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
              {MALAYSIA_STATES.map((s) => {
                const has = statesWithData.size === 0 || statesWithData.has(s);
                return (
                  <option key={s} value={s} disabled={!has} title={has ? undefined : `No ${resource.label.toLowerCase()} / ${burden.label.toLowerCase()} data for ${s} in this year mode.`}>
                    {s}
                    {!has ? " (no data)" : ""}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {isPooled && (
          <div className="rounded-lg border border-line-axis bg-plane p-3 text-xs text-ink-secondary">
            <strong className="text-ink-primary">Pooled across years.</strong> The scatter plots every state×year
            point with real data for both fields — a state can appear more than once. The deviation panels below
            use each state's most recent available point, not an average across years.
          </div>
        )}

        {pairs.length < 2 ? (
          <InsufficientData
            reason={
              isPooled
                ? `Only ${pairs.length} pooled state-year point(s) for "${resource.label}" and "${burden.label}" — not enough to plot.`
                : year
                  ? `Only ${pairs.length} state(s) have paired data for "${resource.label}" and "${burden.label}" in ${year} — not enough to plot.`
                  : `"${resource.label}" and "${burden.label}" share no common year with paired state-level data for the selected year mode.`
            }
          />
        ) : (
          <>
            <div className="rounded-lg border border-line-grid bg-surface p-4">
              <h2 className="mb-2 text-sm font-medium text-ink-primary">
                {resource.label} vs. {burden.label} — {yearLabel}
                {!stats && <span className="ml-2 text-xs font-normal text-ink-muted">(trend line needs ≥{CORRELATION_MIN_PAIRS} points; {pairs.length} available)</span>}
              </h2>
              <ChartToolbar
                showingTable={false}
                onExplain={() => {
                  const cols: Column[] = [
                    { key: "state", label: "State" },
                    { key: "x", label: resource.label, numeric: true },
                    { key: "y", label: burden.label, numeric: true },
                  ];
                  const csv = toCSV(cols, pairs.slice(0, 60) as unknown as Record<string, unknown>[]);
                  explain(buildExplainPrompt(`${resource.label} vs. ${burden.label} — ${yearLabel}`, csv, pairs.length));
                }}
              />
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
                    labelFormatter={(_label, payload) => {
                      const p = payload?.[0]?.payload as MatrixPair | undefined;
                      return p && isPooled && p.year !== undefined ? `${p.year}` : "";
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} verticalAlign="top" />
                  <Scatter name="Other states" data={otherPairs} fill="#c9c7bf" />
                  {stats && (
                    <Line
                      name="Linear trend"
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
                  {pairsForA.length > 0 && <Scatter name={stateA} data={pairsForA} fill="#3a7173" shape="circle" legendType="circle" />}
                  {pairsForB.length > 0 && <Scatter name={stateB} data={pairsForB} fill="#eb6834" shape="circle" legendType="circle" />}
                </ComposedChart>
              </ResponsiveContainer>
              <p className="mt-2 text-xs text-ink-muted">
                {isPooled
                  ? `Each grey point is one of the other Malaysian states in one year; ${stateA} is highlighted blue, ${stateB} orange — each may appear more than once (one point per year it has data).`
                  : `Each grey point is one of the other Malaysian states in ${yearLabel}; ${stateA} is highlighted blue, ${stateB} orange.`}{" "}
                The dashed line is a simple linear trend across all points with paired data — descriptive only, not
                predictive or causal.
              </p>
              <SourceNote sourceKey={resource.sourceKey} year={yearLabel} />
              <SourceNote sourceKey={burden.sourceKey} year={yearLabel} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              {[
                { name: stateA, pair: pairA, color: "#3a7173" },
                { name: stateB, pair: pairB, color: "#eb6834" },
              ].map(({ name, pair, color }) => (
                <div key={name} className="rounded-lg border border-line-grid bg-surface p-4">
                  <h3 className="mb-2 text-sm font-medium" style={{ color }}>
                    {name}
                    {isPooled && pair?.year !== undefined ? ` — ${pair.year} (most recent available)` : ""}
                  </h3>
                  {!pair ? (
                    <InsufficientData reason={`No paired ${resource.label.toLowerCase()} / ${burden.label.toLowerCase()} data for ${name}${isPooled ? "" : ` in ${yearLabel}`}.`} />
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <StatTile label={resource.label} value={fmtVal(pair.x, 1)} unit={resource.unit} />
                        <StatTile
                          label={burden.label}
                          value={fmtVal(pair.y, 1)}
                          unit={burden.unit}
                          caution={(() => {
                            const absFieldName = OUTCOME_ABS_FIELD[burden.id];
                            if (!absFieldName || !burdenRows) return undefined;
                            const yr = pair.year ?? fixedYear;
                            const row = burdenRows.find((r) => r.state === name && r.year === yr);
                            return isSmallCount(row?.[absFieldName] as number | null | undefined)
                              ? SMALL_COUNT_CAUTION_TEXT
                              : undefined;
                          })()}
                        />
                      </div>
                      {stats ? (
                        <p className="text-sm text-ink-secondary">
                          {deviationLabel(pair.y, predictedAt(pair.x)!)}
                        </p>
                      ) : (
                        <p className="text-xs text-ink-muted">
                          Fewer than {CORRELATION_MIN_PAIRS} points have paired data, so no trend line was fitted —
                          deviation from an expected value cannot be computed, only the raw values above.
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
