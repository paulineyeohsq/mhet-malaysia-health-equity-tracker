import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
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
import DataTable, { type Column, toCSV } from "../components/DataTable";
import InsufficientData from "../components/InsufficientData";
import MetadataPanel from "../components/MetadataPanel";
import ChartToolbar from "../components/ChartToolbar";
import Term from "../components/Term";
import { useData } from "../lib/useData";
import { useChat, buildExplainPrompt } from "../lib/chatContext";
import type { SOURCES } from "../lib/sources";
import { computeGapStats, computeAverage, yearsWithCoverage, fmt, type Row } from "../lib/equity";
import { MALAYSIA_STATES } from "../lib/geoConstants";
import { INVENTORY_MAP } from "../lib/inventoryMap";
import { isSmallCount, SMALL_COUNT_CAUTION_TEXT } from "../lib/reliability";

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
  const { explain } = useChat();
  const { data: healthOutcomes } = useData<Row[]>("health_outcomes_state.json");
  const { data: healthcareAccess } = useData<Row[]>("healthcare_access_state.json");
  const { data: socioeconomic } = useData<SocioeconomicRow[]>("socioeconomic_state.json");
  const { data: population } = useData<PopulationRow[]>("population_state.json");

  // Section: absolute & relative gap
  const [primaryId, setPrimaryId] = useState("mmr");
  const [primaryYear, setPrimaryYear] = useState<number | null>(null);

  // Ask MHET: pre-apply a filter passed via router location state, once on mount.
  const location = useLocation();
  useEffect(() => {
    const s = location.state as { primaryId?: string } | null;
    if (s?.primaryId) setPrimaryId(s.primaryId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);
  const primary = OUTCOME_INDICATORS.find((i) => i.id === primaryId) ?? OUTCOME_INDICATORS[0];
  const primaryRows = (primary.file === "health_outcomes_state.json" ? healthOutcomes : healthcareAccess) ?? null;
  const primaryYears = useMemo(() => yearsWithCoverage(primaryRows, primary.valueField), [primaryRows, primary]);
  const effectivePrimaryYear = primaryYear ?? primaryYears[0] ?? null;
  const gapStats = useMemo(
    () => computeGapStats(primaryRows, effectivePrimaryYear, primary.valueField, primary.higherIsWorse),
    [primaryRows, effectivePrimaryYear, primary]
  );
  const secondaryIndicators = OUTCOME_INDICATORS.filter((i) => GAP_SECONDARY_IDS.includes(i.id) && i.id !== primaryId);

  // "Auto" mode shows the best/worst state for this indicator (gapStats above);
  // "states" mode lets the researcher pick exactly the two states they want to
  // compare, rather than always seeing the two extremes.
  const [compareMode, setCompareMode] = useState<"auto" | "states">("auto");
  const [compareStateA, setCompareStateA] = useState("Kelantan");
  const [compareStateB, setCompareStateB] = useState("Selangor");

  const twoStateComparison = useMemo(() => {
    if (!primaryRows || effectivePrimaryYear === null) return null;
    const rowA = primaryRows.find((r) => r.state === compareStateA && r.year === effectivePrimaryYear);
    const rowB = primaryRows.find((r) => r.state === compareStateB && r.year === effectivePrimaryYear);
    const valueA = rowA?.[primary.valueField];
    const valueB = rowB?.[primary.valueField];
    if (typeof valueA !== "number" || typeof valueB !== "number") return null;
    const [lower, higher] = valueA <= valueB ? [valueA, valueB] : [valueB, valueA];
    return {
      valueA,
      valueB,
      absDiff: Math.abs(valueA - valueB),
      ratio: lower !== 0 ? higher / lower : null,
    };
  }, [primaryRows, effectivePrimaryYear, compareStateA, compareStateB, primary]);

  // Equity gap summary table: every OUTCOME_INDICATORS field at once, each
  // computed against a user-chosen reference (national average / best state /
  // a specific named state) rather than always "highest vs lowest."
  type ReferenceMode = "average" | "best" | "specific";
  const [referenceMode, setReferenceMode] = useState<ReferenceMode>("average");
  const [referenceState, setReferenceState] = useState<string>(MALAYSIA_STATES[0]);

  const gapSummaryRows = useMemo(() => {
    return OUTCOME_INDICATORS.map((ind) => {
      const rows = (ind.file === "health_outcomes_state.json" ? healthOutcomes : healthcareAccess) ?? null;
      const years = yearsWithCoverage(rows, ind.valueField);
      const year = years[0] ?? null;
      const stats = computeGapStats(rows, year, ind.valueField, ind.higherIsWorse);
      if (!stats || year === null) {
        return { indicator: ind, year, available: false as const };
      }

      let referenceValue: number | null = null;
      let referenceLabel = "";
      if (referenceMode === "average") {
        const avg = computeAverage(rows, year, ind.valueField);
        referenceValue = avg?.mean ?? null;
        referenceLabel = avg ? `Malaysia average (n=${avg.n})` : "Malaysia average";
      } else if (referenceMode === "best") {
        referenceValue = stats.bestValue;
        referenceLabel = `${stats.bestState} (best)`;
      } else {
        const row = rows?.find((r) => r.state === referenceState && r.year === year);
        const v = row ? row[ind.valueField] : undefined;
        referenceValue = typeof v === "number" ? v : null;
        referenceLabel = referenceState;
      }
      if (referenceValue === null) {
        return { indicator: ind, year, available: false as const };
      }

      const groupValue = stats.worstValue;
      const absDiff = Math.abs(groupValue - referenceValue);
      const ratio =
        referenceValue !== 0 && groupValue !== 0
          ? Math.max(groupValue, referenceValue) / Math.min(groupValue, referenceValue)
          : null;
      return {
        indicator: ind,
        year,
        available: true as const,
        groupLabel: stats.worstState,
        groupValue,
        referenceLabel,
        referenceValue,
        absDiff,
        ratio,
      };
    });
  }, [healthOutcomes, healthcareAccess, referenceMode, referenceState]);

  const gapSummaryColumns: Column[] = [
    { key: "outcome", label: "Health outcome" },
    { key: "group_area", label: "Group/area" },
    { key: "reference_area", label: "Reference group/area" },
    { key: "absolute_gap", label: "Absolute gap" },
    { key: "relative_gap", label: "Relative gap" },
  ];

  const gapSummaryTableRows = gapSummaryRows.map((r) =>
    r.available
      ? {
          outcome: `${r.indicator.label} (${r.year})`,
          group_area: r.groupLabel,
          reference_area: r.referenceLabel,
          absolute_gap: `${fmt(r.absDiff, r.indicator.decimals)} ${r.indicator.unit}`,
          relative_gap: r.ratio !== null ? `${fmt(r.ratio, 2)}×` : "Undefined (0 value)",
        }
      : {
          outcome: r.indicator.label,
          group_area: null,
          reference_area: null,
          absolute_gap: "Insufficient data",
          relative_gap: "Insufficient data",
        }
  );

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
        title="Equity Gap Analysis"
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

        {/* Equity gap summary — all outcomes at once, against a chosen reference */}
        <section aria-labelledby="gap-summary-section">
          <h2 id="gap-summary-section" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Equity gap summary
          </h2>
          <div className="mb-3 rounded-md border border-line-axis bg-plane p-3 text-xs leading-relaxed text-ink-secondary">
            <strong className="text-ink-primary">Methodology.</strong> For each outcome below, "Group/area" is the
            most disadvantaged state for that outcome in its own most recent year with full state coverage.
            "Absolute gap" = |group value − reference value|. "Relative gap" = higher value ÷ lower value between
            the group and the reference (always ≥ 1×), undefined when either value is 0.
          </div>
          <div className="mb-4 flex flex-wrap items-end gap-4 rounded-lg border border-line-grid bg-surface p-4">
            <div>
              <label htmlFor="ref-mode" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                Reference
              </label>
              <select
                id="ref-mode"
                value={referenceMode}
                onChange={(e) => setReferenceMode(e.target.value as ReferenceMode)}
                className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
              >
                <option value="average">Malaysia average</option>
                <option value="best">Best-performing state (per outcome)</option>
                <option value="specific">A specific state</option>
              </select>
            </div>
            {referenceMode === "specific" && (
              <div>
                <label htmlFor="ref-state" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                  State
                </label>
                <select
                  id="ref-state"
                  value={referenceState}
                  onChange={(e) => setReferenceState(e.target.value)}
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
          </div>
          <DataTable columns={gapSummaryColumns} rows={gapSummaryTableRows} searchable={false} pageSize={10} />
          <div className="mt-4">
            <MetadataPanel
              datasetIds={Array.from(
                new Set([
                  ...(INVENTORY_MAP["health_outcomes_state.json"] ?? []),
                  ...(INVENTORY_MAP["healthcare_access_state.json"] ?? []),
                ])
              )}
            />
          </div>
        </section>

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
            <div>
              <label htmlFor="gap-compare-mode" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                Compare
              </label>
              <select
                id="gap-compare-mode"
                value={compareMode}
                onChange={(e) => setCompareMode(e.target.value as "auto" | "states")}
                className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
              >
                <option value="auto">Best vs. worst state (auto)</option>
                <option value="states">Two states I choose</option>
              </select>
            </div>
            {compareMode === "states" && (
              <>
                <div>
                  <label htmlFor="gap-state-a" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                    State A
                  </label>
                  <select
                    id="gap-state-a"
                    value={compareStateA}
                    onChange={(e) => setCompareStateA(e.target.value)}
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
                  <label htmlFor="gap-state-b" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                    State B
                  </label>
                  <select
                    id="gap-state-b"
                    value={compareStateB}
                    onChange={(e) => setCompareStateB(e.target.value)}
                    className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
                  >
                    {MALAYSIA_STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </>
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
                <strong className="text-ink-primary">Methodology — absolute & relative difference.</strong>{" "}
                {compareMode === "auto" ? (
                  <>
                    Absolute difference = highest state value − lowest state value. Relative ratio = highest state
                    value ÷ lowest state value. Both are always computable once at least two states report a value
                    for the chosen year. For this indicator,{" "}
                    {primary.higherIsWorse ? "a higher value reflects a worse outcome" : "a higher value reflects a better outcome"}, so
                    the "best"/"worst" labels below are assigned accordingly rather than by raw magnitude alone.
                  </>
                ) : (
                  <>
                    Absolute difference = |State A value − State B value|. Relative ratio = higher of the two ÷
                    lower of the two (always ≥ 1×). This compares exactly the two states you picked, not necessarily
                    the highest/lowest in the country.
                  </>
                )}
              </div>
              {compareMode === "auto" ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatTile
                    label="Best-performing state"
                    value={gapStats.bestState}
                    sublabel={`${fmt(gapStats.bestValue, primary.decimals)} ${primary.unit}`}
                    caution={
                      primary.countField &&
                      isSmallCount(
                        primaryRows?.find((r) => r.state === gapStats.bestState && r.year === effectivePrimaryYear)?.[primary.countField] as
                          | number
                          | null
                          | undefined
                      )
                        ? SMALL_COUNT_CAUTION_TEXT
                        : undefined
                    }
                  />
                  <StatTile
                    label="Worst-performing state"
                    value={gapStats.worstState}
                    sublabel={`${fmt(gapStats.worstValue, primary.decimals)} ${primary.unit}`}
                    caution={
                      primary.countField &&
                      isSmallCount(
                        primaryRows?.find((r) => r.state === gapStats.worstState && r.year === effectivePrimaryYear)?.[primary.countField] as
                          | number
                          | null
                          | undefined
                      )
                        ? SMALL_COUNT_CAUTION_TEXT
                        : undefined
                    }
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
              ) : !twoStateComparison ? (
                <InsufficientData
                  reason={`${compareStateA} and/or ${compareStateB} do not report ${primary.label.toLowerCase()} for ${effectivePrimaryYear}.`}
                />
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatTile
                    label={compareStateA}
                    value={fmt(twoStateComparison.valueA, primary.decimals)}
                    unit={primary.unit}
                    caution={
                      primary.countField &&
                      isSmallCount(
                        primaryRows?.find((r) => r.state === compareStateA && r.year === effectivePrimaryYear)?.[primary.countField] as
                          | number
                          | null
                          | undefined
                      )
                        ? SMALL_COUNT_CAUTION_TEXT
                        : undefined
                    }
                  />
                  <StatTile
                    label={compareStateB}
                    value={fmt(twoStateComparison.valueB, primary.decimals)}
                    unit={primary.unit}
                    caution={
                      primary.countField &&
                      isSmallCount(
                        primaryRows?.find((r) => r.state === compareStateB && r.year === effectivePrimaryYear)?.[primary.countField] as
                          | number
                          | null
                          | undefined
                      )
                        ? SMALL_COUNT_CAUTION_TEXT
                        : undefined
                    }
                  />
                  <StatTile
                    label="Absolute difference"
                    value={fmt(twoStateComparison.absDiff, primary.decimals)}
                    unit={primary.unit}
                    sublabel={`${compareStateA} vs. ${compareStateB}`}
                  />
                  <StatTile
                    label="Relative ratio"
                    value={twoStateComparison.ratio !== null ? `${fmt(twoStateComparison.ratio, 2)}×` : "—"}
                    sublabel={twoStateComparison.ratio !== null ? "Higher ÷ lower of the two" : "Undefined — one value is 0"}
                  />
                </div>
              )}
              <div className="mt-4">
                <BarRankingCard
                  title={`${primary.label} by state, ${effectivePrimaryYear}`}
                  data={gapStats.snapshot}
                  nameKey="state"
                  valueKey="value"
                  unit={primary.unit}
                  color="#3a7173"
                  highlightWorst={compareMode === "auto" && primary.higherIsWorse}
                />
              </div>
              <p className="mt-2 max-w-3xl text-xs text-ink-muted">
                {compareMode === "states"
                  ? `Full 16-state ranking shown for context — ${compareStateA} and ${compareStateB} are not specially highlighted in this bar chart, only in the stat tiles above.`
                  : primary.higherIsWorse
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
            16 states. <strong><Term id="sii">SII</Term></strong> is the regression slope: the modelled absolute gap
            in the outcome between the least- and most-disadvantaged end of the poverty distribution.{" "}
            <strong><Term id="rii">RII</Term></strong> is the ratio of the predicted outcome at the
            least-disadvantaged end to the most-disadvantaged end. This is a genuine population-weighted regression,
            not a simplified/unweighted approximation — but it is still an{" "}
            <Term id="ecological"><em>ecological</em></Term> measure built from 16 state-level aggregates, not
            individual-level microdata, so it describes the between-state gradient, not within-state inequality, and
            should be read as indicative given the small number of units.
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
                <ChartToolbar
                  showingTable={false}
                  onExplain={() => {
                    const cols: Column[] = [
                      { key: "x", label: "Cumulative population share (%)", numeric: true },
                      { key: "curve", label: "Concentration curve (%)", numeric: true },
                      { key: "equality", label: "Line of equality (%)", numeric: true },
                    ];
                    const csv = toCSV(cols, ciResult.curve as unknown as Record<string, unknown>[]);
                    explain(buildExplainPrompt(`Concentration curve — ${sesIndicator.label}, ${sesYear}`, csv, ciResult.curve.length));
                  }}
                />
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
