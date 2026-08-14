import { useEffect, useMemo, useState } from "react";
import { useLocation, Link } from "react-router-dom";
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
import KPISummarySection from "../components/KPISummarySection";
import SourceNote from "../components/SourceNote";
import LineChartCard from "../components/LineChartCard";
import BarRankingCard from "../components/BarRankingCard";
import DataTable, { type Column, toCSV } from "../components/DataTable";
import ChoroplethMap, { type ChoroplethDatum } from "../components/ChoroplethMap";
import InsufficientData from "../components/InsufficientData";
import EquityInsightCard, { buildEquityInsight } from "../components/EquityInsightCard";
import ChartToolbar from "../components/ChartToolbar";
import { useData } from "../lib/useData";
import type { SOURCES } from "../lib/sources";
import type { Row } from "../lib/equity";
import { findBestYear, buildPairs, computeCorrelationStats, CORRELATION_MIN_PAIRS } from "../lib/correlation";
import CorrelationCaveat from "../components/CorrelationCaveat";
import { useChat, buildExplainPrompt } from "../lib/chatContext";

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

interface PercentileRow {
  year: number;
  percentile: number;
  variable: "mean" | "median" | "minimum" | "maximum";
  income_rm: number | null;
}

interface SanitationStateRow {
  state: string;
  year: number;
  sanitation_access_pct: number | null;
}

interface WaterStateRow {
  state: string;
  year: number;
  strata: string;
  water_access_pct: number | null;
}

interface WaterNationalRow {
  year: number;
  strata: string;
  water_access_pct: number | null;
}

interface SanitationNationalRow {
  year: number;
  sanitation_access_pct: number | null;
}

interface ElectricityRegionRow {
  region: string;
  year: number;
  households_with_electricity: number | null;
}

type AmenityIndicatorId = "sanitation" | "water";

const AMENITY_INDICATORS: { id: AmenityIndicatorId; label: string; unit: string; sourceKey: keyof typeof SOURCES; color: string }[] = [
  { id: "sanitation", label: "Basic sanitation access", unit: "%", sourceKey: "sanitation", color: "#1baf7a" },
  { id: "water", label: "Basic water access (overall)", unit: "%", sourceKey: "water", color: "#2a78d6" },
];

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

