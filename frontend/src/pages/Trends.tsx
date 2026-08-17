import { useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import LineChartCard, { type Series } from "../components/LineChartCard";
import SourceNote from "../components/SourceNote";
import InsufficientData from "../components/InsufficientData";
import { useData } from "../lib/useData";
import { buildStateTrend, computeAverage, type Row, type TrendPoint } from "../lib/equity";
import { MALAYSIA_STATES } from "../lib/geoConstants";
import { OUTCOME_FIELDS, DETERMINANT_FIELDS, rowsForField, type FieldDef } from "../lib/determinantFields";
import { SOURCES } from "../lib/sources";

const ALL_FIELDS: FieldDef[] = [...OUTCOME_FIELDS, ...DETERMINANT_FIELDS];

const OVERLAY_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7"];
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
        if (!f) continue;
        const rows2 = rowsForField(rowsByFile[f.file], f);
        let points: TrendPoint[];
        if (overlayMode === "indicators-state") {
          points = buildStateTrend(rows2, overlayState, f.field);
        } else {
          const years = Array.from(new Set((rows2 ?? []).map((r) => r.year as number))).sort((a, b) => a - b);
          points = years
            .map((y) => ({ year: y, value: computeAverage(rows2, y, f.field)?.mean ?? NaN }))
            .filter((p) => !Number.isNaN(p.value));
        }
        for (const p of indexTrend(points)) {
          if (!byYear.has(p.year)) byYear.set(p.year, {});
          byYear.get(p.year)![f.label] = p.value;
        }
      }
    }

    return Array.from(byYear.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([yr, vals]) => ({ year: yr, ...vals }));
  }, [overlayMode, overlayFieldIds, overlayState, overlayStates, overlaySingleField, rowsByFile]);

  const overlaySeries: Series[] =
    overlayMode === "states-indicator"
      ? overlayStates.map((s, i) => ({ key: s, label: s, color: OVERLAY_COLORS[i % OVERLAY_COLORS.length] }))
      : overlayFieldIds
          .map((fid) => ALL_FIELDS.find((f) => f.id === fid))
          .filter((f): f is FieldDef => !!f)
          .map((f, i) => ({ key: f.label, label: f.label, color: OVERLAY_COLORS[i % OVERLAY_COLORS.length] }));

  const series: Series[] = [
    { key: state, label: state, color: "#2a78d6" },
    { key: "Malaysia average", label: "Malaysia average (that year)", color: "#eb6834" },
  ];

  return (
    <div>
      <PageHeader
        title="Trends"
        subtitle="WHY, over time: is a state's gap on an indicator widening or narrowing? Every real reported year for that state, plotted against the national average for the same year."
      />
      <div className="space-y-6 p-6 lg:p-10">
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
                Indicators (up to {MAX_OVERLAY_SERIES}) — each rescaled to its own first plotted year = 100, since
                indicators here don't share a unit
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
                  {Array.from(new Set(overlayFieldIds.map((fid) => ALL_FIELDS.find((f) => f.id === fid)?.sourceKey).filter((k): k is FieldDef["sourceKey"] => !!k)))
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
      </div>
    </div>
  );
}
