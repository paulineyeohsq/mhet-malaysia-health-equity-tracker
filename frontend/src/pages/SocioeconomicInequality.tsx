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
import * as ss from "simple-statistics";
import PageHeader from "../components/PageHeader";
import StatTile from "../components/StatTile";
import SourceNote from "../components/SourceNote";
import LineChartCard from "../components/LineChartCard";
import BarRankingCard from "../components/BarRankingCard";
import DataTable, { type Column } from "../components/DataTable";
import ChoroplethMap, { type ChoroplethDatum } from "../components/ChoroplethMap";
import InsufficientData from "../components/InsufficientData";
import { useData } from "../lib/useData";
import type { SOURCES } from "../lib/sources";

interface NationalRow {
  year: number;
  income_mean: number | null;
  income_median: number | null;
  poverty_absolute: number | null;
  poverty_hardcore: number | null;
  poverty_relative: number | null;
  gini: number | null;
}

interface StateRow {
  state: string;
  year: number;
  income_mean: number | null;
  income_median: number | null;
  poverty_absolute: number | null;
  poverty_hardcore: number | null;
  poverty_relative: number | null;
  gini: number | null;
}

interface DistrictRow {
  state: string;
  district: string;
  year: number;
  income_mean: number | null;
  income_median: number | null;
  poverty_absolute: number | null;
  poverty_relative: number | null;
  gini: number | null;
  sanitation_pct: number | null;
  electricity_pct: number | null;
  piped_water_pct: number | null;
}

interface HealthOutcomeRow {
  state: string;
  year: number;
  crude_death_rate_per_1000: number | null;
  maternal_mortality_rate_per_100k_births: number | null;
  infant_mortality_rate: number | null;
  under5_mortality_rate: number | null;
  [key: string]: unknown;
}

type SocioIndicatorId = "income_median" | "poverty_absolute" | "gini";
type HealthIndicatorId =
  | "crude_death_rate_per_1000"
  | "infant_mortality_rate"
  | "maternal_mortality_rate_per_100k_births"
  | "under5_mortality_rate";

const SOCIO_INDICATORS: { id: SocioIndicatorId; label: string; unit: string; sourceKey: keyof typeof SOURCES; color: string }[] = [
  { id: "income_median", label: "Median household income", unit: "RM", sourceKey: "income", color: "#2a78d6" },
  { id: "poverty_absolute", label: "Absolute poverty rate", unit: "%", sourceKey: "poverty", color: "#eb6834" },
  { id: "gini", label: "Gini coefficient", unit: "", sourceKey: "gini", color: "#4a3aa7" },
];

const HEALTH_INDICATORS: { id: HealthIndicatorId; label: string; unit: string; sourceKey: keyof typeof SOURCES }[] = [
  { id: "crude_death_rate_per_1000", label: "Crude death rate", unit: "per 1,000 pop.", sourceKey: "deaths" },
  { id: "infant_mortality_rate", label: "Infant mortality rate", unit: "per 1,000 births", sourceKey: "early_childhood_deaths" },
  { id: "maternal_mortality_rate_per_100k_births", label: "Maternal mortality rate", unit: "per 100,000 births", sourceKey: "maternal_deaths" },
  { id: "under5_mortality_rate", label: "Under-5 mortality rate", unit: "per 1,000 births", sourceKey: "early_childhood_deaths" },
];

const MIN_PAIRS = 8;

/** Rank-transform an array with average ranks for ties (required for Spearman). */
function rankTransform(values: number[]): number[] {
  const idx = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(values.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1].v === idx[i].v) j++;
    const avgRank = (i + j) / 2 + 1; // 1-based average rank across the tie block
    for (let k = i; k <= j; k++) ranks[idx[k].i] = avgRank;
    i = j + 1;
  }
  return ranks;
}

function spearmanCorrelation(xs: number[], ys: number[]): number {
  const rx = rankTransform(xs);
  const ry = rankTransform(ys);
  return ss.sampleCorrelation(rx, ry);
}

/**
 * Find the best year for a (socioeconomic field, health outcome field) pair:
 * the year present in BOTH datasets with the most complete non-null,
 * same-year, same-state pairs. Ties broken by most recent year. Never mixes
 * rows from two different years.
 */