export default function SocioeconomicInequality() {
  const { explain } = useChat();
  const { data: national } = useData<NationalRow[]>("socioeconomic_national.json");
  const { data: stateData } = useData<StateRow[]>("socioeconomic_state.json");
  const { data: districtData } = useData<DistrictRow[]>("socioeconomic_district.json");
  const { data: healthState } = useData<HealthOutcomeRow[]>("health_outcomes_state.json");
  const { data: stateGeo } = useData<GeoJSON.FeatureCollection>("geo/state.geojson");
  const { data: percentileData } = useData<PercentileRow[]>("hies_percentile_national.json");
  const { data: sanitationState } = useData<SanitationStateRow[]>("sanitation_access_state.json");
  const { data: waterState } = useData<WaterStateRow[]>("water_access_state.json");
  const { data: waterNational } = useData<WaterNationalRow[]>("water_access_national.json");
  const { data: sanitationNational } = useData<SanitationNationalRow[]>("sanitation_access_national.json");
  const { data: electricityRegion } = useData<ElectricityRegionRow[]>("electricity_access_region.json");

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

  // Ask MHET: pre-apply a filter passed via router location state, once on mount.
  const location = useLocation();
  useEffect(() => {
    const s = location.state as { rankIndicatorId?: SocioIndicatorId } | null;
    if (s?.rankIndicatorId) setRankIndicatorId(s.rankIndicatorId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

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
    const { year, n } = findBestYear(
      stateData as unknown as Row[],
      healthState as unknown as Row[],
      socioIndicatorId,
      healthIndicatorId
    );
    if (year === null || n < CORRELATION_MIN_PAIRS) return { year, n, pairs: [] as { state: string; x: number; y: number }[] };
    const pairs = buildPairs(stateData as unknown as Row[], healthState as unknown as Row[], year, socioIndicatorId, healthIndicatorId);
    return { year, n, pairs };
  }, [stateData, healthState, socioIndicatorId, healthIndicatorId]);

  const correlationStats = useMemo(() => computeCorrelationStats(correlationInput?.pairs ?? []), [correlationInput]);

  // --- Income distribution by percentile ---
  const percentileYears = useMemo(() => {
    if (!percentileData) return [];
    return Array.from(new Set(percentileData.map((r) => r.year))).sort((a, b) => b - a);
  }, [percentileData]);

  const [percentileYear, setPercentileYear] = useState<number | null>(null);
  const effectivePercentileYear = percentileYear ?? percentileYears[0] ?? null;

  const percentileMeanRows = useMemo(() => {
    if (!percentileData || effectivePercentileYear === null) return [];
    return percentileData
      .filter((r) => r.year === effectivePercentileYear && r.variable === "mean" && r.income_rm !== null)
      .sort((a, b) => a.percentile - b.percentile);
  }, [percentileData, effectivePercentileYear]);

  // Median charted alongside mean (same RM scale, directly comparable —
  // divergence between the two is itself a skewness signal within each
  // percentile band). Minimum/maximum are ingested but deliberately not
  // charted here: they're extreme per-percentile-band values, not another
  // central-tendency measure, and would distort this chart's scale — see
  // Data Explorer for the raw minimum/maximum figures.
  const percentileMedianByPercentile = useMemo(() => {
    if (!percentileData || effectivePercentileYear === null) return new Map<number, number | null>();
    const m = new Map<number, number | null>();
    percentileData
      .filter((r) => r.year === effectivePercentileYear && r.variable === "median")
      .forEach((r) => m.set(r.percentile, r.income_rm));
    return m;
  }, [percentileData, effectivePercentileYear]);

  const percentileChartData = useMemo(
    () =>
      percentileMeanRows.map((r) => ({
        percentile: r.percentile,
        "Mean income": r.income_rm,
        "Median income": percentileMedianByPercentile.get(r.percentile) ?? null,
      })),
    [percentileMeanRows, percentileMedianByPercentile]
  );

  function avgIncomeForRange(lo: number, hi: number): number | null {
    const inRange = percentileMeanRows.filter((r) => r.percentile >= lo && r.percentile <= hi);
    if (inRange.length === 0) return null;
    return inRange.reduce((sum, r) => sum + (r.income_rm ?? 0), 0) / inRange.length;
  }

  const b40Mean = avgIncomeForRange(1, 40);
  const m40Mean = avgIncomeForRange(41, 80);
  const t20Mean = avgIncomeForRange(81, 100);

  // --- Basic amenities trend (state ranking + national urban/rural water) ---
  const [amenityIndicatorId, setAmenityIndicatorId] = useState<AmenityIndicatorId>("sanitation");
  const amenityIndicator = AMENITY_INDICATORS.find((i) => i.id === amenityIndicatorId)!;

  const sanitationYears = useMemo(() => {
    if (!sanitationState) return [];
    return Array.from(new Set(sanitationState.map((r) => r.year))).sort((a, b) => b - a);
  }, [sanitationState]);

  const waterYears = useMemo(() => {
    if (!waterState) return [];
    return Array.from(new Set(waterState.filter((r) => r.strata === "overall").map((r) => r.year))).sort((a, b) => b - a);
  }, [waterState]);

  const amenityYears = amenityIndicatorId === "sanitation" ? sanitationYears : waterYears;
  const [amenityYear, setAmenityYear] = useState<number | null>(null);
  const effectiveAmenityYear = amenityYear ?? amenityYears[0] ?? null;

  const amenitySnapshot = useMemo(() => {
    if (effectiveAmenityYear === null) return [];
    if (amenityIndicatorId === "sanitation") {
      if (!sanitationState) return [];
      return sanitationState
        .filter((r) => r.year === effectiveAmenityYear && r.sanitation_access_pct !== null)
        .map((r) => ({ state: r.state, value: r.sanitation_access_pct as number }));
    }
    if (!waterState) return [];
    return waterState
      .filter((r) => r.year === effectiveAmenityYear && r.strata === "overall" && r.water_access_pct !== null)
      .map((r) => ({ state: r.state, value: r.water_access_pct as number }));
  }, [amenityIndicatorId, effectiveAmenityYear, sanitationState, waterState]);

  const waterStrataTrendData = useMemo(() => {
    if (!waterNational) return [];
    const byYear = new Map<number, Record<string, number | null>>();
    waterNational.forEach((r) => {
      if (!byYear.has(r.year)) byYear.set(r.year, {});
      byYear.get(r.year)![r.strata] = r.water_access_pct;
    });
    return Array.from(byYear.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([yr, vals]) => ({ year: yr, ...vals }));
  }, [waterNational]);

  const sanitationNationalTrendData = useMemo(() => {
    if (!sanitationNational) return [];
    return sanitationNational
      .filter((r) => r.sanitation_access_pct !== null)
      .map((r) => ({ year: r.year, "Sanitation access": r.sanitation_access_pct }))
      .sort((a, b) => a.year - b.year);
  }, [sanitationNational]);

  const electricityLatestYear = useMemo(() => {
    if (!electricityRegion) return null;
    return Math.max(...electricityRegion.map((r) => r.year));
  }, [electricityRegion]);

  const electricityTableColumns: Column[] = [
    { key: "region", label: "Region" },
    { key: "households_with_electricity", label: "Households with electricity", numeric: true },
  ];

  return (
    <div>
      <PageHeader
        title="Socioeconomic Inequality"
        subtitle="Income, poverty, inequality and basic amenities across Malaysia's states and districts, and how they relate to health outcomes."
      />

      <div className="space-y-8 p-6 lg:p-10">
        {/* National snapshot */}
        <KPISummarySection
          title="National snapshot"
          headingId="se-snapshot"
          columns={4}
          items={[
            {
              label: "Median household income",
              value: latestNational?.income_median ? `RM ${latestNational.income_median.toLocaleString()}` : "—",
              sublabel: latestNational ? `${latestNational.year}` : undefined,
            },
            {
              label: "Absolute poverty rate",
              value:
                latestNational?.poverty_absolute !== null && latestNational?.poverty_absolute !== undefined
                  ? `${latestNational.poverty_absolute}%`
                  : "—",
              sublabel: latestNational ? `${latestNational.year}` : undefined,
            },
            {
              label: "Hardcore poverty rate",
              value:
                latestNational?.poverty_hardcore !== null && latestNational?.poverty_hardcore !== undefined
                  ? `${latestNational.poverty_hardcore}%`
                  : "—",
              sublabel: latestNational ? `${latestNational.year}` : undefined,
            },
            {
              label: "Gini coefficient",
              value: latestNational?.gini?.toFixed(3) ?? "—",
              sublabel: latestNational ? `${latestNational.year}, income basis` : undefined,
            },
          ]}
        />

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

          <EquityInsightCard
            insight={buildEquityInsight({
              rows: stateData as unknown as Row[] | null,
              year: effectiveRankYear,
              valueField: rankIndicatorId,
              metricLabel: rankIndicator.label,
              unit: rankIndicator.unit,
              higherIsWorse: rankIndicatorId !== "income_median",
            })}
            reason={`Fewer than two states report ${rankIndicator.label.toLowerCase()} for ${effectiveRankYear ?? "the selected year"}.`}
          />

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
          {districtAmenities2022.length >= CORRELATION_MIN_PAIRS ? (
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

        {/* Income distribution by percentile */}
        <section aria-labelledby="se-percentile">
          <h2 id="se-percentile" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Income distribution by percentile
          </h2>
          <p className="mb-3 max-w-3xl text-sm text-ink-secondary">
            National mean household income within each of the 100 income percentiles — a finer-grained view of
            inequality than the mean/median/Gini summary above, from the same HIES survey.
          </p>
          {percentileYears.length > 0 && (
            <div className="mb-4 flex flex-wrap items-end gap-4 rounded-lg border border-line-grid bg-surface p-4">
              <div>
                <label htmlFor="percentile-year" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Year
                </label>
                <select
                  id="percentile-year"
                  value={effectivePercentileYear ?? ""}
                  onChange={(e) => setPercentileYear(Number(e.target.value))}
                  className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
                >
                  {percentileYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <KPISummarySection
            title={`Group average income — ${effectivePercentileYear ?? "…"}`}
            headingId="se-percentile-kpis"
            columns={4}
            items={[
              { label: "B40 (percentile 1–40)", value: b40Mean !== null ? `RM ${Math.round(b40Mean).toLocaleString()}` : "—", unit: "mean, per percentile" },
              { label: "M40 (percentile 41–80)", value: m40Mean !== null ? `RM ${Math.round(m40Mean).toLocaleString()}` : "—", unit: "mean, per percentile" },
              { label: "T20 (percentile 81–100)", value: t20Mean !== null ? `RM ${Math.round(t20Mean).toLocaleString()}` : "—", unit: "mean, per percentile" },
              { label: "T20 / B40 ratio", value: b40Mean && t20Mean ? (t20Mean / b40Mean).toFixed(1) + "×" : "—", unit: "concentration" },
            ]}
          />

          {percentileChartData.length > 0 ? (
            <LineChartCard
              title={`Mean vs median income by percentile (RM/month) — ${effectivePercentileYear ?? "…"}`}
              data={percentileChartData}
              xKey="percentile"
              series={[
                { key: "Mean income", label: "Mean income (RM)", color: "#2a78d6" },
                { key: "Median income", label: "Median income (RM)", color: "#1baf7a" },
              ]}
              unit="RM"
            />
          ) : (
            <InsufficientData reason={`No percentile income data for ${effectivePercentileYear ?? "the selected year"}.`} />
          )}
          <p className="mt-2 text-xs text-ink-muted">
            This dataset also publishes minimum/maximum income per percentile band — not charted here (extreme
            values would distort this chart's scale) but available via Data Explorer.
          </p>
          <SourceNote sourceKey="hies_percentile" year={effectivePercentileYear ?? undefined} extra="National only — no state or district percentile breakdown exists" />
        </section>

        {/* Basic amenities trend (longer state series + urban/rural water) */}
        <section aria-labelledby="se-amenities-trend">
          <h2 id="se-amenities-trend" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Basic amenities — longer annual trend
          </h2>
          <p className="mb-3 max-w-3xl text-sm text-ink-secondary">
            A longer annual state-level series than the single-year (2022) district snapshot above, plus a national
            urban/rural breakdown for water access. Electricity access is shown separately below, since its source
            only reports 4 utility-operator regions rather than the 16-state schema used everywhere else.
          </p>

          <div className="mb-4 flex flex-wrap items-end gap-4 rounded-lg border border-line-grid bg-surface p-4">
            <div>
              <label htmlFor="amenity-indicator" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                Indicator
              </label>
              <select
                id="amenity-indicator"
                value={amenityIndicatorId}
                onChange={(e) => {
                  setAmenityIndicatorId(e.target.value as AmenityIndicatorId);
                  setAmenityYear(null);
                }}
                className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
              >
                {AMENITY_INDICATORS.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label}
                  </option>
                ))}
              </select>
            </div>
            {amenityYears.length > 0 && (
              <div>
                <label htmlFor="amenity-year" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Year
                </label>
                <select
                  id="amenity-year"
                  value={effectiveAmenityYear ?? ""}
                  onChange={(e) => setAmenityYear(Number(e.target.value))}
                  className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
                >
                  {amenityYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {amenitySnapshot.length > 0 ? (
              <BarRankingCard
                title={`${amenityIndicator.label} by state — ${effectiveAmenityYear ?? "…"}`}
                data={amenitySnapshot}
                nameKey="state"
                valueKey="value"
                unit={amenityIndicator.unit}
                color={amenityIndicator.color}
                highlightWorst
              />
            ) : (
              <InsufficientData reason={`No states report ${amenityIndicator.label.toLowerCase()} for ${effectiveAmenityYear ?? "the selected year"}.`} />
            )}

            {amenityIndicatorId === "sanitation" ? (
              sanitationNationalTrendData.length > 0 ? (
                <LineChartCard
                  title="Sanitation access, national trend (%)"
                  data={sanitationNationalTrendData}
                  xKey="year"
                  series={[{ key: "Sanitation access", label: "Sanitation access", color: "#1baf7a" }]}
                  unit="%"
                />
              ) : (
                <InsufficientData reason="No national sanitation access trend records available." />
              )
            ) : waterStrataTrendData.length > 0 ? (
              <LineChartCard
                title="Water access, national — urban vs. rural (%)"
                data={waterStrataTrendData}
                xKey="year"
                series={[
                  { key: "overall", label: "Overall", color: "#2a78d6" },
                  { key: "urban", label: "Urban", color: "#1baf7a" },
                  { key: "rural", label: "Rural", color: "#eb6834" },
                ]}
                unit="%"
              />
            ) : (
              <InsufficientData reason="No national urban/rural water access records available." />
            )}
          </div>
          <SourceNote sourceKey={amenityIndicator.sourceKey} year={effectiveAmenityYear ?? undefined} />

          <div className="mt-4 rounded-lg border border-line-grid bg-surface p-4">
            <h3 className="mb-1 text-sm font-medium text-ink-primary">
              Household electricity access — {electricityLatestYear ?? "…"} (by region, not comparable to the 16-state figures above)
            </h3>
            <p className="mb-2 text-xs text-ink-muted">
              This source reports raw household counts for 4 utility-operator regions (Malaysia, Semenanjung
              Malaysia, Sabah, Sarawak) rather than a percentage across the 16 states — shown here as its own table
              rather than force-joined onto the state schema used elsewhere on this page.
            </p>
            {electricityRegion && electricityLatestYear !== null ? (
              <DataTable
                columns={electricityTableColumns}
                rows={electricityRegion.filter((r) => r.year === electricityLatestYear) as unknown as Record<string, unknown>[]}
                searchable={false}
                pageSize={4}
              />
            ) : (
              <InsufficientData reason="No electricity access records available." />
            )}
            <SourceNote sourceKey="electricity" year={electricityLatestYear ?? undefined} />
          </div>
        </section>

        {/* Correlation & regression */}
        <section aria-labelledby="se-correlation">
          <h2 id="se-correlation" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Correlation with health outcomes
          </h2>

          <div className="mb-3 rounded-lg border border-line-axis bg-plane p-3 text-sm text-ink-secondary">
            Looking to explore <strong className="text-ink-primary">any</strong> determinant against{" "}
            <strong className="text-ink-primary">any</strong> health or healthcare-access outcome, not just poverty/
            income/Gini vs. mortality? The{" "}
            <Link to="/determinants" className="text-series-1 underline underline-offset-2">
              Determinants Explorer
            </Link>{" "}
            generalizes this section to the full set of socioeconomic and healthcare-access fields in this dataset.
          </div>

          <CorrelationCaveat />

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

          {!correlationInput || correlationInput.year === null || correlationInput.n < CORRELATION_MIN_PAIRS || !correlationStats ? (
            <InsufficientData
              reason={
                correlationInput && correlationInput.year !== null
                  ? `Only ${correlationInput.n} state(s) have non-null values for both "${socioIndicator.label}" and "${healthIndicator.label}" in ${correlationInput.year} (need at least ${CORRELATION_MIN_PAIRS}). This health indicator is not reported for all states.`
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
                  <ChartToolbar
                    showingTable={false}
                    onExplain={() => {
                      const cols: Column[] = [
                        { key: "state", label: "State" },
                        { key: "x", label: socioIndicator.label, numeric: true },
                        { key: "y", label: healthIndicator.label, numeric: true },
                      ];
                      const csv = toCSV(cols, correlationInput.pairs as unknown as Record<string, unknown>[]);
                      explain(
                        buildExplainPrompt(`${socioIndicator.label} vs. ${healthIndicator.label} — ${correlationInput.year}`, csv, correlationInput.pairs.length)
                      );
                    }}
                  />
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
