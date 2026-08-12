import { useMemo, useState } from "react";
import * as ss from "simple-statistics";
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
import PageHeader from "../components/PageHeader";
import StatTile from "../components/StatTile";
import SourceNote from "../components/SourceNote";
import BarRankingCard from "../components/BarRankingCard";
import DataTable, { type Column } from "../components/DataTable";
import InsufficientData from "../components/InsufficientData";
import { useData } from "../lib/useData";
import type { SOURCES } from "../lib/sources";

type Row = Record<string, unknown>;

interface SocioeconomicRow {
  state: string;
  year: number;
  income_median: number | null;
  poverty_absolute: number | null;
  poverty_hardcore: number | null;
  poverty_relative: number | null;
  gini: number | null;
}

interface PopulationRow {
  state: string;
  year: number;
  sex: string;
  population_thousands: number;
}

interface OutcomeIndicator {
  id: string;
  label: string;
  file: "health_outcomes_state.json" | "healthcare_access_state.json";
  valueField: string;
  /** Absolute-count field in the same file/year, needed for a genuine concentration curve. */
  countField?: string;
  countLabel?: string;
  unit: string;
  sourceKey: keyof typeof SOURCES;
  higherIsWorse: boolean;
  decimals: number;
}

/** Curated list of outcomes where the underlying field has usable multi-state coverage (>=12 of 16 states). */
const OUTCOME_INDICATORS: OutcomeIndicator[] = [
  {
    id: "mmr",
    label: "Maternal mortality rate",
    file: "health_outcomes_state.json",
    valueField: "maternal_mortality_rate_per_100k_births",
    countField: "maternal_deaths_abs",
    countLabel: "maternal deaths (absolute count)",
    unit: "per 100,000 live births",
    sourceKey: "maternal_deaths",
    higherIsWorse: true,
    decimals: 1,
  },
  {
    id: "cdr",
    label: "Crude death rate",
    file: "health_outcomes_state.json",
    valueField: "crude_death_rate_per_1000",
    countField: "deaths_abs",
    countLabel: "total deaths (absolute count)",
    unit: "per 1,000 population",
    sourceKey: "deaths",
    higherIsWorse: true,
    decimals: 1,
  },
  {
    id: "hiv",
    label: "HIV incidence",
    file: "health_outcomes_state.json",
    valueField: "std_hiv_incidence_per_100k",
    unit: "per 100,000 population",
    sourceKey: "std",
    higherIsWorse: true,
    decimals: 2,
  },
  {
    id: "staff",
    label: "Healthcare workforce availability",
    file: "healthcare_access_state.json",
    valueField: "staff_per_100k",
    countField: "staff_all",
    countLabel: "healthcare staff headcount (absolute count)",
    unit: "per 100,000 population",
    sourceKey: "healthcare_staff",
    higherIsWorse: false,
    decimals: 0,
  },
  {
    id: "beds",
    label: "Hospital bed availability",
    file: "healthcare_access_state.json",
    valueField: "beds_per_100k",
    countField: "hospital_beds",
    countLabel: "hospital beds (absolute count)",
    unit: "per 100,000 population",
    sourceKey: "hospital_beds",
    higherIsWorse: false,
    decimals: 0,
  },
];

/** Indicators eligible for the socioeconomic-gradient sections (need a real absolute-count field). */
const SES_INDICATORS = OUTCOME_INDICATORS.filter((i) => i.countField);

/** Two more outcomes shown alongside the user-selected headline outcome in the "rate ratio" section. */
const GAP_SECONDARY_IDS = ["mmr", "cdr", "hiv"];

