import { useEffect, useMemo, useRef, useState } from "react";
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
import CorrelationCaveat, { CORRELATION_CAVEAT_TEXT } from "../components/CorrelationCaveat";
import EvidenceSnapshotButton from "../components/EvidenceSnapshotButton";
import MetadataPanel from "../components/MetadataPanel";
import ChartToolbar from "../components/ChartToolbar";
import DataTable, { toCSV, downloadCSV, type Column } from "../components/DataTable";
import { useData } from "../lib/useData";
import type { Row } from "../lib/equity";
import { findBestYear, buildPairs, buildPooledPairs, findYearsWithPairs, computeCorrelationStats, interpretCorrelation, CORRELATION_MIN_PAIRS } from "../lib/correlation";
import { svgToPngDataUrl, downloadDataUrl } from "../lib/exportChart";
import { OUTCOME_FIELDS, DETERMINANT_FIELDS, rowsForField, type FieldDef } from "../lib/determinantFields";
import { INVENTORY_MAP } from "../lib/inventoryMap";

export default function DeterminantsExplorer() {
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
    }),
    [healthOutcomes, healthcareAccess, socioeconomic, nhmsNcd, nhmsAdolescentMentalHealth, sanitation, water, marriages, fertility, healthProgrammes]
  );

  const [outcomeId, setOutcomeId] = useState(OUTCOME_FIELDS[0].id);
  const [determinantId, setDeterminantId] = useState(DETERMINANT_FIELDS[1].id);
  const outcome = OUTCOME_FIELDS.find((f) => f.id === outcomeId)!;
  const determinant = DETERMINANT_FIELDS.find((f) => f.id === determinantId)!;

  const outcomeRows = rowsForField(rowsByFile[outcome.file], outcome);
  const determinantRows = rowsForField(rowsByFile[determinant.file], determinant);

  // "auto" = today's behaviour (best year, auto-picked). "pooled" = every
  // state×year pair across all years at once. A specific year forces every
  // computation onto that one year.
  const [yearMode, setYearMode] = useState<string>("auto");

  const availableYears = useMemo(() => {
    if (!outcomeRows || !determinantRows) return [];
    return findYearsWithPairs(determinantRows, outcomeRows, determinant.field, outcome.field);
  }, [determinantRows, outcomeRows, determinant.field, outcome.field]);

  // Reset to "auto" when switching fields lands on a year that's no longer offered.
  useEffect(() => {
    if (yearMode === "auto" || yearMode === "pooled") return;
    if (!availableYears.some((y) => String(y.year) === yearMode)) setYearMode("auto");
  }, [availableYears, yearMode]);

  const correlationInput = useMemo(() => {
    if (!outcomeRows || !determinantRows) return null;
    if (yearMode === "pooled") {
      const pairs = buildPooledPairs(determinantRows, outcomeRows, determinant.field, outcome.field);
      return { year: null as number | null, n: pairs.length, pairs, pooled: true as const };
    }
    if (yearMode !== "auto") {
      const year = Number(yearMode);
      const pairs = buildPairs(determinantRows, outcomeRows, year, determinant.field, outcome.field);
      return { year, n: pairs.length, pairs, pooled: false as const };
    }
    const { year, n } = findBestYear(determinantRows, outcomeRows, determinant.field, outcome.field);
    if (year === null) return { year, n, pairs: [] as { state: string; x: number; y: number }[], pooled: false as const };
    const pairs = buildPairs(determinantRows, outcomeRows, year, determinant.field, outcome.field);
    return { year, n, pairs, pooled: false as const };
  }, [outcomeRows, determinantRows, outcome.field, determinant.field, yearMode]);

  const stats = useMemo(() => computeCorrelationStats(correlationInput?.pairs ?? []), [correlationInput]);

  // Whether each determinant option could ever produce a chart against the
  // currently selected outcome — some pairs are structurally impossible
  // (e.g. healthcare_access_state.json's beds/staff fields only have real
  // values in 2020-2022, while NHMS survey years are 2015/2019/2023; those
  // never overlap, no matter which state or mode). Viable if EITHER the
  // best single year, OR pooling across all years, reaches the minimum
  // pair count — disabling up front instead of letting a click land on
  // "Insufficient data" with no warning.
  const determinantViability = useMemo(() => {
    const result: Record<string, boolean> = {};
    const outRows = rowsForField(rowsByFile[outcome.file], outcome);
    for (const det of DETERMINANT_FIELDS) {
      const detRows = rowsForField(rowsByFile[det.file], det);
      if (!detRows || !outRows) {
        result[det.id] = true; // still loading — don't disable based on incomplete data
        continue;
      }
      const { n } = findBestYear(detRows, outRows, det.field, outcome.field);
      const pooledN = buildPooledPairs(detRows, outRows, det.field, outcome.field).length;
      result[det.id] = n >= CORRELATION_MIN_PAIRS || pooledN >= CORRELATION_MIN_PAIRS;
    }
    return result;
  }, [outcome, rowsByFile]);

  // If switching the outcome leaves the currently selected determinant
  // stranded (disabled, no possible overlapping year), move to the first
  // determinant that still works rather than leaving the user stuck on a
  // pair that can never render.
  useEffect(() => {
    if (determinantViability[determinantId] === false) {
      const firstViable = DETERMINANT_FIELDS.find((f) => determinantViability[f.id] !== false);
      if (firstViable) setDeterminantId(firstViable.id);
    }
  }, [determinantViability, determinantId]);

  const isPooled = correlationInput?.pooled === true;

  const rankedPairs = useMemo(() => {
    const pairs = correlationInput?.pairs ?? [];
    if (isPooled) {
      // Pooled mode has multiple points per state (one per year) — a
      // single "rank" per state would be misleading, so it's omitted.
      return pairs.map((p) => ({ ...p, n: pairs.length }));
    }
    // Ranked by the outcome (y) value — 1 = highest — so the tooltip can show
    // "this state ranks Nth of N states on [outcome]" alongside the raw values.
    const byOutcomeDesc = [...pairs].sort((a, b) => b.y - a.y);
    const rankByState = new Map(byOutcomeDesc.map((p, i) => [p.state, i + 1]));
    return pairs.map((p) => ({ ...p, rank: rankByState.get(p.state)!, n: pairs.length }));
  }, [correlationInput, isPooled]);

  const interpretation = useMemo(() => (stats ? interpretCorrelation(stats.pearson) : null), [stats]);
  const yearLabel = isPooled ? "pooled, all years" : String(correlationInput?.year ?? "");

  const [showTable, setShowTable] = useState(false);
  const [pngPending, setPngPending] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);

  const tableColumns: Column[] = isPooled
    ? [
        { key: "state", label: "State" },
        { key: "year", label: "Year", numeric: true },
        { key: "x", label: `${determinant.label} (${determinant.unit})`, numeric: true },
        { key: "y", label: `${outcome.label} (${outcome.unit})`, numeric: true },
      ]
    : [
        { key: "state", label: "State" },
        { key: "x", label: `${determinant.label} (${determinant.unit})`, numeric: true },
        { key: "y", label: `${outcome.label} (${outcome.unit})`, numeric: true },
        { key: "rank", label: `Rank on ${outcome.label}`, numeric: true },
      ];

  function handleExportCSV() {
    const csv = toCSV(tableColumns, rankedPairs as unknown as Record<string, unknown>[]);
    downloadCSV(`determinants_${determinant.id}_${outcome.id}.csv`, csv);
  }

  async function handleExportPNG() {
    const svg = chartRef.current?.querySelector("svg");
    if (!svg) return;
    setPngPending(true);
    try {
      const dataUrl = await svgToPngDataUrl(svg);
      downloadDataUrl(dataUrl, `determinants_${determinant.id}_${outcome.id}.png`);
    } catch {
      // Rasterization failed (e.g. unsupported browser) — CSV export still works.
    } finally {
      setPngPending(false);
    }
  }

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
              {DETERMINANT_FIELDS.map((f) => {
                const viable = determinantViability[f.id] ?? true;
                return (
                  <option
                    key={f.id}
                    value={f.id}
                    disabled={!viable}
                    title={viable ? undefined : `${f.label} and ${outcome.label} never share a reported year in this dataset — no correlation is possible for this pair.`}
                  >
                    {f.label}
                    {!viable ? " (no overlapping year with this outcome)" : ""}
                  </option>
                );
              })}
            </select>
          </div>
          <div>
            <label htmlFor="det-year" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
              Year
            </label>
            <select
              id="det-year"
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
          <p className="ml-auto max-w-md text-xs text-ink-muted">
            State-level only (16 states) — health outcomes are not published at district resolution in this
            dataset, so a district-level version of this explorer is not offered. Determinants greyed out above
            can never produce a result for the currently selected outcome in any year, pooled or not.
          </p>
        </div>

        {isPooled && (
          <div className="rounded-lg border border-line-axis bg-plane p-3 text-xs text-ink-secondary">
            <strong className="text-ink-primary">Pooled across years.</strong> Each point is one state in one year
            — the same state can appear more than once if it has data in multiple years. This increases the sample
            size but mixes different time periods together; it is not a single-year snapshot, and should be read as
            a broader association across the whole period rather than a picture of any one year.
          </div>
        )}

        {outcome.sourceKey === "nhms_ncd" && (
          <div className="rounded-lg border border-line-axis bg-plane p-3 text-xs text-ink-secondary">
            <strong className="text-ink-primary">Survey estimate, not a registry count.</strong> Unlike this
            explorer&apos;s other outcomes (which are administrative counts from birth/death registries),
            this outcome comes from an NHMS household survey (2015, 2019 and/or 2023, depending on the
            indicator) — a weighted estimate from a sample of respondents in each state. 2015/2019 figures
            carry their own 95% confidence interval; 2023&apos;s dedicated by-state tables only publish a
            point estimate. States with fewer survey respondents have wider, less certain estimates, and a
            2023 figure is age-standardised while 2015/2019 are not — treat cross-year comparisons and close
            state rankings with caution. See the data source panel below for exact table/page citations.
          </div>
        )}

        {outcome.sourceKey === "nhms_adolescent_mental_health" && (
          <div className="rounded-lg border border-series-1 bg-plane p-3 text-xs text-ink-secondary">
            <strong className="text-ink-primary">Adolescents only, not the general population.</strong> This
            outcome is from a 2017 school-based survey of secondary-school students aged 13–17 — it does not
            represent adults or the state&apos;s population as a whole, and cannot be meaningfully compared to
            any adult health outcome elsewhere in this explorer. Students who had already dropped out of
            school are not represented. This is a single cross-sectional year (2017); no repeat cycle of this
            specific survey has been identified, so no trend over time is available.
          </div>
        )}

        {!correlationInput || (!isPooled && correlationInput.year === null) || !stats ? (
          <InsufficientData
            reason={
              isPooled
                ? `Only ${correlationInput?.n ?? 0} pooled state-year point(s) have non-null values for both "${determinant.label}" and "${outcome.label}" across all years (need at least 8).`
                : correlationInput && correlationInput.year !== null
                  ? `Only ${correlationInput.n} state(s) have non-null values for both "${determinant.label}" and "${outcome.label}" in ${correlationInput.year} (need at least 8). This outcome or determinant is not reported for enough states.`
                  : `"${determinant.label}" and "${outcome.label}" share no common year with paired state-level data for the selected year mode.`
            }
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="grid grid-cols-2 gap-3 lg:col-span-1 lg:grid-cols-1">
              <StatTile
                label="Strength & direction"
                value={interpretation!.label}
                sublabel="Qualitative read of Pearson r below"
              />
              <StatTile label="Pearson r" value={stats.pearson.toFixed(3)} sublabel="Linear association" />
              <StatTile label="Spearman ρ" value={stats.spearman.toFixed(3)} sublabel="Rank association" />
              <StatTile label="r²" value={stats.r2.toFixed(3)} sublabel={isPooled ? `n = ${stats.n} state-year points, pooled` : `n = ${stats.n} states, ${yearLabel}`} />
            </div>
            <div className="lg:col-span-2">
              <div className="rounded-lg border border-line-grid bg-surface p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-medium text-ink-primary">
                    {determinant.label} vs. {outcome.label} — {yearLabel}
                  </h3>
                </div>
                <ChartToolbar
                  showingTable={showTable}
                  onToggleTable={() => setShowTable((v) => !v)}
                  onExportCSV={handleExportCSV}
                  onExportPNG={handleExportPNG}
                  pngPending={pngPending}
                />
                {!showTable && (
                  <div className="mb-2 flex justify-end">
                    <EvidenceSnapshotButton
                      chartRef={chartRef}
                      title={`${determinant.label} vs. ${outcome.label} — ${yearLabel}`}
                      subtitle="Malaysia Health Equity Observatory (MY-HEO) — Determinants Explorer"
                      stats={[
                        { label: "Strength & direction", value: interpretation!.label },
                        { label: "Pearson r", value: stats.pearson.toFixed(3) },
                        { label: "Spearman ρ", value: stats.spearman.toFixed(3) },
                        { label: "r²", value: stats.r2.toFixed(3) },
                        { label: isPooled ? "n (state-year points)" : "n (states)", value: String(stats.n) },
                        { label: "Year", value: yearLabel },
                      ]}
                      sourceKeys={[determinant.sourceKey, outcome.sourceKey]}
                      caveat={
                        outcome.sourceKey === "nhms_ncd" || outcome.sourceKey === "nhms_adolescent_mental_health"
                          ? `${CORRELATION_CAVEAT_TEXT} This outcome is a weighted survey estimate (NHMS), not an administrative registry count — see the in-app data source panel for exact survey-year and confidence-interval detail.`
                          : CORRELATION_CAVEAT_TEXT
                      }
                    />
                  </div>
                )}
                {showTable ? (
                  <DataTable
                    columns={tableColumns}
                    rows={rankedPairs as unknown as Record<string, unknown>[]}
                    searchable={false}
                    pageSize={rankedPairs.length || 1}
                  />
                ) : (
                  <div ref={chartRef}>
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
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const p = payload[0].payload as { state: string; x: number; y: number; rank?: number; n: number; year?: number };
                            return (
                              <div className="rounded-md border border-line-grid bg-surface p-2 text-xs shadow-sm">
                                <p className="font-medium text-ink-primary">
                                  {p.state}
                                  {isPooled && p.year !== undefined ? ` (${p.year})` : ""}
                                </p>
                                <p className="text-ink-secondary">
                                  {determinant.label}: {p.x}
                                </p>
                                <p className="text-ink-secondary">
                                  {outcome.label}: {p.y}
                                </p>
                                {typeof p.rank === "number" && (
                                  <p className="text-ink-muted">
                                    Rank {p.rank} of {p.n} states on {outcome.label}
                                  </p>
                                )}
                              </div>
                            );
                          }}
                        />
                        <Scatter name="States" data={rankedPairs} fill="#2a78d6" />
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
                  </div>
                )}
                <p className="mt-2 text-xs text-ink-muted">
                  {isPooled
                    ? "Each point is one Malaysian state in one year — states with data in multiple years appear more than once."
                    : `Each point is one Malaysian state in ${yearLabel}.`}{" "}
                  The orange line is a simple linear regression fit, shown to summarise the linear trend only — it
                  is descriptive, not predictive or causal.
                </p>
              </div>
              <SourceNote sourceKey={determinant.sourceKey} year={yearLabel} />
              <SourceNote sourceKey={outcome.sourceKey} year={yearLabel} />
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
