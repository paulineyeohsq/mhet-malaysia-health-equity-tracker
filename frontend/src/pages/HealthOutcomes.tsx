import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import KPISummarySection from "../components/KPISummarySection";
import SourceNote from "../components/SourceNote";
import LineChartCard, { type Series } from "../components/LineChartCard";
import BarRankingCard from "../components/BarRankingCard";
import DataTable, { type Column } from "../components/DataTable";
import InsufficientData from "../components/InsufficientData";
import EquityInsightCard, { buildEquityInsight } from "../components/EquityInsightCard";
import { useData } from "../lib/useData";
import type { Row } from "../lib/equity";
import { isSmallCount, SMALL_COUNT_CAUTION_TEXT } from "../lib/reliability";

interface StateOutcomeRow {
  state: string;
  year: number;
  crude_death_rate_per_1000: number | null;
  deaths_abs: number | null;
  maternal_deaths_abs: number | null;
  maternal_mortality_rate_per_100k_births: number | null;
  crude_birth_rate_per_1000: number | null;
  births_abs: number | null;
  infant_deaths_abs: number | null;
  infant_mortality_rate: number | null;
  neonatal_deaths_abs: number | null;
  neonatal_mortality_rate: number | null;
  perinatal_deaths_abs: number | null;
  perinatal_mortality_rate: number | null;
  toddler_deaths_abs: number | null;
  toddler_mortality_rate: number | null;
  under5_deaths_abs: number | null;
  under5_mortality_rate: number | null;
  std_hiv_incidence_per_100k: number | null;
  std_aids_incidence_per_100k: number | null;
  std_syphilis_incidence_per_100k: number | null;
  std_gonorrhea_incidence_per_100k: number | null;
}

interface ImmunisationRow {
  year: number;
  disease: string;
  coverage_pct: number | null;
}

interface NutritionRow {
  year: number;
  sex: string;
  indicator: string;
  range: string;
  description: string;
  prevalence_pct: number | null;
}

type Category = "mortality" | "std" | "immunisation" | "nutrition";

const CATEGORY_LABELS: Record<Category, string> = {
  mortality: "Mortality & Births",
  std: "STD Incidence",
  immunisation: "Immunisation",
  nutrition: "Nutrition",
};

interface MortalityMetric {
  id: string;
  label: string;
  field: keyof StateOutcomeRow;
  unit: string;
  higherIsWorse: boolean;
}

const MORTALITY_METRICS: MortalityMetric[] = [
  { id: "crude_death_rate", label: "Crude death rate", field: "crude_death_rate_per_1000", unit: "per 1,000 population", higherIsWorse: true },
  { id: "crude_birth_rate", label: "Crude birth rate", field: "crude_birth_rate_per_1000", unit: "per 1,000 population", higherIsWorse: false },
  { id: "maternal_mortality", label: "Maternal mortality rate", field: "maternal_mortality_rate_per_100k_births", unit: "per 100,000 live births", higherIsWorse: true },
  { id: "infant_mortality", label: "Infant mortality rate", field: "infant_mortality_rate", unit: "per 1,000 live births", higherIsWorse: true },
  { id: "neonatal_mortality", label: "Neonatal mortality rate", field: "neonatal_mortality_rate", unit: "per 1,000 live births", higherIsWorse: true },
  { id: "perinatal_mortality", label: "Perinatal mortality rate", field: "perinatal_mortality_rate", unit: "per 1,000 births", higherIsWorse: true },
  { id: "toddler_mortality", label: "Toddler mortality rate", field: "toddler_mortality_rate", unit: "per 1,000 population", higherIsWorse: true },
  { id: "under5_mortality", label: "Under-5 mortality rate", field: "under5_mortality_rate", unit: "per 1,000 live births", higherIsWorse: true },
];

interface StdMetric {
  id: string;
  label: string;
  field: keyof StateOutcomeRow;
  color: string;
}

const STD_METRICS: StdMetric[] = [
  { id: "hiv", label: "HIV", field: "std_hiv_incidence_per_100k", color: "#2a78d6" },
  { id: "aids", label: "AIDS", field: "std_aids_incidence_per_100k", color: "#eb6834" },
  { id: "syphilis", label: "Syphilis", field: "std_syphilis_incidence_per_100k", color: "#1baf7a" },
  { id: "gonorrhea", label: "Gonorrhea", field: "std_gonorrhea_incidence_per_100k", color: "#eda100" },
];

