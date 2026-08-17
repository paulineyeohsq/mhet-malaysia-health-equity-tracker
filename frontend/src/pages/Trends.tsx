import { useMemo, useRef, useState } from "react";
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
import LineChartCard, { type Series } from "../components/LineChartCard";
import SourceNote from "../components/SourceNote";
import InsufficientData from "../components/InsufficientData";
import StatTile from "../components/StatTile";
import ChartToolbar from "../components/ChartToolbar";
import DataTable, { toCSV, downloadCSV, type Column } from "../components/DataTable";
import { useData } from "../lib/useData";
import { buildStateTrend, computeAverage, type Row, type TrendPoint } from "../lib/equity";
import { computeCorrelationStats, interpretCorrelation, type CorrelationPair } from "../lib/correlation";
import { svgToPngDataUrl, downloadDataUrl } from "../lib/exportChart";
import { useChat, buildExplainPrompt } from "../lib/chatContext";
import { MALAYSIA_STATES } from "../lib/geoConstants";
import { OUTCOME_FIELDS, DETERMINANT_FIELDS, NATIONAL_FIELDS, rowsForField, type FieldDef, type NationalFieldDef } from "../lib/determinantFields";
import { SOURCES } from "../lib/sources";
import MetadataPanel from "../components/MetadataPanel";
import { INVENTORY_MAP } from "../lib/inventoryMap";

const ALL_FIELDS: FieldDef[] = [...OUTCOME_FIELDS, ...DETERMINANT_FIELDS];