function fmt(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Years where at least `minStates` of the 16 states report a non-null value for this field. */
function yearsWithCoverage(rows: Row[] | null, valueField: string, minStates = 12): number[] {
  if (!rows) return [];
  const counts = new Map<number, number>();
  for (const r of rows) {
    const y = r.year as number;
    const v = r[valueField];
    if (typeof v === "number") counts.set(y, (counts.get(y) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, c]) => c >= minStates)
    .map(([y]) => y)
    .sort((a, b) => b - a);
}

interface GapStats {
  snapshot: { state: string; value: number }[];
  bestState: string;
  bestValue: number;
  worstState: string;
  worstValue: number;
  absDiff: number;
  /** highest value / lowest value; null if the lowest value is 0 (undefined ratio). */
  ratio: number | null;
  statesCount: number;
}

/** Measures 1-3 from the spec: absolute difference and relative ratio between the best and worst state. */
function computeGapStats(rows: Row[] | null, year: number | null, valueField: string, higherIsWorse: boolean): GapStats | null {
  if (!rows || year === null) return null;
  const snapshot = rows
    .filter((r) => r.year === year)
    .map((r) => ({ state: r.state as string, value: r[valueField] }))
    .filter((r): r is { state: string; value: number } => typeof r.value === "number")
    .sort((a, b) => a.value - b.value);
  if (snapshot.length < 2) return null;
  const lowest = snapshot[0];
  const highest = snapshot[snapshot.length - 1];
  const bestState = higherIsWorse ? lowest.state : highest.state;
  const bestValue = higherIsWorse ? lowest.value : highest.value;
  const worstState = higherIsWorse ? highest.state : lowest.state;
  const worstValue = higherIsWorse ? highest.value : lowest.value;
  return {
    snapshot,
    bestState,
    bestValue,
    worstState,
    worstValue,
    absDiff: highest.value - lowest.value,
    ratio: lowest.value !== 0 ? highest.value / lowest.value : null,
    statesCount: snapshot.length,
  };
}

interface MergedRow {
  state: string;
  outcome: number;
  count: number | null;
  poverty: number;
  populationThousands: number;
}

/** Joins the chosen outcome with poverty (SES ranking variable) and population (weights) for one year. */
function buildMergedRows(
  outcomeRows: Row[] | null,
  cfg: OutcomeIndicator,
  socioeconomic: SocioeconomicRow[] | null,
  population: PopulationRow[] | null,
  year: number | null
): MergedRow[] {
  if (!outcomeRows || !socioeconomic || !population || year === null) return [];
  const seByState = new Map(socioeconomic.filter((r) => r.year === year).map((r) => [r.state, r]));
  const popByState = new Map(
    population.filter((r) => r.year === year && r.sex === "overall").map((r) => [r.state, r.population_thousands])
  );
  const merged: MergedRow[] = [];
  for (const r of outcomeRows.filter((r) => r.year === year)) {
    const state = r.state as string;
    const outcomeVal = r[cfg.valueField];
    if (typeof outcomeVal !== "number") continue;
    const se = seByState.get(state);
    const poverty = se ? se.poverty_absolute : null;
    if (poverty === null || poverty === undefined) continue;
    const pop = popByState.get(state);
    if (typeof pop !== "number" || pop <= 0) continue;
    const countVal = cfg.countField ? r[cfg.countField] : undefined;
    merged.push({
      state,
      outcome: outcomeVal,
      count: typeof countVal === "number" ? countVal : null,
      poverty,
      populationThousands: pop,
    });
  }
  return merged;
}

/**
 * Population-weighted relative rank (Mackenbach & Kunst midpoint-rank method): states are ordered from
 * most disadvantaged (highest poverty rate, rank -> 0) to least disadvantaged (lowest poverty rate, rank -> 1),
 * and each state's rank is the midpoint of its slice of the cumulative population distribution.
 */
function assignRanks<T extends { poverty: number; populationThousands: number }>(rows: T[]): (T & { rank: number })[] {
  const sorted = [...rows].sort((a, b) => b.poverty - a.poverty);
  const totalPop = sorted.reduce((s, r) => s + r.populationThousands, 0);
  let cum = 0;
  return sorted.map((r) => {
    const w = r.populationThousands / totalPop;
    const rank = cum + w / 2;
    cum += w;
    return { ...r, rank };
  });
}

interface SIIResult {
  intercept: number; // predicted outcome at rank 0 (most disadvantaged)
  slope: number; // SII: predicted outcome at rank 1 minus predicted outcome at rank 0
  rii: number | null; // predicted(rank 1) / predicted(rank 0)
  correlation: number | null; // unweighted Pearson r, poverty vs outcome, shown for reference only
  n: number;
}

/** Real population-weighted linear regression of outcome on relative rank (measure 4: SII / RII). */
function computeSII(rows: MergedRow[]): SIIResult | null {
  if (rows.length < 6) return null;
  const ranked = assignRanks(rows);
  const totalW = ranked.reduce((s, r) => s + r.populationThousands, 0);
  const xbar = ranked.reduce((s, r) => s + r.populationThousands * r.rank, 0) / totalW;
  const ybar = ranked.reduce((s, r) => s + r.populationThousands * r.outcome, 0) / totalW;
  const num = ranked.reduce((s, r) => s + r.populationThousands * (r.rank - xbar) * (r.outcome - ybar), 0);
  const den = ranked.reduce((s, r) => s + r.populationThousands * (r.rank - xbar) ** 2, 0);
  if (den === 0) return null;
  const slope = num / den;
  const intercept = ybar - slope * xbar;
  const rii = intercept !== 0 ? (intercept + slope) / intercept : null;
  let correlation: number | null = null;
  if (ranked.length >= 2) {
    const povertyVals = ranked.map((r) => r.poverty);
    const outcomeVals = ranked.map((r) => r.outcome);
    const spreadPoverty = new Set(povertyVals).size > 1;
    const spreadOutcome = new Set(outcomeVals).size > 1;
    correlation = spreadPoverty && spreadOutcome ? ss.sampleCorrelation(povertyVals, outcomeVals) : null;
  }
  return { intercept, slope, rii, correlation, n: ranked.length };
}

interface ConcentrationResult {
  index: number;
  curve: { x: number; curve: number; equality: number }[];
  n: number;
}

/** Measure 5: concentration index, computed from real absolute counts and real population weights. */
function computeConcentration(rows: MergedRow[]): ConcentrationResult | null {
  const eligible = rows.filter((r): r is MergedRow & { count: number } => r.count !== null);
  if (eligible.length < 6) return null;
  const ranked = assignRanks(eligible);
  const totalPop = ranked.reduce((s, r) => s + r.populationThousands, 0);
  const totalCount = ranked.reduce((s, r) => s + r.count, 0);
  if (totalCount === 0) return null;
  let X = 0;
  let Y = 0;
  let ciSum = 0;
  const curve: { x: number; curve: number; equality: number }[] = [{ x: 0, curve: 0, equality: 0 }];
  for (const r of ranked) {
    const xi = X + r.populationThousands / totalPop;
    const yi = Y + r.count / totalCount;
    ciSum += (xi - X) * (yi + Y);
    X = xi;
    Y = yi;
    const xPct = Math.round(xi * 1000) / 10;
    const yPct = Math.round(yi * 1000) / 10;
    curve.push({ x: xPct, curve: yPct, equality: xPct });
  }
  return { index: 1 - ciSum, curve, n: ranked.length };
}

function ciInterpretation(ind: OutcomeIndicator, ci: number): string {
  if (Math.abs(ci) < 0.01) {
    return `Value is close to zero: ${ind.label.toLowerCase()} is distributed close to in proportion to population, regardless of state poverty rank.`;
  }
  const concentratedAmongPoor = ci < 0;
  if (ind.higherIsWorse) {
    return concentratedAmongPoor
      ? `Negative value: the burden of ${ind.label.toLowerCase()} is disproportionately concentrated among the more disadvantaged (higher-poverty) states.`
      : `Positive value: the burden of ${ind.label.toLowerCase()} is disproportionately concentrated among the less disadvantaged (lower-poverty) states.`;
  }
  return concentratedAmongPoor
    ? `Negative value: ${ind.label.toLowerCase()} is disproportionately concentrated among the more disadvantaged (higher-poverty) states — a "pro-poor" distribution of this resource.`
    : `Positive value: ${ind.label.toLowerCase()} is disproportionately concentrated among the less disadvantaged (lower-poverty) states — a "pro-rich" distribution, which is a form of health-system inequity even though a higher value of this indicator is normally desirable.`;
}

export default function InequalityAnalytics() {
  const { data: healthOutcomes } = useData<Row[]>("health_outcomes_state.json");
  const { data: healthcareAccess } = useData<Row[]>("healthcare_access_state.json");
  const { data: socioeconomic } = useData<SocioeconomicRow[]>("socioeconomic_state.json");
  const { data: population } = useData<PopulationRow[]>("population_state.json");

  // Section: absolute & relative gap
  const [primaryId, setPrimaryId] = useState("mmr");
  const [primaryYear, setPrimaryYear] = useState<number | null>(null);
  const primary = OUTCOME_INDICATORS.find((i) => i.id === primaryId) ?? OUTCOME_INDICATORS[0];
  const primaryRows = (primary.file === "health_outcomes_state.json" ? healthOutcomes : healthcareAccess) ?? null;
  const primaryYears = useMemo(() => yearsWithCoverage(primaryRows, primary.valueField), [primaryRows, primary]);
  const effectivePrimaryYear = primaryYear ?? primaryYears[0] ?? null;
  const gapStats = useMemo(
    () => computeGapStats(primaryRows, effectivePrimaryYear, primary.valueField, primary.higherIsWorse),
    [primaryRows, effectivePrimaryYear, primary]
  );
  const secondaryIndicators = OUTCOME_INDICATORS.filter((i) => GAP_SECONDARY_IDS.includes(i.id) && i.id !== primaryId);

  // Sections: socioeconomic gradient (SII/RII) and concentration index share the same selection
  const [sesId, setSesId] = useState("mmr");
  const [sesYear, setSesYear] = useState(2022);
  const sesIndicator = SES_INDICATORS.find((i) => i.id === sesId) ?? SES_INDICATORS[0];
  const sesRows = (sesIndicator.file === "health_outcomes_state.json" ? healthOutcomes : healthcareAccess) ?? null;
  const mergedRows = useMemo(
    () => buildMergedRows(sesRows, sesIndicator, socioeconomic, population, sesYear),
    [sesRows, sesIndicator, socioeconomic, population, sesYear]
  );
  const siiResult = useMemo(() => computeSII(mergedRows), [mergedRows]);
  const ciResult = useMemo(() => computeConcentration(mergedRows), [mergedRows]);

  const rankedTableRows = useMemo(() => {
    return assignRanks(mergedRows)
      .sort((a, b) => a.rank - b.rank)
      .map((r) => ({
        state: r.state,
        poverty_pct: r.poverty,
        population_thousands: Math.round(r.populationThousands * 10) / 10,
        relative_rank: Math.round(r.rank * 1000) / 1000,
        outcome_value: Math.round(r.outcome * 10 ** sesIndicator.decimals) / 10 ** sesIndicator.decimals,
      }));
  }, [mergedRows, sesIndicator]);

  const tableColumns: Column[] = [
    { key: "state", label: "State" },
    { key: "poverty_pct", label: "Poverty rate (%)", numeric: true },
    { key: "population_thousands", label: "Population ('000)", numeric: true },
    { key: "relative_rank", label: "Relative rank (0=most disadvantaged)", numeric: true },
    { key: "outcome_value", label: sesIndicator.label, numeric: true },
  ];

  return (
    <div>
      <PageHeader
        title="Inequality Analytics"
        subtitle="Recognized health-inequality measures, applied only where this dashboard's real state-level data meets each measure's statistical assumptions."
      />

      <div className="space-y-8 p-6 lg:p-10">
        {/* Persistent methodology callout */}
        <div className="rounded-lg border border-line-axis bg-plane p-4 text-sm text-ink-secondary">
          <p className="font-medium text-ink-primary">How to read this page</p>
          <p className="mt-1.5 max-w-4xl leading-relaxed">
            Every measure below compares whole <strong>states</strong> to one another — these are between-state
            (ecological) inequality measures, not measures of who within a state is affected, and they describe
            statistical association, not causation. A gap between the richest and poorest state does not by itself
            prove that poverty causes worse health outcomes. This page only presents a recognized inequality measure
            where the underlying real government data can support it; where a textbook measure would require data
            this pipeline does not have (e.g. individual- or district-level microdata), that is stated explicitly
            rather than approximated and mislabelled. See the{" "}
            <a href="#/methodology" className="text-series-1 underline underline-offset-2">
              Methodology
            </a>{" "}
            page for full data provenance and limitations.
          </p>
        </div>

        {/* Absolute & relative gap */}
        <section aria-labelledby="gap-section">
          <h2 id="gap-section" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Absolute & relative gap between states
          </h2>

          <div className="mb-4 flex flex-wrap items-end gap-4 rounded-lg border border-line-grid bg-surface p-4">
            <div>
              <label htmlFor="gap-indicator" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                Indicator
              </label>
              <select
                id="gap-indicator"
                value={primaryId}
                onChange={(e) => {
                  setPrimaryId(e.target.value);
                  setPrimaryYear(null);
                }}
                className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
              >
                {OUTCOME_INDICATORS.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label}
                  </option>
                ))}
              </select>
            </div>
            {primaryYears.length > 0 && (
              <div>
                <label htmlFor="gap-year" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Year
                </label>
                <select
                  id="gap-year"
                  value={effectivePrimaryYear ?? ""}
                  onChange={(e) => setPrimaryYear(Number(e.target.value))}
                  className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
                >
                  {primaryYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <p className="ml-auto max-w-md text-xs text-ink-muted">
              Only years where at least 12 of 16 states report this indicator are offered, so the comparison is not
              distorted by states silently missing from the source data. Indicators published for only a handful of
              states (e.g. infant, neonatal, perinatal or under-5 mortality — 5-6 of 16 states in this pipeline) are
              intentionally excluded from this selector rather than shown as an unreliable 16-state ranking.
            </p>
          </div>

          {!gapStats ? (
            <InsufficientData
              reason={`Fewer than two states report ${primary.label.toLowerCase()} for any common year in this dataset.`}
            />
          ) : (
            <>
              <div className="mb-3 rounded-md border border-line-axis bg-plane p-3 text-xs leading-relaxed text-ink-secondary">
                <strong className="text-ink-primary">Methodology — absolute & relative difference.</strong> Absolute
                difference = highest state value − lowest state value. Relative ratio = highest state value ÷ lowest
                state value. Both are always computable once at least two states report a value for the chosen year.
                For this indicator, {primary.higherIsWorse ? "a higher value reflects a worse outcome" : "a higher value reflects a better outcome"}, so
                the "best"/"worst" labels below are assigned accordingly rather than by raw magnitude alone.
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile
                  label="Best-performing state"
                  value={gapStats.bestState}
                  sublabel={`${fmt(gapStats.bestValue, primary.decimals)} ${primary.unit}`}
                />
                <StatTile
                  label="Worst-performing state"
                  value={gapStats.worstState}
                  sublabel={`${fmt(gapStats.worstValue, primary.decimals)} ${primary.unit}`}
                />
                <StatTile
                  label="Absolute difference"
                  value={fmt(gapStats.absDiff, primary.decimals)}
                  unit={primary.unit}
                  sublabel="Highest − lowest state value"
                />
                <StatTile
                  label="Relative ratio"
                  value={gapStats.ratio !== null ? `${fmt(gapStats.ratio, 2)}×` : "—"}
                  sublabel={
                    gapStats.ratio !== null
                      ? `Highest ÷ lowest, ${gapStats.statesCount} states compared`
                      : "Undefined — the lowest state value is 0"
                  }
                />
              </div>
              <div className="mt-4">
                <BarRankingCard
                  title={`${primary.label} by state, ${effectivePrimaryYear}`}
                  data={gapStats.snapshot}
                  nameKey="state"
                  valueKey="value"
                  unit={primary.unit}
                  color="#2a78d6"
                  highlightWorst={primary.higherIsWorse}
                />
              </div>
              <p className="mt-2 max-w-3xl text-xs text-ink-muted">
                {primary.higherIsWorse
                  ? "The bar highlighted in red is the state with the highest value — the most disadvantaged state for this indicator."
                  : `A higher value is better for this indicator, so the ranking is not colour-flagged; the most disadvantaged state is the one with the lowest value (${gapStats.worstState}).`}
              </p>
              <SourceNote sourceKey={primary.sourceKey} year={effectivePrimaryYear ?? undefined} />
            </>
          )}
        </section>

        {/* Rate ratio / rate difference across other outcomes */}
        <section aria-labelledby="rate-ratio-section">
          <h2 id="rate-ratio-section" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Rate ratio & rate difference — additional outcomes
          </h2>
          <p className="mb-3 max-w-3xl text-sm text-ink-secondary">
            The same absolute-difference and ratio calculation, applied to health outcomes not currently selected
            above, so the page demonstrates more than one measure. Each panel uses that outcome's own most recent
            year with full state coverage.
          </p>
          {secondaryIndicators.length === 0 ? (
            <InsufficientData reason="All comparable outcomes are already shown as the headline indicator above." />
          ) : (
            <div className={`grid gap-4 ${secondaryIndicators.length >= 2 ? "lg:grid-cols-2" : ""}`}>
              {secondaryIndicators.map((ind) => {
                const rows = (ind.file === "health_outcomes_state.json" ? healthOutcomes : healthcareAccess) ?? null;
                const years = yearsWithCoverage(rows, ind.valueField);
                const year = years[0] ?? null;
                const stats = computeGapStats(rows, year, ind.valueField, ind.higherIsWorse);
                return (
                  <div key={ind.id} className="rounded-lg border border-line-grid bg-surface p-4">
                    <h3 className="mb-2 text-sm font-medium text-ink-primary">
                      {ind.label} — {year ?? "no common year"}
                    </h3>
                    {!stats ? (
                      <InsufficientData reason={`Not enough states report ${ind.label.toLowerCase()} for a common year.`} />
                    ) : (
                      <>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <div className="text-xs text-ink-muted">Absolute difference</div>
                            <div className="font-semibold tabular-nums text-ink-primary">
                              {fmt(stats.absDiff, ind.decimals)} {ind.unit}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-ink-muted">Ratio (highest ÷ lowest)</div>
                            <div className="font-semibold tabular-nums text-ink-primary">
                              {stats.ratio !== null ? `${fmt(stats.ratio, 2)}×` : "—"}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs text-ink-muted">Worst-performing state</div>
                            <div className="text-ink-primary">{stats.worstState}</div>
                          </div>
                          <div>
                            <div className="text-xs text-ink-muted">Best-performing state</div>
                            <div className="text-ink-primary">{stats.bestState}</div>
                          </div>
                        </div>
                        <div className="mt-3">
                          <BarRankingCard
                            data={stats.snapshot}
                            nameKey="state"
                            valueKey="value"
                            unit={ind.unit}
                            color="#eb6834"
                            highlightWorst={ind.higherIsWorse}
                            height={220}
                          />
                        </div>
                        <SourceNote sourceKey={ind.sourceKey} year={year ?? undefined} />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Socioeconomic gradient: SII / RII */}
        <section aria-labelledby="sii-section">
          <h2 id="sii-section" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Socioeconomic gradient — Slope & Relative Index of Inequality
          </h2>
          <div className="mb-3 rounded-md border border-line-axis bg-plane p-3 text-xs leading-relaxed text-ink-secondary">
            <strong className="text-ink-primary">Methodology — SII & RII.</strong> States are ranked by their DOSM
            absolute poverty rate and each is assigned a "relative rank" between 0 (most disadvantaged / highest
            poverty) and 1 (least disadvantaged / lowest poverty), using its share of the national population from{" "}
            <code>population_state.json</code> (the standard Mackenbach–Kunst population-weighted midpoint-rank
            method). A population-weighted linear regression of the outcome on that rank is then fitted across all
            16 states. <strong>SII</strong> is the regression slope: the modelled absolute gap in the outcome
            between the least- and most-disadvantaged end of the poverty distribution. <strong>RII</strong> is the
            ratio of the predicted outcome at the least-disadvantaged end to the most-disadvantaged end. This is a
            genuine population-weighted regression, not a simplified/unweighted approximation — but it is still an
            <em> ecological</em> measure built from 16 state-level aggregates, not individual-level microdata, so it
            describes the between-state gradient, not within-state inequality, and should be read as indicative
            given the small number of units.
          </div>

          <div className="mb-4 flex flex-wrap items-end gap-4 rounded-lg border border-line-grid bg-surface p-4">
            <div>
              <label htmlFor="ses-indicator" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                Outcome
              </label>
              <select
                id="ses-indicator"
                value={sesId}
                onChange={(e) => setSesId(e.target.value)}
                className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
              >
                {SES_INDICATORS.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ses-year" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                Year
              </label>
              <select
                id="ses-year"
                value={sesYear}
                onChange={(e) => setSesYear(Number(e.target.value))}
                className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
              >
                <option value={2022}>2022</option>
                <option value={2020}>2020</option>
              </select>
            </div>
            <p className="ml-auto max-w-md text-xs text-ink-muted">
              Restricted to 2020 and 2022 — the only years where health outcomes, poverty (
              <code>socioeconomic_state.json</code>) and population (<code>population_state.json</code>) are all
              published for the same states. This selection is shared with the concentration index below.
            </p>
          </div>

          {!siiResult ? (
            <InsufficientData
              reason={`Fewer than 6 states have complete ${sesIndicator.label.toLowerCase()}, poverty and population data for ${sesYear} (${mergedRows.length} available) — the weighted regression is omitted rather than run on too few units.`}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile
                  label="Slope Index of Inequality (SII)"
                  value={`${siiResult.slope >= 0 ? "+" : ""}${fmt(siiResult.slope, sesIndicator.decimals)}`}
                  unit={sesIndicator.unit}
                  sublabel="Modelled gap: least- minus most-disadvantaged"
                />
                <StatTile
                  label="Relative Index of Inequality (RII)"
                  value={siiResult.rii !== null ? fmt(siiResult.rii, 2) : "—"}
                  sublabel={
                    siiResult.rii !== null
                      ? "Least-disadvantaged ÷ most-disadvantaged, modelled"
                      : "Undefined — modelled value at most-disadvantaged end is 0"
                  }
                />
                <StatTile
                  label="Unweighted Pearson r"
                  value={siiResult.correlation !== null ? fmt(siiResult.correlation, 2) : "—"}
                  sublabel="Poverty rate vs. outcome, reference only (not population-weighted)"
                />
                <StatTile label="States in regression" value={String(siiResult.n)} unit="of 16" sublabel={`${sesYear}`} />
              </div>
              <p className="mt-2 max-w-3xl text-xs text-ink-secondary">
                {sesIndicator.higherIsWorse
                  ? siiResult.slope < 0
                    ? `A negative SII means less-disadvantaged (lower-poverty) states are modelled to have a lower ${sesIndicator.label.toLowerCase()} than more-disadvantaged states — the burden is concentrated among poorer states.`
                    : `A positive SII here means less-disadvantaged states are modelled to have a higher ${sesIndicator.label.toLowerCase()} than more-disadvantaged states.`
                  : siiResult.slope > 0
                    ? `A positive SII means less-disadvantaged (lower-poverty) states are modelled to have greater ${sesIndicator.label.toLowerCase()} than more-disadvantaged states — access is skewed toward richer states.`
                    : `A negative SII here means access is skewed toward poorer states.`}
              </p>
              <div className="mt-4">
                <DataTable columns={tableColumns} rows={rankedTableRows} searchable={false} pageSize={16} />
              </div>
              <SourceNote
                sourceKey={sesIndicator.sourceKey}
                year={sesYear}
                extra="Ranking variable: DOSM absolute poverty rate by state; weights: DOSM state population"
              />
            </>
          )}
        </section>

        {/* Concentration index */}
        <section aria-labelledby="ci-section">
          <h2 id="ci-section" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Concentration index
          </h2>
          <div className="mb-3 rounded-md border border-line-axis bg-plane p-3 text-xs leading-relaxed text-ink-secondary">
            <strong className="text-ink-primary">Methodology — concentration index.</strong> Using the same outcome
            and year selected above, states are ranked from most disadvantaged (highest poverty rate) to least
            disadvantaged (lowest poverty rate). The concentration curve plots the cumulative share of the national
            population (x-axis) against the cumulative share of the underlying{" "}
            <strong>{sesIndicator.countLabel ?? "absolute count"}</strong> (y-axis) as states are added in that
            order. If the curve sits exactly on the 45° line of equality, the indicator is distributed exactly in
            proportion to population regardless of poverty rank. The index itself is{" "}
            <code>CI = 1 − Σ(Xᵢ−Xᵢ₋₁)(Yᵢ+Yᵢ₋₁)</code>, the standard trapezoidal-area formula computed directly from
            this curve (range −1 to +1). This uses real published absolute counts and real population weights, not
            a rate-based approximation — but like SII/RII above, it is a state-level (ecological) measure across
            only 16 units, so treat the value as indicative rather than precise.
          </div>

          {!ciResult ? (
            <InsufficientData
              reason={`${sesIndicator.label} does not have a published absolute-count field with enough state coverage for ${sesYear}, so a concentration index is omitted rather than approximated from the rate alone.`}
            />
          ) : (
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-lg border border-line-grid bg-surface p-4 lg:col-span-2">
                <h3 className="mb-2 text-sm font-medium text-ink-primary">
                  Concentration curve — {sesIndicator.label}, {sesYear}
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={ciResult.curve} margin={{ top: 8, right: 12, bottom: 20, left: 0 }}>
                    <CartesianGrid stroke="#e1e0d9" vertical={false} />
                    <XAxis
                      dataKey="x"
                      type="number"
                      domain={[0, 100]}
                      unit="%"
                      stroke="#898781"
                      tick={{ fontSize: 11, fill: "#52514e" }}
                      tickLine={false}
                      label={{
                        value: "Cumulative population share (poorest → richest state)",
                        position: "insideBottom",
                        offset: -8,
                        fontSize: 11,
                        fill: "#52514e",
                      }}
                    />
                    <YAxis
                      domain={[0, 100]}
                      unit="%"
                      stroke="#898781"
                      tick={{ fontSize: 11, fill: "#52514e" }}
                      tickLine={false}
                      axisLine={false}
                      width={44}
                    />
                    <Tooltip
                      contentStyle={{ fontSize: 12, border: "1px solid #e1e0d9", borderRadius: 6 }}
                      formatter={(v) => [`${v}%`, ""]}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="linear" dataKey="curve" name="Concentration curve" stroke="#4a3aa7" strokeWidth={2} dot={{ r: 3 }} />
                    <Line
                      type="linear"
                      dataKey="equality"
                      name="Line of equality"
                      stroke="#898781"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
                <SourceNote sourceKey={sesIndicator.sourceKey} year={sesYear} />
              </div>
              <div className="space-y-3">
                <StatTile
                  label="Concentration Index"
                  value={fmt(ciResult.index, 3)}
                  sublabel="Range −1 to +1; 0 = distributed exactly in proportion to population"
                />
                <p className="text-xs leading-relaxed text-ink-secondary">{ciInterpretation(sesIndicator, ciResult.index)}</p>
                <p className="text-xs text-ink-muted">Computed from {ciResult.n} of 16 states with complete data for {sesYear}.</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