function findBestYear(
  socio: StateRow[],
  health: HealthOutcomeRow[],
  socioField: SocioIndicatorId,
  healthField: HealthIndicatorId
): { year: number | null; n: number } {
  const socioYears = new Set(socio.map((r) => r.year));
  const healthYears = new Set(health.map((r) => r.year));
  const commonYears = [...socioYears].filter((y) => healthYears.has(y)).sort((a, b) => b - a);

  let best: { year: number | null; n: number } = { year: null, n: 0 };
  for (const y of commonYears) {
    const socioByState = new Map(socio.filter((r) => r.year === y).map((r) => [r.state, r[socioField]]));
    const healthByState = new Map(health.filter((r) => r.year === y).map((r) => [r.state, r[healthField]]));
    let n = 0;
    for (const [state, sv] of socioByState) {
      const hv = healthByState.get(state);
      if (typeof sv === "number" && typeof hv === "number") n++;
    }
    if (n > best.n) best = { year: y, n };
  }
  return best;
}

function buildPairs(
  socio: StateRow[],
  health: HealthOutcomeRow[],
  year: number,
  socioField: SocioIndicatorId,
  healthField: HealthIndicatorId
): { state: string; x: number; y: number }[] {
  const healthByState = new Map(health.filter((r) => r.year === year).map((r) => [r.state, r[healthField]]));
  const pairs: { state: string; x: number; y: number }[] = [];
  for (const row of socio) {
    if (row.year !== year) continue;
    const x = row[socioField];
    const y = healthByState.get(row.state);
    if (typeof x === "number" && typeof y === "number") {
      pairs.push({ state: row.state, x, y });
    }
  }
  return pairs;
}