const STD_FIRST_YEAR = 2017;

const SERIES_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];

function fmt(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export default function HealthOutcomes() {
  const { data: stateOutcomes } = useData<StateOutcomeRow[]>("health_outcomes_state.json");
  const { data: immunisation } = useData<ImmunisationRow[]>("immunisation_national.json");
  const { data: nutrition } = useData<NutritionRow[]>("nutrition_national.json");

  const [category, setCategory] = useState<Category>("mortality");
  const [state, setState] = useState<string>("Johor");
  const [year, setYear] = useState<number | null>(null);
  const [mortalityMetricId, setMortalityMetricId] = useState(MORTALITY_METRICS[0].id);
  const [sex, setSex] = useState<string>("both");

  // Ask MHET: pre-apply a filter passed via router location state, once on mount.
  const location = useLocation();
  useEffect(() => {
    const s = location.state as { category?: Category; mortalityMetricId?: string } | null;
    if (s?.category) setCategory(s.category);
    if (s?.mortalityMetricId) setMortalityMetricId(s.mortalityMetricId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const states = useMemo(() => {
    if (!stateOutcomes) return [];
    return Array.from(new Set(stateOutcomes.map((r) => r.state))).sort();
  }, [stateOutcomes]);

  const mortalityYears = useMemo(() => {
    if (!stateOutcomes) return [];
    return Array.from(new Set(stateOutcomes.map((r) => r.year))).sort((a, b) => b - a);
  }, [stateOutcomes]);

  const stdYears = useMemo(() => mortalityYears.filter((y) => y >= STD_FIRST_YEAR), [mortalityYears]);

  const immunisationYears = useMemo(() => {
    if (!immunisation) return [];
    return Array.from(new Set(immunisation.map((r) => r.year))).sort((a, b) => b - a);
  }, [immunisation]);

  const immunisationDiseases = useMemo(() => {
    if (!immunisation) return [];
    return Array.from(new Set(immunisation.map((r) => r.disease))).sort();
  }, [immunisation]);

  const nutritionSexes = useMemo(() => {
    if (!nutrition) return [];
    return Array.from(new Set(nutrition.map((r) => r.sex))).sort();
  }, [nutrition]);

  const yearsForCategory = category === "std" ? stdYears : category === "immunisation" ? immunisationYears : mortalityYears;
  const effectiveYear = year ?? yearsForCategory[0] ?? null;

  function selectCategory(next: Category) {
    setCategory(next);
    setYear(null);
    if (next === "nutrition" && nutritionSexes.length > 0 && !nutritionSexes.includes(sex)) {
      setSex(nutritionSexes.includes("both") ? "both" : nutritionSexes[0]);
    }
  }

  // ---- Mortality & Births ----
  const mortalityMetric = MORTALITY_METRICS.find((m) => m.id === mortalityMetricId)!;

  const stateSeries = useMemo(() => {
    if (!stateOutcomes) return [];
    return stateOutcomes
      .filter((r) => r.state === state)
      .sort((a, b) => a.year - b.year);
  }, [stateOutcomes, state]);

  const mortalityTrendData = useMemo(
    () => stateSeries.map((r) => ({ year: r.year, [mortalityMetric.label]: r[mortalityMetric.field] as number | null })),
    [stateSeries, mortalityMetric]
  );
  const mortalityHasData = mortalityTrendData.some((d) => d[mortalityMetric.label] !== null && d[mortalityMetric.label] !== undefined);

  const mortalitySnapshot = useMemo(() => {
    if (!stateOutcomes || effectiveYear === null) return [];
    return stateOutcomes
      .filter((r) => r.year === effectiveYear && r[mortalityMetric.field] !== null)
      .map((r) => ({ state: r.state, value: r[mortalityMetric.field] as number }));
  }, [stateOutcomes, effectiveYear, mortalityMetric]);

  const selectedStateRow = useMemo(() => {
    if (!stateOutcomes || effectiveYear === null) return null;
    return stateOutcomes.find((r) => r.state === state && r.year === effectiveYear) ?? null;
  }, [stateOutcomes, state, effectiveYear]);

  // Insight card content follows whichever category is currently selected —
  // Immunisation/Nutrition are genuinely national-only in this dataset (no
  // state breakdown exists), so those show an honest InsufficientData
  // reason rather than a stale mortality-category sentence or nothing at all.
  const insightSource = useMemo(() => {
    if (category === "mortality") {
      return {
        rows: stateOutcomes as unknown as Row[] | null,
        valueField: mortalityMetric.field as string,
        metricLabel: mortalityMetric.label,
        unit: mortalityMetric.unit,
        higherIsWorse: mortalityMetric.higherIsWorse,
        reason: `Fewer than two states report ${mortalityMetric.label.toLowerCase()} for ${effectiveYear ?? "the selected year"}.`,
      };
    }
    if (category === "std") {
      return {
        rows: stateOutcomes as unknown as Row[] | null,
        valueField: "std_hiv_incidence_per_100k",
        metricLabel: "HIV incidence",
        unit: "per 100k",
        higherIsWorse: true,
        reason: `Fewer than two states report HIV incidence for ${effectiveYear ?? "the selected year"}.`,
      };
    }
    return null;
  }, [category, stateOutcomes, mortalityMetric, effectiveYear]);

  // ---- STD ----
  const stdTrendData = useMemo(
    () =>
      stateSeries
        .filter((r) => r.year >= STD_FIRST_YEAR)
        .map((r) => ({
          year: r.year,
          HIV: r.std_hiv_incidence_per_100k,
          AIDS: r.std_aids_incidence_per_100k,
          Syphilis: r.std_syphilis_incidence_per_100k,
          Gonorrhea: r.std_gonorrhea_incidence_per_100k,
        })),
    [stateSeries]
  );
  const stdTrendSeries: Series[] = STD_METRICS.map((m) => ({ key: m.label, label: m.label, color: m.color }));

  const stdSnapshot = useMemo(() => {
    if (!stateOutcomes || effectiveYear === null) return [];
    return stateOutcomes
      .filter((r) => r.year === effectiveYear && r.std_hiv_incidence_per_100k !== null)
      .map((r) => ({ state: r.state, value: r.std_hiv_incidence_per_100k as number }));
  }, [stateOutcomes, effectiveYear]);

  // ---- Immunisation ----
  const immunisationTrendData = useMemo(() => {
    if (!immunisation) return [];
    const byYear = new Map<number, Record<string, number | null>>();
    immunisation.forEach((r) => {
      if (!byYear.has(r.year)) byYear.set(r.year, {});
      byYear.get(r.year)![r.disease] = r.coverage_pct;
    });
    return Array.from(byYear.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([yr, vals]) => ({ year: yr, ...vals }));
  }, [immunisation]);

  const immunisationSeries: Series[] = immunisationDiseases.map((d, i) => ({
    key: d,
    label: d.replace(/_/g, " ").toUpperCase(),
    color: SERIES_COLORS[i % SERIES_COLORS.length],
  }));

  const immunisationSnapshot = useMemo(() => {
    if (!immunisation || effectiveYear === null) return [];
    return immunisation
      .filter((r) => r.year === effectiveYear && r.coverage_pct !== null)
      .map((r) => ({ disease: r.disease.replace(/_/g, " ").toUpperCase(), value: r.coverage_pct as number }));
  }, [immunisation, effectiveYear]);

  // ---- Nutrition ----
  const nutritionForSex = useMemo(() => {
    if (!nutrition) return [];
    return nutrition.filter((r) => r.sex === sex);
  }, [nutrition, sex]);

  const nutritionYear = nutrition && nutrition.length > 0 ? nutrition[0].year : null;

  // ---- Table rows per category ----
  const tableColumns: Column[] = useMemo(() => {
    if (category === "mortality") {
      return [
        { key: "state", label: "State" },
        { key: "year", label: "Year", numeric: true },
        { key: "crude_death_rate_per_1000", label: "Crude death rate", numeric: true, cautionField: "deaths_abs" },
        { key: "crude_birth_rate_per_1000", label: "Crude birth rate", numeric: true, cautionField: "births_abs" },
        { key: "maternal_mortality_rate_per_100k_births", label: "Maternal mortality", numeric: true, cautionField: "maternal_deaths_abs" },
        { key: "infant_mortality_rate", label: "Infant mortality", numeric: true, cautionField: "infant_deaths_abs" },
        { key: "neonatal_mortality_rate", label: "Neonatal mortality", numeric: true, cautionField: "neonatal_deaths_abs" },
        { key: "under5_mortality_rate", label: "Under-5 mortality", numeric: true, cautionField: "under5_deaths_abs" },
      ];
    }
    if (category === "std") {
      return [
        { key: "state", label: "State" },
        { key: "year", label: "Year", numeric: true },
        { key: "std_hiv_incidence_per_100k", label: "HIV", numeric: true },
        { key: "std_aids_incidence_per_100k", label: "AIDS", numeric: true },
        { key: "std_syphilis_incidence_per_100k", label: "Syphilis", numeric: true },
        { key: "std_gonorrhea_incidence_per_100k", label: "Gonorrhea", numeric: true },
      ];
    }
    if (category === "immunisation") {
      return [
        { key: "year", label: "Year", numeric: true },
        { key: "disease", label: "Disease" },
        { key: "coverage_pct", label: "Coverage (%)", numeric: true },
      ];
    }
    return [
      { key: "year", label: "Year", numeric: true },
      { key: "sex", label: "Sex" },
      { key: "indicator", label: "Indicator" },
      { key: "range", label: "Range" },
      { key: "description", label: "Status" },
      { key: "prevalence_pct", label: "Prevalence (%)", numeric: true },
    ];
  }, [category]);

  const tableRows: Record<string, unknown>[] = useMemo(() => {
    if (category === "mortality" && stateOutcomes) return stateOutcomes as unknown as Record<string, unknown>[];
    if (category === "std" && stateOutcomes)
      return stateOutcomes.filter((r) => r.year >= STD_FIRST_YEAR) as unknown as Record<string, unknown>[];
    if (category === "immunisation" && immunisation) return immunisation as unknown as Record<string, unknown>[];
    if (category === "nutrition" && nutrition) return nutrition as unknown as Record<string, unknown>[];
    return [];
  }, [category, stateOutcomes, immunisation, nutrition]);

  const tableSourceKey = category === "mortality" ? "deaths" : category === "std" ? "std" : category === "immunisation" ? "immunisation" : "nutrition";

  return (
    <div>
      <PageHeader
        title="Health Outcomes Explorer"
        subtitle="Mortality, maternal/infant/child health, STD incidence, immunisation coverage and child nutrition — across states and over time, exactly as published by MOH/DOSM."
      />
      <div className="space-y-8 p-6 lg:p-10">
        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-end gap-4 rounded-lg border border-line-grid bg-surface p-4">
          <div>
            <label htmlFor="category-select" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
              Indicator category
            </label>
            <select
              id="category-select"
              value={category}
              onChange={(e) => selectCategory(e.target.value as Category)}
              className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
            >
              {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>

          {category === "mortality" && (
            <div>
              <label htmlFor="metric-select" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                Metric
              </label>
              <select
                id="metric-select"
                value={mortalityMetricId}
                onChange={(e) => setMortalityMetricId(e.target.value)}
                className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
              >
                {MORTALITY_METRICS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(category === "mortality" || category === "std") && (
            <div>
              <label htmlFor="state-select" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                State
              </label>
              <select
                id="state-select"
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
              >
                {states.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}

          {category === "nutrition" && nutritionSexes.length > 1 && (
            <div>
              <label htmlFor="sex-select" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                Sex
              </label>
              <select
                id="sex-select"
                value={sex}
                onChange={(e) => setSex(e.target.value)}
                className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
              >
                {nutritionSexes.map((s) => (
                  <option key={s} value={s} className="capitalize">
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}

          {category !== "nutrition" && yearsForCategory.length > 0 && (
            <div>
              <label htmlFor="year-select" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                Year
              </label>
              <select
                id="year-select"
                value={effectiveYear ?? ""}
                onChange={(e) => setYear(Number(e.target.value))}
                className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
              >
                {yearsForCategory.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          )}

          <p className="ml-auto max-w-sm text-xs text-ink-muted">
            {category === "mortality" &&
              "State and year filters apply — this indicator is published at state resolution."}
            {category === "std" &&
              "STD incidence is only published from 2017 onward; years before 2017 are not shown."}
            {category === "immunisation" &&
              "Immunisation coverage is reported at national level only — no state breakdown exists in this dataset."}
            {category === "nutrition" &&
              `Nutrition status is a single national survey (NHMS ${nutritionYear ?? "2019"}) — no state breakdown or other survey year exists in this dataset.`}
          </p>
        </div>

        <EquityInsightCard
          insight={
            insightSource
              ? buildEquityInsight({
                  rows: insightSource.rows,
                  year: effectiveYear,
                  valueField: insightSource.valueField,
                  metricLabel: insightSource.metricLabel,
                  unit: insightSource.unit,
                  higherIsWorse: insightSource.higherIsWorse,
                })
              : null
          }
          reason={
            insightSource
              ? insightSource.reason
              : `${CATEGORY_LABELS[category]} is reported at national level only in this dataset — no state-level comparison is possible.`
          }
        />

        {/* ---------------- Mortality & Births ---------------- */}
        {category === "mortality" && (
          <>
            <section>
              <KPISummarySection
                title={`${state} — ${effectiveYear ?? "…"}`}
                headingId="mortality-kpis"
                columns={4}
                items={[
                  { label: "Crude death rate", value: fmt(selectedStateRow?.crude_death_rate_per_1000), unit: "per 1,000", caution: isSmallCount(selectedStateRow?.deaths_abs) ? SMALL_COUNT_CAUTION_TEXT : undefined },
                  { label: "Crude birth rate", value: fmt(selectedStateRow?.crude_birth_rate_per_1000), unit: "per 1,000", caution: isSmallCount(selectedStateRow?.births_abs) ? SMALL_COUNT_CAUTION_TEXT : undefined },
                  { label: "Maternal mortality", value: fmt(selectedStateRow?.maternal_mortality_rate_per_100k_births), unit: "per 100k births", caution: isSmallCount(selectedStateRow?.maternal_deaths_abs) ? SMALL_COUNT_CAUTION_TEXT : undefined },
                  { label: "Infant mortality", value: fmt(selectedStateRow?.infant_mortality_rate), unit: "per 1,000 births", caution: isSmallCount(selectedStateRow?.infant_deaths_abs) ? SMALL_COUNT_CAUTION_TEXT : undefined },
                  { label: "Neonatal mortality", value: fmt(selectedStateRow?.neonatal_mortality_rate), unit: "per 1,000 births", caution: isSmallCount(selectedStateRow?.neonatal_deaths_abs) ? SMALL_COUNT_CAUTION_TEXT : undefined },
                  { label: "Perinatal mortality", value: fmt(selectedStateRow?.perinatal_mortality_rate), unit: "per 1,000 births", caution: isSmallCount(selectedStateRow?.perinatal_deaths_abs) ? SMALL_COUNT_CAUTION_TEXT : undefined },
                  { label: "Toddler mortality", value: fmt(selectedStateRow?.toddler_mortality_rate), unit: "per 1,000", caution: isSmallCount(selectedStateRow?.toddler_deaths_abs) ? SMALL_COUNT_CAUTION_TEXT : undefined },
                  { label: "Under-5 mortality", value: fmt(selectedStateRow?.under5_mortality_rate), unit: "per 1,000 births", caution: isSmallCount(selectedStateRow?.under5_deaths_abs) ? SMALL_COUNT_CAUTION_TEXT : undefined },
                ]}
              />
              <SourceNote sourceKey="deaths" year={effectiveYear ?? undefined} />
            </section>

            <section aria-labelledby="mortality-trend">
              <h2 id="mortality-trend" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
                {mortalityMetric.label} over time — {state}
              </h2>
              {mortalityHasData ? (
                <LineChartCard
                  title={`${mortalityMetric.label} (${mortalityMetric.unit})`}
                  data={mortalityTrendData}
                  xKey="year"
                  series={[{ key: mortalityMetric.label, label: mortalityMetric.label, color: "#2a78d6" }]}
                />
              ) : (
                <InsufficientData
                  reason={`${mortalityMetric.label} is not published for ${state} in this dataset. Early-childhood mortality sub-indicators (infant, neonatal, perinatal, toddler, under-5) are only reported for a subset of states; try Johor, Kedah, Kelantan, Melaka or Negeri Sembilan.`}
                />
              )}
              <SourceNote sourceKey="early_childhood_deaths" year={effectiveYear ?? undefined} />
            </section>

            <section aria-labelledby="mortality-ranking">
              <h2 id="mortality-ranking" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
                {mortalityMetric.label} by state — {effectiveYear ?? "…"}
              </h2>
              {mortalitySnapshot.length > 0 ? (
                <BarRankingCard
                  title={`${mortalityMetric.label} (${mortalityMetric.unit})`}
                  data={mortalitySnapshot}
                  nameKey="state"
                  valueKey="value"
                  unit={mortalityMetric.unit}
                  color="#2a78d6"
                  highlightWorst={mortalityMetric.higherIsWorse}
                />
              ) : (
                <InsufficientData reason={`No states report ${mortalityMetric.label} for ${effectiveYear}.`} />
              )}
              <SourceNote sourceKey="deaths" year={effectiveYear ?? undefined} />
            </section>
          </>
        )}

        {/* ---------------- STD Incidence ---------------- */}
        {category === "std" && (
          <>
            <section>
              <KPISummarySection
                title={`${state} — ${effectiveYear ?? "…"}`}
                headingId="std-kpis"
                columns={4}
                items={[
                  { label: "HIV", value: fmt(selectedStateRow?.std_hiv_incidence_per_100k, 2), unit: "per 100k" },
                  { label: "AIDS", value: fmt(selectedStateRow?.std_aids_incidence_per_100k, 2), unit: "per 100k" },
                  { label: "Syphilis", value: fmt(selectedStateRow?.std_syphilis_incidence_per_100k, 2), unit: "per 100k" },
                  { label: "Gonorrhea", value: fmt(selectedStateRow?.std_gonorrhea_incidence_per_100k, 2), unit: "per 100k" },
                ]}
              />
              <p className="mt-2 text-xs text-ink-muted">
                STD incidence is only available from {STD_FIRST_YEAR} onward in this dataset — earlier years are not
                shown rather than being estimated.
              </p>
              <SourceNote sourceKey="std" year={effectiveYear ?? undefined} />
            </section>

            <section aria-labelledby="std-trend">
              <h2 id="std-trend" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
                STD incidence over time — {state}
              </h2>
              {stdTrendData.length > 0 ? (
                <LineChartCard
                  title="Incidence (per 100,000 population)"
                  data={stdTrendData}
                  xKey="year"
                  series={stdTrendSeries}
                  unit="per 100k"
                />
              ) : (
                <InsufficientData reason={`No STD incidence records for ${state} from ${STD_FIRST_YEAR} onward.`} />
              )}
              <SourceNote sourceKey="std" year={effectiveYear ?? undefined} extra={`Coverage: ${STD_FIRST_YEAR}–2022 only`} />
            </section>

            <section aria-labelledby="std-ranking">
              <h2 id="std-ranking" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
                HIV incidence by state — {effectiveYear ?? "…"}
              </h2>
              {stdSnapshot.length > 0 ? (
                <BarRankingCard
                  title="HIV incidence (per 100,000 population)"
                  data={stdSnapshot}
                  nameKey="state"
                  valueKey="value"
                  unit="per 100k"
                  color="#2a78d6"
                  highlightWorst
                />
              ) : (
                <InsufficientData reason={`No HIV incidence records for ${effectiveYear}.`} />
              )}
              <SourceNote sourceKey="std" year={effectiveYear ?? undefined} />
            </section>
          </>
        )}

        {/* ---------------- Immunisation ---------------- */}
        {category === "immunisation" && (
          <>
            <section>
              <KPISummarySection
                title={`National immunisation coverage — ${effectiveYear ?? "…"}`}
                headingId="imm-kpis"
                columns={5}
                items={immunisationDiseases.map((d) => {
                  const row = immunisation?.find((r) => r.year === effectiveYear && r.disease === d);
                  return { label: d.replace(/_/g, " ").toUpperCase(), value: fmt(row?.coverage_pct), unit: "%" };
                })}
              />
              <SourceNote sourceKey="immunisation" year={effectiveYear ?? undefined} />
            </section>

            <section aria-labelledby="imm-trend">
              <h2 id="imm-trend" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
                Immunisation coverage over time — national
              </h2>
              {immunisationTrendData.length > 0 ? (
                <LineChartCard
                  title="Coverage by disease/vaccine (%)"
                  data={immunisationTrendData}
                  xKey="year"
                  series={immunisationSeries}
                  unit="%"
                  height={340}
                />
              ) : (
                <InsufficientData reason="No immunisation coverage records available." />
              )}
              <SourceNote sourceKey="immunisation" />
            </section>

            <section aria-labelledby="imm-ranking">
              <h2 id="imm-ranking" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
                Coverage by disease/vaccine — {effectiveYear ?? "…"}
              </h2>
              {immunisationSnapshot.length > 0 ? (
                <BarRankingCard
                  title="Coverage (%)"
                  data={immunisationSnapshot}
                  nameKey="disease"
                  valueKey="value"
                  unit="%"
                  color="#1baf7a"
                />
              ) : (
                <InsufficientData reason={`No coverage records for ${effectiveYear}.`} />
              )}
              <p className="mt-2 text-xs text-ink-muted">
                Immunisation coverage is national only — no state-level breakdown exists in this dataset.
              </p>
              <SourceNote sourceKey="immunisation" year={effectiveYear ?? undefined} />
            </section>
          </>
        )}

        {/* ---------------- Nutrition ---------------- */}
        {category === "nutrition" && (
          <>
            <section>
              <KPISummarySection
                title={`Child nutritional status (${nutritionYear ?? "2019"}) — sex: ${sex}`}
                headingId="nut-kpis"
                columns={3}
                items={nutritionForSex.map((r) => ({
                  label: `${r.description} (${r.indicator})`,
                  value: fmt(r.prevalence_pct),
                  unit: "%",
                  sublabel: r.range,
                }))}
              />
              <SourceNote sourceKey="nutrition" year={nutritionYear ?? undefined} />
            </section>

            <section aria-labelledby="nut-trend">
              <h2 id="nut-trend" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
                Trend over time
              </h2>
              <InsufficientData reason={`Nutrition status is only surveyed once in this dataset (NHMS ${nutritionYear ?? "2019"}) — no other year exists to build a trend.`} />
            </section>

            <section aria-labelledby="nut-breakdown">
              <h2 id="nut-breakdown" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
                Prevalence by indicator and status — {nutritionYear ?? "2019"}
              </h2>
              {nutritionForSex.length > 0 ? (
                <BarRankingCard
                  title="Prevalence (%)"
                  data={nutritionForSex.map((r) => ({ label: `${r.indicator} · ${r.description}`, value: r.prevalence_pct }))}
                  nameKey="label"
                  valueKey="value"
                  unit="%"
                  color="#e87ba4"
                />
              ) : (
                <InsufficientData reason={`No nutrition records for sex="${sex}".`} />
              )}
              <p className="mt-2 text-xs text-ink-muted">
                WAZ = weight-for-age z-score (underweight/overweight), HAZ = height-for-age z-score
                (stunting/tall), WHZ = weight-for-height z-score (wasting/obese) — standard NHMS classifications
                relative to the WHO child growth reference.
              </p>
              <SourceNote sourceKey="nutrition" year={nutritionYear ?? undefined} />
            </section>
          </>
        )}

        {/* ---------------- Data table ---------------- */}
        <section aria-labelledby="data-table">
          <h2 id="data-table" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Browse the underlying data
          </h2>
          {tableRows.length > 0 ? (
            <DataTable columns={tableColumns} rows={tableRows} pageSize={15} />
          ) : (
            <InsufficientData reason="Data still loading or unavailable." />
          )}
          <p className="mt-2 text-xs text-ink-secondary">
            <a href="#/explorer" className="text-series-1 underline underline-offset-2">
              View full dataset in Data Explorer
            </a>
          </p>
          <SourceNote sourceKey={tableSourceKey} />
        </section>
      </div>
    </div>
  );
}