const OVERLAY_COLORS = ["#3a7173", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7"];
const MAX_OVERLAY_SERIES = 6;

type OverlayMode = "indicators-average" | "indicators-state" | "states-indicator";

/** Rescales a trend so its first plotted year = 100 — the only way to
 * meaningfully overlay indicators with different units (%, RM, per-100k...)
 * on one chart. Only used when comparing different indicators; comparing
 * the same indicator across states plots real values, no indexing needed. */
function indexTrend(points: TrendPoint[]): TrendPoint[] {
  if (points.length === 0) return [];
  const base = points[0].value;
  if (!base) return [];
  return points.map((p) => ({ year: p.year, value: (p.value / base) * 100 }));
}

/**
 * Is a state's gap on some indicator widening or narrowing over time? Most
 * DOSM series run 1970-2024, but Determinants Explorer only ever shows one
 * cross-sectional year — this page is the trend-over-time complement,
 * built entirely on existing infrastructure: LineChartCard (table/CSV/PNG
 * export already built in) and equity.ts's buildStateTrend/computeAverage.
 */
export default function Trends() {
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
  const { data: airPollution } = useData<Row[]>("air_pollution_national.json");
  const { data: ghgEmissions } = useData<Row[]>("ghg_emissions_national.json");
  const { data: waterPollutionBasin } = useData<Row[]>("water_pollution_basin_national.json");
  const { data: electricityConsumption } = useData<Row[]>("electricity_consumption_national.json");
  const { data: electricitySupply } = useData<Row[]>("electricity_supply_national.json");

  const nationalRowsByFile: Record<NationalFieldDef["file"], Row[] | null> = useMemo(
    () => ({
      "air_pollution_national.json": airPollution,
      "ghg_emissions_national.json": ghgEmissions,
      "water_pollution_basin_national.json": waterPollutionBasin,
      "electricity_consumption_national.json": electricityConsumption,
      "electricity_supply_national.json": electricitySupply,
    }),
    [airPollution, ghgEmissions, waterPollutionBasin, electricityConsumption, electricitySupply]
  );

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

  const [state, setState] = useState(MALAYSIA_STATES[0]);
  const [fieldId, setFieldId] = useState(DETERMINANT_FIELDS[1].id);
  const field = ALL_FIELDS.find((f) => f.id === fieldId)!;

  const rows = rowsForField(rowsByFile[field.file], field);

  const chartData = useMemo(() => {
    const stateTrend = buildStateTrend(rows, state, field.field);
    return stateTrend.map((p) => {
      const avg = computeAverage(rows, p.year, field.field);
      return { year: p.year, [state]: p.value, "Malaysia average": avg?.mean ?? null };
    });
  }, [rows, state, field]);

  // ---- Overlay: compare multiple indicators and/or multiple states at once ----
  const [overlayMode, setOverlayMode] = useState<OverlayMode>("indicators-average");
  const [overlayFieldIds, setOverlayFieldIds] = useState<string[]>([DETERMINANT_FIELDS[1].id, OUTCOME_FIELDS[1].id]);
  const [overlayState, setOverlayState] = useState(MALAYSIA_STATES[0]);
  const [overlaySingleFieldId, setOverlaySingleFieldId] = useState(DETERMINANT_FIELDS[1].id);
  const [overlayStates, setOverlayStates] = useState<string[]>([MALAYSIA_STATES[0], MALAYSIA_STATES[1]]);

  function toggleOverlayField(id: string) {
    setOverlayFieldIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < MAX_OVERLAY_SERIES ? [...prev, id] : prev));
  }
  function toggleOverlayState(s: string) {
    setOverlayStates((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : prev.length < MAX_OVERLAY_SERIES ? [...prev, s] : prev));
  }

  const overlaySingleField = ALL_FIELDS.find((f) => f.id === overlaySingleFieldId)!;

  const overlayChartData = useMemo(() => {
    const byYear = new Map<number, Record<string, number | null>>();

    if (overlayMode === "states-indicator") {
      const rows2 = rowsForField(rowsByFile[overlaySingleField.file], overlaySingleField);
      for (const s of overlayStates) {
        for (const p of buildStateTrend(rows2, s, overlaySingleField.field)) {
          if (!byYear.has(p.year)) byYear.set(p.year, {});
          byYear.get(p.year)![s] = p.value;
        }
      }
    } else {
      for (const fid of overlayFieldIds) {
        const f = ALL_FIELDS.find((x) => x.id === fid);
        const nf = f ? undefined : NATIONAL_FIELDS.find((x) => x.id === fid);
        if (!f && !nf) continue;

        let points: TrendPoint[];
        if (nf) {
          // National-only field: no state dimension, so the same one
          // national figure per year is used regardless of overlayState —
          // it's already "the national average" by definition.
          const nationalRows = nationalRowsByFile[nf.file];
          const rows2 = nf.filter && nationalRows ? nationalRows.filter(nf.filter) : nationalRows;
          const years = Array.from(new Set((rows2 ?? []).map((r) => r.year as number))).sort((a, b) => a - b);
          points = years
            .map((y) => ({ year: y, value: (rows2 ?? []).find((r) => r.year === y)?.[nf.field] as number | null | undefined }))
            .filter((p): p is { year: number; value: number } => typeof p.value === "number");
        } else {
          const field = f!;
          const rows2 = rowsForField(rowsByFile[field.file], field);
          if (overlayMode === "indicators-state") {
            points = buildStateTrend(rows2, overlayState, field.field);
          } else {
            const years = Array.from(new Set((rows2 ?? []).map((r) => r.year as number))).sort((a, b) => a - b);
            points = years
              .map((y) => ({ year: y, value: computeAverage(rows2, y, field.field)?.mean ?? NaN }))
              .filter((p) => !Number.isNaN(p.value));
          }
        }

        const label = (f ?? nf)!.label;
        for (const p of indexTrend(points)) {
          if (!byYear.has(p.year)) byYear.set(p.year, {});
          byYear.get(p.year)![label] = p.value;
        }
      }
    }

    return Array.from(byYear.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([yr, vals]) => ({ year: yr, ...vals }));
  }, [overlayMode, overlayFieldIds, overlayState, overlayStates, overlaySingleField, rowsByFile, nationalRowsByFile]);

  const overlaySeries: Series[] =
    overlayMode === "states-indicator"
      ? overlayStates.map((s, i) => ({ key: s, label: s, color: OVERLAY_COLORS[i % OVERLAY_COLORS.length] }))
      : overlayFieldIds
          .map((fid) => ALL_FIELDS.find((f) => f.id === fid) ?? NATIONAL_FIELDS.find((f) => f.id === fid))
          .filter((f): f is FieldDef | NationalFieldDef => !!f)
          .map((f, i) => ({ key: f.label, label: f.label, color: OVERLAY_COLORS[i % OVERLAY_COLORS.length] }));

  const series: Series[] = [
    { key: state, label: state, color: "#3a7173" },
    { key: "Malaysia average", label: "Malaysia average (that year)", color: "#eb6834" },
  ];

  // ---- Correlate two indicators over time: pairs by YEAR (Malaysia-wide),
  // not by state — the time-series complement to Determinants Explorer's
  // by-state correlation, and the only place a state-level field (averaged
  // across states per year) and a national-only field (already one figure
  // per year) can be statistically compared against each other. ----
  function trendPointsFor(id: string): TrendPoint[] {
    const nf = NATIONAL_FIELDS.find((x) => x.id === id);
    if (nf) {
      const nationalRows = nationalRowsByFile[nf.file];
      const filtered = nf.filter && nationalRows ? nationalRows.filter(nf.filter) : nationalRows;
      const years = Array.from(new Set((filtered ?? []).map((r) => r.year as number))).sort((a, b) => a - b);
      return years
        .map((y) => ({ year: y, value: (filtered ?? []).find((r) => r.year === y)?.[nf.field] as number | null | undefined }))
        .filter((p): p is TrendPoint => typeof p.value === "number");
    }
    const f = ALL_FIELDS.find((x) => x.id === id);
    if (!f) return [];
    const rows2 = rowsForField(rowsByFile[f.file], f);
    const years = Array.from(new Set((rows2 ?? []).map((r) => r.year as number))).sort((a, b) => a - b);
    return years
      .map((y) => ({ year: y, value: computeAverage(rows2, y, f.field)?.mean ?? null }))
      .filter((p): p is TrendPoint => typeof p.value === "number");
  }

  const CORR_FIELDS: (FieldDef | NationalFieldDef)[] = [...ALL_FIELDS, ...NATIONAL_FIELDS];
  const [corrXId, setCorrXId] = useState(DETERMINANT_FIELDS[1].id);
  const [corrYId, setCorrYId] = useState(NATIONAL_FIELDS[4].id); // PM2.5
  const corrX = CORR_FIELDS.find((f) => f.id === corrXId)!;
  const corrY = CORR_FIELDS.find((f) => f.id === corrYId)!;

  const corrPairs: CorrelationPair[] = useMemo(() => {
    const xPoints = trendPointsFor(corrXId);
    const yByYear = new Map(trendPointsFor(corrYId).map((p) => [p.year, p.value]));
    return xPoints
      .filter((p) => yByYear.has(p.year))
      .map((p) => ({ state: String(p.year), x: p.value, y: yByYear.get(p.year)! }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corrXId, corrYId, rowsByFile, nationalRowsByFile]);

  const corrStats = useMemo(() => computeCorrelationStats(corrPairs), [corrPairs]);
  const corrInterpretation = corrStats ? interpretCorrelation(corrStats.pearson) : null;

  const [corrShowTable, setCorrShowTable] = useState(false);
  const [corrPngPending, setCorrPngPending] = useState(false);
  const corrChartRef = useRef<HTMLDivElement>(null);
  const { explain } = useChat();

  const corrTableColumns: Column[] = [
    { key: "state", label: "Year" },
    { key: "x", label: `${corrX.label} (${corrX.unit})`, numeric: true },
    { key: "y", label: `${corrY.label} (${corrY.unit})`, numeric: true },
  ];

  function handleCorrExportCSV() {
    const csv = toCSV(corrTableColumns, corrPairs as unknown as Record<string, unknown>[]);
    downloadCSV(`trend_correlation_${corrX.id}_${corrY.id}.csv`, csv);
  }
  function handleCorrExplain() {
    const csv = toCSV(corrTableColumns, corrPairs as unknown as Record<string, unknown>[]);
    explain(buildExplainPrompt(`${corrX.label} vs. ${corrY.label} over time`, csv, corrPairs.length));
  }
  async function handleCorrExportPNG() {
    const svg = corrChartRef.current?.querySelector("svg");
    if (!svg) return;
    setCorrPngPending(true);
    try {
      const dataUrl = await svgToPngDataUrl(svg);
      downloadDataUrl(dataUrl, `trend_correlation_${corrX.id}_${corrY.id}.png`);
    } catch {
      // Rasterization failed — CSV export still works.
    } finally {
      setCorrPngPending(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Trends"
        subtitle="WHY, over time: is a state's gap on an indicator widening or narrowing? Every real reported year for that state, plotted against the national average for the same year."
      />
      <div className="space-y-6 p-6 lg:p-10">
        <MetadataPanel
          datasetIds={Array.from(
            new Set(
              [...OUTCOME_FIELDS, ...DETERMINANT_FIELDS].flatMap((f) => INVENTORY_MAP[f.file] ?? []).concat(
                NATIONAL_FIELDS.flatMap((f) => INVENTORY_MAP[f.file] ?? [])
              )
            )
          )}
        />
        <div className="mb-4 flex flex-wrap items-end gap-4 rounded-lg border border-line-grid bg-surface p-4">
          <div>
            <label htmlFor="trend-state" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
              State
            </label>
            <select
              id="trend-state"
              value={state}
              onChange={(e) => setState(e.target.value)}
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
            <label htmlFor="trend-field" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
              Indicator
            </label>
            <select
              id="trend-field"
              value={fieldId}
              onChange={(e) => setFieldId(e.target.value)}
              className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
            >
              <optgroup label="Health / healthcare-access outcomes">
                {OUTCOME_FIELDS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Socioeconomic / access determinants">
                {DETERMINANT_FIELDS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          <p className="ml-auto max-w-md text-xs text-ink-muted">
            State-level only. Only years {state} actually reports a value are plotted — gaps in the source data are
            never interpolated or filled.
          </p>
        </div>

        {chartData.length === 0 ? (
          <InsufficientData reason={`${state} has no reported values for "${field.label}" in this dataset.`} />
        ) : (
          <>
            <LineChartCard title={`${field.label} (${field.unit}) — ${state} vs. Malaysia average`} data={chartData} xKey="year" series={series} />
            <SourceNote sourceKey={field.sourceKey} extra={`${chartData.length} year(s) with data for ${state}`} />
          </>
        )}

        {/* ---------------- Overlay: compare multiple indicators/states at once ---------------- */}
        <section aria-labelledby="trend-overlay" className="border-t border-line-grid pt-6">
          <h2 id="trend-overlay" className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Overlay comparison
          </h2>
          <p className="mb-3 max-w-3xl text-sm text-ink-secondary">
            Compare several indicators and/or several states on one chart. Pick a mode below.
          </p>

          <div className="mb-4 flex flex-wrap gap-2 rounded-lg border border-line-grid bg-surface p-4">
            {(
              [
                { id: "indicators-average", label: "Multiple indicators — Malaysia average" },
                { id: "indicators-state", label: "Multiple indicators — one state" },
                { id: "states-indicator", label: "One indicator — multiple states" },
              ] as { id: OverlayMode; label: string }[]
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setOverlayMode(m.id)}
                aria-pressed={overlayMode === m.id}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                  overlayMode === m.id
                    ? "border-series-1 bg-series-1 text-white"
                    : "border-line-axis text-ink-secondary hover:border-series-1 hover:text-series-1"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {overlayMode !== "states-indicator" && (
            <div className="mb-4 rounded-lg border border-line-grid bg-surface p-4">
              {overlayMode === "indicators-state" && (
                <div className="mb-3">
                  <label htmlFor="overlay-state" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                    State
                  </label>
                  <select
                    id="overlay-state"
                    value={overlayState}
                    onChange={(e) => setOverlayState(e.target.value)}
                    className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
                  >
                    {MALAYSIA_STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
                State-level indicators (up to {MAX_OVERLAY_SERIES} total) — each rescaled to its own first plotted
                year = 100, since indicators here don't share a unit
              </p>
              <div className="flex max-h-48 flex-wrap gap-x-4 gap-y-1.5 overflow-y-auto">
                {ALL_FIELDS.map((f) => (
                  <label key={f.id} className="flex items-center gap-1.5 text-sm text-ink-secondary">
                    <input
                      type="checkbox"
                      checked={overlayFieldIds.includes(f.id)}
                      disabled={!overlayFieldIds.includes(f.id) && overlayFieldIds.length >= MAX_OVERLAY_SERIES}
                      onChange={() => toggleOverlayField(f.id)}
                    />
                    {f.label}
                  </label>
                ))}
              </div>
              <p className="mb-2 mt-3 text-xs font-medium uppercase tracking-wide text-ink-muted">
                National-only indicators — no state breakdown exists in the source, so the same national figure is
                plotted regardless of the state selected above
              </p>
              <div className="flex max-h-48 flex-wrap gap-x-4 gap-y-1.5 overflow-y-auto">
                {NATIONAL_FIELDS.map((f) => (
                  <label key={f.id} className="flex items-center gap-1.5 text-sm text-ink-secondary">
                    <input
                      type="checkbox"
                      checked={overlayFieldIds.includes(f.id)}
                      disabled={!overlayFieldIds.includes(f.id) && overlayFieldIds.length >= MAX_OVERLAY_SERIES}
                      onChange={() => toggleOverlayField(f.id)}
                    />
                    {f.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {overlayMode === "states-indicator" && (
            <div className="mb-4 rounded-lg border border-line-grid bg-surface p-4">
              <div className="mb-3">
                <label htmlFor="overlay-single-field" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Indicator
                </label>
                <select
                  id="overlay-single-field"
                  value={overlaySingleFieldId}
                  onChange={(e) => setOverlaySingleFieldId(e.target.value)}
                  className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
                >
                  <optgroup label="Health / healthcare-access outcomes">
                    {OUTCOME_FIELDS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Socioeconomic / access determinants">
                    {DETERMINANT_FIELDS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">States (up to {MAX_OVERLAY_SERIES})</p>
              <div className="flex max-h-48 flex-wrap gap-x-4 gap-y-1.5 overflow-y-auto">
                {MALAYSIA_STATES.map((s) => (
                  <label key={s} className="flex items-center gap-1.5 text-sm text-ink-secondary">
                    <input
                      type="checkbox"
                      checked={overlayStates.includes(s)}
                      disabled={!overlayStates.includes(s) && overlayStates.length >= MAX_OVERLAY_SERIES}
                      onChange={() => toggleOverlayState(s)}
                    />
                    {s}
                  </label>
                ))}
              </div>
            </div>
          )}

          {overlayChartData.length === 0 || overlaySeries.length === 0 ? (
            <InsufficientData reason="Select at least one indicator (and, for the multi-state mode, at least one state) with reported data." />
          ) : (
            <>
              <LineChartCard
                title={
                  overlayMode === "states-indicator"
                    ? `${overlaySingleField.label} (${overlaySingleField.unit}) — by state`
                    : overlayMode === "indicators-state"
                      ? `Indexed trend (first year = 100) — ${overlayState}`
                      : "Indexed trend (first year = 100) — Malaysia average"
                }
                data={overlayChartData}
                xKey="year"
                series={overlaySeries}
                unit={overlayMode === "states-indicator" ? overlaySingleField.unit : "index, first year = 100"}
              />
              {overlayMode === "states-indicator" ? (
                <SourceNote sourceKey={overlaySingleField.sourceKey} extra="Real published values by state." />
              ) : (
                <div className="mt-2 text-xs leading-relaxed text-ink-muted">
                  Each series independently rescaled so its own first plotted year = 100 — only relative change over
                  time is comparable across indicators, not absolute values. Sources:{" "}
                  {Array.from(
                    new Set(
                      overlayFieldIds
                        .map((fid) => ALL_FIELDS.find((f) => f.id === fid)?.sourceKey ?? NATIONAL_FIELDS.find((f) => f.id === fid)?.sourceKey)
                        .filter((k): k is FieldDef["sourceKey"] => !!k)
                    )
                  )
                    .map((k, i, arr) => (
                      <span key={k}>
                        <a href={SOURCES[k].url} target="_blank" rel="noreferrer" className="text-series-1 underline underline-offset-2 hover:text-seq-600">
                          {SOURCES[k].org}
                        </a>
                        {i < arr.length - 1 ? ", " : ""}
                      </span>
                    ))}
                </div>
              )}
            </>
          )}
        </section>

        {/* ---------------- Correlate two indicators over time (pairs by year, not state) ---------------- */}
        <section aria-labelledby="trend-correlation" className="border-t border-line-grid pt-6">
          <h2 id="trend-correlation" className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Correlate two indicators over time
          </h2>
          <p className="mb-3 max-w-3xl text-sm text-ink-secondary">
            Pick any two indicators — including national-only ones like air pollution that can't be compared by
            state — and see whether they move together across the years both actually report.
          </p>

          <div className="mb-3 rounded-md border border-status-warning bg-status-warning/10 p-3 text-sm text-ink-primary">
            <span className="font-medium">Correlation, not causation — and a time trend, not a state comparison.</span>{" "}
            Each point below is one year of Malaysia-wide data, not one state. Two unrelated series can both trend
            up or down over time and appear correlated for reasons that have nothing to do with each other
            (a shared time trend, not a real relationship) — this risk is higher here than in a single-year,
            state-by-state comparison. Treat any result as a starting hypothesis, never as evidence of a causal
            link.
          </div>

          <div className="mb-4 flex flex-wrap items-end gap-4 rounded-lg border border-line-grid bg-surface p-4">
            <div>
              <label htmlFor="corr-x" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                Indicator X
              </label>
              <select
                id="corr-x"
                value={corrXId}
                onChange={(e) => setCorrXId(e.target.value)}
                className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
              >
                <optgroup label="State-level (Malaysia average)">
                  {ALL_FIELDS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="National-only">
                  {NATIONAL_FIELDS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
            <div>
              <label htmlFor="corr-y" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                Indicator Y
              </label>
              <select
                id="corr-y"
                value={corrYId}
                onChange={(e) => setCorrYId(e.target.value)}
                className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
              >
                <optgroup label="State-level (Malaysia average)">
                  {ALL_FIELDS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="National-only">
                  {NATIONAL_FIELDS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
            <p className="ml-auto max-w-md text-xs text-ink-muted">
              State-level indicators are averaged across all reporting states for each year. National-only
              indicators are already one Malaysia-wide figure per year.
            </p>
          </div>

          {!corrStats ? (
            <InsufficientData
              reason={`Only ${corrPairs.length} year(s) have a reported value for both "${corrX.label}" and "${corrY.label}" — need at least 3 for a correlation to be mathematically meaningful at all.`}
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="grid grid-cols-2 gap-3 lg:col-span-1 lg:grid-cols-1">
                {!corrStats.reliable && (
                  <div className="col-span-2 rounded-md border border-status-warning bg-status-warning/10 p-2 text-xs text-ink-primary lg:col-span-1">
                    <span className="font-medium">Low sample size (n={corrStats.n}).</span> Shown, not hidden — but
                    with fewer than 8 years, this estimate is more sensitive to individual outliers than a longer
                    time series. Treat as a rough signal, not a settled result.
                  </div>
                )}
                <StatTile label="Strength & direction" value={corrInterpretation!.label} sublabel="Qualitative read of Pearson r below" />
                <StatTile label="Pearson r" value={corrStats.pearson.toFixed(3)} sublabel="Linear association" />
                <StatTile label="Spearman ρ" value={corrStats.spearman.toFixed(3)} sublabel="Rank association" />
                <StatTile label="r²" value={corrStats.r2.toFixed(3)} sublabel={`n = ${corrStats.n} years`} />
              </div>
              <div className="lg:col-span-2">
                <div className="rounded-lg border border-line-grid bg-surface p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-medium text-ink-primary">
                      {corrX.label} vs. {corrY.label} — by year
                    </h3>
                  </div>
                  <ChartToolbar
                    showingTable={corrShowTable}
                    onToggleTable={() => setCorrShowTable((v) => !v)}
                    onExportCSV={handleCorrExportCSV}
                    onExportPNG={handleCorrExportPNG}
                    onExplain={handleCorrExplain}
                    pngPending={corrPngPending}
                  />
                  {corrShowTable ? (
                    <DataTable columns={corrTableColumns} rows={corrPairs as unknown as Record<string, unknown>[]} searchable={false} pageSize={corrPairs.length || 1} />
                  ) : (
                    <div ref={corrChartRef}>
                      <ResponsiveContainer width="100%" height={320}>
                        <ComposedChart margin={{ top: 8, right: 20, bottom: 24, left: 8 }}>
                          <CartesianGrid stroke="#e1e0d9" />
                          <XAxis
                            type="number"
                            dataKey="x"
                            name={corrX.label}
                            stroke="#898781"
                            tick={{ fontSize: 11, fill: "#52514e" }}
                            tickLine={false}
                            label={{ value: `${corrX.label} (${corrX.unit})`, position: "insideBottom", offset: -16, fontSize: 12, fill: "#52514e" }}
                          />
                          <YAxis
                            type="number"
                            dataKey="y"
                            name={corrY.label}
                            stroke="#898781"
                            tick={{ fontSize: 11, fill: "#52514e" }}
                            tickLine={false}
                            axisLine={false}
                            width={56}
                            label={{ value: corrY.unit, angle: -90, position: "insideLeft", fontSize: 12, fill: "#52514e" }}
                          />
                          <Tooltip
                            cursor={{ strokeDasharray: "3 3" }}
                            contentStyle={{ fontSize: 12, border: "1px solid #e1e0d9", borderRadius: 6 }}
                            content={({ active, payload }) => {
                              if (!active || !payload?.length) return null;
                              const p = payload[0].payload as { state: string; x: number; y: number };
                              return (
                                <div className="rounded-md border border-line-grid bg-surface p-2 text-xs shadow-sm">
                                  <p className="font-medium text-ink-primary">{p.state}</p>
                                  <p className="text-ink-secondary">
                                    {corrX.label}: {p.x}
                                  </p>
                                  <p className="text-ink-secondary">
                                    {corrY.label}: {p.y}
                                  </p>
                                </div>
                              );
                            }}
                          />
                          <Scatter name="Years" data={corrPairs} fill="#3a7173" />
                          <Line
                            name="Linear fit"
                            data={corrStats.regressionLine}
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
                    Each point is one year. The orange line is a simple linear regression fit, shown to summarise
                    the linear trend only — it is descriptive, not predictive or causal.
                  </p>
                </div>
                <SourceNote sourceKey={corrX.sourceKey} />
                <SourceNote sourceKey={corrY.sourceKey} />
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