export default function SocioeconomicInequality() {
  const { data: national } = useData<NationalRow[]>("socioeconomic_national.json");
  const { data: stateData } = useData<StateRow[]>("socioeconomic_state.json");
  const { data: districtData } = useData<DistrictRow[]>("socioeconomic_district.json");
  const { data: healthState } = useData<HealthOutcomeRow[]>("health_outcomes_state.json");
  const { data: stateGeo } = useData<GeoJSON.FeatureCollection>("geo/state.geojson");

  const latestNational = useMemo(() => {
    if (!national) return null;
    return [...national].sort((a, b) => b.year - a.year)[0];
  }, [national]);

  const stateYears = useMemo(() => {
    if (!stateData) return [];
    return Array.from(new Set(stateData.map((r) => r.year))).sort((a, b) => b - a);
  }, [stateData]);

  const [rankYear, setRankYear] = useState<number | null>(null);
  const effectiveRankYear = rankYear ?? stateYears[0] ?? null;

  const [rankIndicatorId, setRankIndicatorId] = useState<SocioIndicatorId>("poverty_absolute");
  const rankIndicator = SOCIO_INDICATORS.find((i) => i.id === rankIndicatorId)!;

  const [selectedState, setSelectedState] = useState<string | null>(null);

  const stateSnapshot = useMemo(() => {
    if (!stateData || effectiveRankYear === null) return [];
    return stateData.filter((r) => r.year === effectiveRankYear);
  }, [stateData, effectiveRankYear]);

  const rankChoroplethData: ChoroplethDatum[] = useMemo(
    () =>
      stateSnapshot.map((r) => ({
        name: r.state,
        value: typeof r[rankIndicatorId] === "number" ? (r[rankIndicatorId] as number) : null,
      })),
    [stateSnapshot, rankIndicatorId]
  );

  // District-level amenities are only populated for 2022 in the source data.
  const districtAmenities2022 = useMemo(() => {
    if (!districtData) return [];
    return districtData.filter((r) => r.year === 2022 && r.sanitation_pct !== null);
  }, [districtData]);

  const worstSanitationDistricts = useMemo(() => {
    return [...districtAmenities2022]
      .filter((r) => r.sanitation_pct !== null)
      .sort((a, b) => (a.sanitation_pct as number) - (b.sanitation_pct as number))
      .slice(0, 15)
      .map((r) => ({ ...r, label: `${r.district} (${r.state})` }));
  }, [districtAmenities2022]);

  const districtTableColumns: Column[] = [
    { key: "district", label: "District" },
    { key: "state", label: "State" },
    { key: "sanitation_pct", label: "Sanitation (%)", numeric: true },
    { key: "electricity_pct", label: "Electricity (%)", numeric: true },
    { key: "piped_water_pct", label: "Piped water (%)", numeric: true },
    { key: "poverty_absolute", label: "Poverty (%)", numeric: true },
  ];

  // --- Correlation & regression ---
  const [socioIndicatorId, setSocioIndicatorId] = useState<SocioIndicatorId>("income_median");
  const [healthIndicatorId, setHealthIndicatorId] = useState<HealthIndicatorId>("crude_death_rate_per_1000");
  const socioIndicator = SOCIO_INDICATORS.find((i) => i.id === socioIndicatorId)!;
  const healthIndicator = HEALTH_INDICATORS.find((i) => i.id === healthIndicatorId)!;

  const correlationInput = useMemo(() => {
    if (!stateData || !healthState) return null;
    const { year, n } = findBestYear(stateData, healthState, socioIndicatorId, healthIndicatorId);
    if (year === null || n < MIN_PAIRS) return { year, n, pairs: [] as { state: string; x: number; y: number }[] };
    const pairs = buildPairs(stateData, healthState, year, socioIndicatorId, healthIndicatorId);
    return { year, n, pairs };
  }, [stateData, healthState, socioIndicatorId, healthIndicatorId]);

  const correlationStats = useMemo(() => {
    if (!correlationInput || correlationInput.pairs.length < MIN_PAIRS) return null;
    const { pairs } = correlationInput;
    const xs = pairs.map((p) => p.x);
    const ys = pairs.map((p) => p.y);
    // Guard against zero-variance inputs (correlation undefined).
    if (new Set(xs).size < 2 || new Set(ys).size < 2) return null;
    const pearson = ss.sampleCorrelation(xs, ys);
    const spearman = spearmanCorrelation(xs, ys);
    const regression = ss.linearRegression(pairs.map((p) => [p.x, p.y] as [number, number]));
    const line = ss.linearRegressionLine(regression);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const regressionLine = [
      { x: minX, y: line(minX) },
      { x: maxX, y: line(maxX) },
    ];
    return {
      pearson,
      spearman,
      r2: pearson * pearson,
      n: pairs.length,
      regressionLine,
      slope: regression.m,
      intercept: regression.b,
    };
  }, [correlationInput]);

  return (
    <div>
      <PageHeader
        title="Socioeconomic Inequality"
        subtitle="Income, poverty, inequality and basic amenities across Malaysia's states and districts, and how they relate to health outcomes."
      />

      <div className="space-y-8 p-6 lg:p-10">
        {/* National snapshot */}
        <section aria-labelledby="se-snapshot">
          <h2 id="se-snapshot" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            National snapshot
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <StatTile
              label="Median household income"
              value={latestNational?.income_median ? `RM ${latestNational.income_median.toLocaleString()}` : "—"}
              sublabel={latestNational ? `${latestNational.year}` : undefined}
            />
            <StatTile
              label="Absolute poverty rate"
              value={latestNational?.poverty_absolute !== null && latestNational?.poverty_absolute !== undefined ? `${latestNational.poverty_absolute}%` : "—"}
              sublabel={latestNational ? `${latestNational.year}` : undefined}
            />
            <StatTile
              label="Hardcore poverty rate"
              value={latestNational?.poverty_hardcore !== null && latestNational?.poverty_hardcore !== undefined ? `${latestNational.poverty_hardcore}%` : "—"}
              sublabel={latestNational ? `${latestNational.year}` : undefined}
            />
            <StatTile
              label="Gini coefficient"
              value={latestNational?.gini?.toFixed(3) ?? "—"}
              sublabel={latestNational ? `${latestNational.year}, income basis` : undefined}
            />
          </div>
        </section>

        {/* National time series */}
        <section aria-labelledby="se-trends">
          <h2 id="se-trends" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            National trends over time
          </h2>
          <p className="mb-3 max-w-3xl text-sm text-ink-secondary">
            Figures come from DOSM's Household Income and Expenditure Survey (HIES), which is fielded in irregular
            years (roughly every 2–3 years) — points are plotted only for years the survey was actually conducted, with
            no interpolation between them.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            {national && (
              <LineChartCard
                title="Household income (RM/month)"
                data={national.map((r) => ({ year: r.year, "Mean income": r.income_mean, "Median income": r.income_median }))}
                xKey="year"
                series={[
                  { key: "Mean income", label: "Mean income (RM)", color: "#4a3aa7" },
                  { key: "Median income", label: "Median income (RM)", color: "#2a78d6" },
                ]}
              />
            )}
            {national && (
              <LineChartCard
                title="Poverty rates (%)"
                data={national.map((r) => ({
                  year: r.year,
                  "Absolute poverty": r.poverty_absolute,
                  "Relative poverty": r.poverty_relative,
                  "Hardcore poverty": r.poverty_hardcore,
                }))}
                xKey="year"
                series={[
                  { key: "Absolute poverty", label: "Absolute poverty (%)", color: "#eb6834" },
                  { key: "Relative poverty", label: "Relative poverty (%)", color: "#eda100" },
                  { key: "Hardcore poverty", label: "Hardcore poverty (%)", color: "#e34948" },
                ]}
              />
            )}
            {national && (
              <LineChartCard
                title="Gini coefficient (income inequality)"
                data={national.map((r) => ({ year: r.year, "Gini coefficient": r.gini }))}
                xKey="year"
                series={[{ key: "Gini coefficient", label: "Gini coefficient", color: "#4a3aa7" }]}
              />
            )}
          </div>
          <SourceNote sourceKey="income" year={latestNational?.year} extra="Poverty and Gini series share the same survey years" />
        </section>

        {/* State distribution / ranking + compact map */}
        <section aria-labelledby="se-state">
          <h2 id="se-state" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            State distribution and ranking
          </h2>
          <div className="mb-4 flex flex-wrap items-end gap-4 rounded-lg border border-line-grid bg-surface p-4">
            <div>
              <label htmlFor="rank-indicator" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                Indicator
              </label>
              <select
                id="rank-indicator"
                value={rankIndicatorId}
                onChange={(e) => {
                  setRankIndicatorId(e.target.value as SocioIndicatorId);
                  setSelectedState(null);
                }}
                className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
              >
                {SOCIO_INDICATORS.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label}
                  </option>
                ))}
              </select>
            </div>
            {stateYears.length > 0 && (
              <div>
                <label htmlFor="rank-year" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Year
                </label>
                <select
                  id="rank-year"
                  value={effectiveRankYear ?? ""}
                  onChange={(e) => setRankYear(Number(e.target.value))}
                  className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
                >
                  {stateYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <BarRankingCard
              title={`${rankIndicator.label} by state — ${effectiveRankYear ?? "…"}`}
              data={stateSnapshot.filter((r) => r[rankIndicatorId] !== null)}
              nameKey="state"
              valueKey={rankIndicatorId}
              unit={rankIndicator.unit}
              color={rankIndicator.color}
              highlightWorst={rankIndicatorId !== "income_median"}
            />
            <div>
              {stateGeo ? (
                <ChoroplethMap
                  geojson={stateGeo}
                  data={rankChoroplethData}
                  nameProperty="state"
                  onSelect={setSelectedState}
                  selectedName={selectedState}
                  unitLabel={rankIndicator.unit}
                />
              ) : (
                <div className="flex h-[480px] items-center justify-center rounded-lg border border-line-grid text-sm text-ink-muted">
                  Loading map…
                </div>
              )}
              {selectedState && (
                <p className="mt-2 text-sm text-ink-secondary">
                  <span className="font-medium text-ink-primary">{selectedState}:</span>{" "}
                  {(() => {
                    const row = stateSnapshot.find((r) => r.state === selectedState);
                    const v = row?.[rankIndicatorId];
                    return typeof v === "number" ? `${v} ${rankIndicator.unit}` : "No data";
                  })()}
                </p>
              )}
            </div>
          </div>
          <SourceNote sourceKey={rankIndicator.sourceKey} year={effectiveRankYear ?? undefined} />
        </section>

        {/* District amenities */}
        <section aria-labelledby="se-amenities">
          <h2 id="se-amenities" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            District basic amenities — 2022
          </h2>
          <p className="mb-3 max-w-3xl text-sm text-ink-secondary">
            Access to sanitation, electricity and piped water is only published at district resolution for 2022 in the
            source survey — other years are not shown here rather than left implicitly zero or interpolated.
          </p>
          {districtAmenities2022.length >= MIN_PAIRS ? (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <BarRankingCard
                  title="Lowest sanitation access by district (%)"
                  data={worstSanitationDistricts}
                  nameKey="label"
                  valueKey="sanitation_pct"
                  unit="%"
                  color="#eb6834"
                  highlightWorst
                />
                <div className="rounded-lg border border-line-grid bg-surface p-4">
                  <h3 className="mb-2 text-sm font-medium text-ink-primary">All districts, 2022</h3>
                  <DataTable columns={districtTableColumns} rows={districtAmenities2022 as unknown as Record<string, unknown>[]} pageSize={12} />
                </div>
              </div>
              <SourceNote sourceKey="amenities" year={2022} />
            </>
          ) : (
            <InsufficientData reason="Fewer than 8 districts have non-null amenity figures for 2022 in the current data." />
          )}
        </section>

        {/* Correlation & regression */}
        <section aria-labelledby="se-correlation">
          <h2 id="se-correlation" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Correlation with health outcomes
          </h2>

          <div className="mb-3 rounded-md border border-status-warning bg-status-warning/10 p-3 text-sm text-ink-primary">
            <span className="font-medium">Correlation, not causation.</span> The statistics below describe a
            statistical association across Malaysian states in a single year. They do not establish that one variable
            causes the other. Confounding factors — such as urbanization, age structure, healthcare capacity and
            reporting practices — are not controlled for here.
          </div>

          <div className="mb-4 flex flex-wrap items-end gap-4 rounded-lg border border-line-grid bg-surface p-4">
            <div>
              <label htmlFor="corr-socio" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                Socioeconomic indicator (x-axis)
              </label>
              <select
                id="corr-socio"
                value={socioIndicatorId}
                onChange={(e) => setSocioIndicatorId(e.target.value as SocioIndicatorId)}
                className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
              >
                {SOCIO_INDICATORS.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="corr-health" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                Health outcome (y-axis)
              </label>
              <select
                id="corr-health"
                value={healthIndicatorId}
                onChange={(e) => setHealthIndicatorId(e.target.value as HealthIndicatorId)}
                className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
              >
                {HEALTH_INDICATORS.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!correlationInput || correlationInput.year === null || correlationInput.n < MIN_PAIRS || !correlationStats ? (
            <InsufficientData
              reason={
                correlationInput && correlationInput.year !== null
                  ? `Only ${correlationInput.n} state(s) have non-null values for both "${socioIndicator.label}" and "${healthIndicator.label}" in ${correlationInput.year} (need at least ${MIN_PAIRS}). This health indicator is not reported for all states.`
                  : `"${socioIndicator.label}" and "${healthIndicator.label}" share no common survey year with paired state-level data.`
              }
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="grid grid-cols-3 gap-3 lg:col-span-1 lg:grid-cols-1">
                <StatTile label="Pearson r" value={correlationStats.pearson.toFixed(3)} sublabel="Linear association" />
                <StatTile label="Spearman ρ" value={correlationStats.spearman.toFixed(3)} sublabel="Rank association" />
                <StatTile label="r²" value={correlationStats.r2.toFixed(3)} sublabel={`n = ${correlationStats.n} states, ${correlationInput.year}`} />
              </div>
              <div className="lg:col-span-2">
                <div className="rounded-lg border border-line-grid bg-surface p-4">
                  <h3 className="mb-2 text-sm font-medium text-ink-primary">
                    {socioIndicator.label} vs. {healthIndicator.label} — {correlationInput.year}
                  </h3>
                  <ResponsiveContainer width="100%" height={320}>
                    <ComposedChart margin={{ top: 8, right: 20, bottom: 24, left: 8 }}>
                      <CartesianGrid stroke="#e1e0d9" />
                      <XAxis
                        type="number"
                        dataKey="x"
                        name={socioIndicator.label}
                        stroke="#898781"
                        tick={{ fontSize: 11, fill: "#52514e" }}
                        tickLine={false}
                        label={{ value: `${socioIndicator.label}${socioIndicator.unit ? ` (${socioIndicator.unit})` : ""}`, position: "insideBottom", offset: -16, fontSize: 12, fill: "#52514e" }}
                      />
                      <YAxis
                        type="number"
                        dataKey="y"
                        name={healthIndicator.label}
                        stroke="#898781"
                        tick={{ fontSize: 11, fill: "#52514e" }}
                        tickLine={false}
                        axisLine={false}
                        width={56}
                        label={{ value: healthIndicator.unit, angle: -90, position: "insideLeft", fontSize: 12, fill: "#52514e" }}
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
                        data={correlationStats.regressionLine}
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
                    regression fit (y = {correlationStats.slope.toFixed(3)}x + {correlationStats.intercept.toFixed(2)}), shown to summarise the
                    linear trend only — it is descriptive, not predictive or causal.
                  </p>
                </div>
                <SourceNote sourceKey={socioIndicator.sourceKey} year={correlationInput.year} />
                <SourceNote sourceKey={healthIndicator.sourceKey} year={correlationInput.year} />
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
