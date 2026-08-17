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
import MetadataPanel from "../components/MetadataPanel";
import { useData } from "../lib/useData";
import type { Row } from "../lib/equity";
import { isSmallCount, SMALL_COUNT_CAUTION_TEXT } from "../lib/reliability";
import { INVENTORY_MAP } from "../lib/inventoryMap";

interface StateOutcomeRow {
  state: string;
  year: number;
  crude_death_rate_per_1000: number | null;
  deaths_abs: number | null;
  maternal_deaths_abs: number | null;
  maternal_mortality_rate_per_100k_births: number | null;
  crude_birth_rate_per_1000: number | null;
  births_abs: number | null;
  stillbirths_abs: number | null;
  stillbirth_rate_per_1000: number | null;
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

interface HivIncidenceRow {
  year: number;
  sex: string;
  hiv_incidence_per_1000_uninfected: number | null;
}

interface EthnicityDeathRow {
  state: string;
  year: number;
  sex: string;
  ethnicity: string;
  deaths_abs: number | null;
}

interface CovidRow {
  state: string;
  year: number;
  covid_cases_abs: number | null;
  covid_deaths_abs: number | null;
  covid_cases_child_abs: number | null;
  covid_cases_adolescent_abs: number | null;
  covid_cases_adult_abs: number | null;
  covid_cases_elderly_abs: number | null;
}

interface ProgrammeRow {
  state: string;
  year: number;
  blood_donations_abs: number | null;
  organ_pledges_abs: number | null;
  pekab40_screenings_abs: number | null;
}

interface PekaDailyRow {
  state: string;
  date: string;
  screenings: number | null;
}

const PEKA_RANGE_OPTIONS = [
  { id: "30", label: "Last 30 days", days: 30 },
  { id: "90", label: "Last 90 days", days: 90 },
  { id: "365", label: "Last 365 days", days: 365 },
  { id: "all", label: "All time (since 2019-04-15)", days: null as number | null },
];

type Category = "mortality" | "std" | "immunisation" | "nutrition" | "covid" | "programmes" | "ethnicity";

const CATEGORY_LABELS: Record<Category, string> = {
  mortality: "Mortality & Births",
  std: "STD Incidence",
  immunisation: "Immunisation",
  nutrition: "Nutrition",
  covid: "COVID-19",
  programmes: "Health Programme Participation",
  ethnicity: "Deaths by Ethnicity",
};

const ETHNICITY_LABELS: Record<string, string> = {
  bumi_malay: "Malay",
  bumi_other: "Other Bumiputera",
  chinese: "Chinese",
  indian: "Indian",
  other_citizen: "Other citizen",
  other_noncitizen: "Non-citizen",
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
  { id: "hiv", label: "HIV", field: "std_hiv_incidence_per_100k", color: "#3a7173" },
  { id: "aids", label: "AIDS", field: "std_aids_incidence_per_100k", color: "#eb6834" },
  { id: "syphilis", label: "Syphilis", field: "std_syphilis_incidence_per_100k", color: "#1baf7a" },
  { id: "gonorrhea", label: "Gonorrhea", field: "std_gonorrhea_incidence_per_100k", color: "#eda100" },
];

const STD_FIRST_YEAR = 2017;

interface CovidMetric {
  id: string;
  label: string;
  field: keyof CovidRow;
  unit: string;
  higherIsWorse: boolean;
}

const COVID_METRICS: CovidMetric[] = [
  { id: "cases", label: "COVID-19 cases", field: "covid_cases_abs", unit: "cases", higherIsWorse: true },
  { id: "deaths", label: "COVID-19 deaths", field: "covid_deaths_abs", unit: "deaths", higherIsWorse: true },
  { id: "cases_child", label: "Cases — children", field: "covid_cases_child_abs", unit: "cases", higherIsWorse: true },
  { id: "cases_adolescent", label: "Cases — adolescents", field: "covid_cases_adolescent_abs", unit: "cases", higherIsWorse: true },
  { id: "cases_adult", label: "Cases — adults", field: "covid_cases_adult_abs", unit: "cases", higherIsWorse: true },
  { id: "cases_elderly", label: "Cases — elderly", field: "covid_cases_elderly_abs", unit: "cases", higherIsWorse: true },
];

interface ProgrammeMetric {
  id: string;
  label: string;
  field: keyof ProgrammeRow;
  unit: string;
  higherIsWorse: boolean;
}

const PROGRAMME_METRICS: ProgrammeMetric[] = [
  { id: "blood", label: "Blood donations", field: "blood_donations_abs", unit: "donations", higherIsWorse: false },
  { id: "organ", label: "Organ pledges", field: "organ_pledges_abs", unit: "pledges", higherIsWorse: false },
  { id: "pekab40", label: "PeKa B40 screenings", field: "pekab40_screenings_abs", unit: "screenings", higherIsWorse: false },
];

const SERIES_COLORS = ["#3a7173", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];

function fmt(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export default function HealthOutcomes() {
  const { data: stateOutcomes } = useData<StateOutcomeRow[]>("health_outcomes_state.json");
  const { data: immunisation } = useData<ImmunisationRow[]>("immunisation_national.json");
  const { data: nutrition } = useData<NutritionRow[]>("nutrition_national.json");
  const { data: hivIncidence } = useData<HivIncidenceRow[]>("hiv_incidence_national.json");
  const { data: ethnicityDeaths } = useData<EthnicityDeathRow[]>("deaths_ethnicity_state.json");
  const { data: covid } = useData<CovidRow[]>("covid_state.json");
  const { data: covidNational } = useData<CovidRow[]>("covid_national.json");
  const { data: programmes } = useData<ProgrammeRow[]>("health_programmes_state.json");
  const { data: pekaDaily } = useData<PekaDailyRow[]>("pekab40_screenings_daily_state.json");

  const [category, setCategory] = useState<Category>("mortality");
  const [state, setState] = useState<string>("Johor");
  const [year, setYear] = useState<number | null>(null);
  const [mortalityMetricId, setMortalityMetricId] = useState(MORTALITY_METRICS[0].id);
  const [covidMetricId, setCovidMetricId] = useState(COVID_METRICS[0].id);
  const [programmeMetricId, setProgrammeMetricId] = useState(PROGRAMME_METRICS[0].id);
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

  const covidYears = useMemo(() => {
    if (!covid) return [];
    return Array.from(new Set(covid.map((r) => r.year))).sort((a, b) => b - a);
  }, [covid]);

  const programmeYears = useMemo(() => {
    if (!programmes) return [];
    return Array.from(new Set(programmes.map((r) => r.year))).sort((a, b) => b - a);
  }, [programmes]);

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

  const ethnicityYears = useMemo(() => {
    if (!ethnicityDeaths) return [];
    return Array.from(new Set(ethnicityDeaths.map((r) => r.year))).sort((a, b) => b - a);
  }, [ethnicityDeaths]);

  const yearsForCategory =
    category === "std"
      ? stdYears
      : category === "immunisation"
        ? immunisationYears
        : category === "covid"
          ? covidYears
          : category === "programmes"
            ? programmeYears
            : category === "ethnicity"
              ? ethnicityYears
              : mortalityYears;
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

  // National HIV incidence (SDG 3.3.1) — a methodologically cleaner metric
  // than std_state's crude diagnosed-case counts (denominator is uninfected
  // population, not raw counts), but published national-only with no state
  // breakdown, so it's shown as a separate complementary chart rather than
  // merged into the state-level STD sections above.
  const hivIncidenceNationalTrend = useMemo(() => {
    if (!hivIncidence) return [];
    const byYear = new Map<number, { year: number; Both: number | null; Male: number | null; Female: number | null }>();
    hivIncidence.forEach((r) => {
      if (!byYear.has(r.year)) byYear.set(r.year, { year: r.year, Both: null, Male: null, Female: null });
      const row = byYear.get(r.year)!;
      if (r.sex === "both") row.Both = r.hiv_incidence_per_1000_uninfected;
      if (r.sex === "male") row.Male = r.hiv_incidence_per_1000_uninfected;
      if (r.sex === "female") row.Female = r.hiv_incidence_per_1000_uninfected;
    });
    return Array.from(byYear.values()).sort((a, b) => a.year - b.year);
  }, [hivIncidence]);
  const hivIncidenceNationalSeries: Series[] = [
    { key: "Both", label: "Both sexes", color: "#3a7173" },
    { key: "Male", label: "Male", color: "#7ba7e0" },
    { key: "Female", label: "Female", color: "#0d366b" },
  ];

  const stdSnapshot = useMemo(() => {
    if (!stateOutcomes || effectiveYear === null) return [];
    return stateOutcomes
      .filter((r) => r.year === effectiveYear && r.std_hiv_incidence_per_100k !== null)
      .map((r) => ({ state: r.state, value: r.std_hiv_incidence_per_100k as number }));
  }, [stateOutcomes, effectiveYear]);

  // ---- COVID-19 ----
  const covidMetric = COVID_METRICS.find((m) => m.id === covidMetricId)!;

  const covidStateSeries = useMemo(() => {
    if (!covid) return [];
    return covid.filter((r) => r.state === state).sort((a, b) => a.year - b.year);
  }, [covid, state]);

  const covidTrendData = useMemo(
    () => covidStateSeries.map((r) => ({ year: r.year, [covidMetric.label]: r[covidMetric.field] as number | null })),
    [covidStateSeries, covidMetric]
  );
  const covidHasData = covidTrendData.some((d) => d[covidMetric.label] !== null && d[covidMetric.label] !== undefined);

  const covidSnapshot = useMemo(() => {
    if (!covid || effectiveYear === null) return [];
    return covid
      .filter((r) => r.year === effectiveYear && r[covidMetric.field] !== null)
      .map((r) => ({ state: r.state, value: r[covidMetric.field] as number }));
  }, [covid, effectiveYear, covidMetric]);

  const selectedCovidRow = useMemo(() => {
    if (!covid || effectiveYear === null) return null;
    return covid.find((r) => r.state === state && r.year === effectiveYear) ?? null;
  }, [covid, state, effectiveYear]);

  const selectedCovidNationalRow = useMemo(() => {
    if (!covidNational || effectiveYear === null) return null;
    return covidNational.find((r) => r.year === effectiveYear) ?? null;
  }, [covidNational, effectiveYear]);

  // ---- Health Programme Participation ----
  const programmeMetric = PROGRAMME_METRICS.find((m) => m.id === programmeMetricId)!;

  const programmeStateSeries = useMemo(() => {
    if (!programmes) return [];
    return programmes.filter((r) => r.state === state).sort((a, b) => a.year - b.year);
  }, [programmes, state]);

  const programmeTrendData = useMemo(
    () => programmeStateSeries.map((r) => ({ year: r.year, [programmeMetric.label]: r[programmeMetric.field] as number | null })),
    [programmeStateSeries, programmeMetric]
  );
  const programmeHasData = programmeTrendData.some(
    (d) => d[programmeMetric.label] !== null && d[programmeMetric.label] !== undefined
  );

  const programmeSnapshot = useMemo(() => {
    if (!programmes || effectiveYear === null) return [];
    return programmes
      .filter((r) => r.year === effectiveYear && r[programmeMetric.field] !== null)
      .map((r) => ({ state: r.state, value: r[programmeMetric.field] as number }));
  }, [programmes, effectiveYear, programmeMetric]);

  const selectedProgrammeRow = useMemo(() => {
    if (!programmes || effectiveYear === null) return null;
    return programmes.find((r) => r.state === state && r.year === effectiveYear) ?? null;
  }, [programmes, state, effectiveYear]);

  // ---- PeKa B40 daily screenings — day-level trend, distinct from the annual sum above ----
  const [pekaRangeId, setPekaRangeId] = useState("90");
  const pekaRange = PEKA_RANGE_OPTIONS.find((r) => r.id === pekaRangeId)!;

  const pekaDailyLatestDate = useMemo(() => {
    if (!pekaDaily || pekaDaily.length === 0) return null;
    return pekaDaily.reduce((max, r) => (r.date > max ? r.date : max), pekaDaily[0].date);
  }, [pekaDaily]);

  const pekaDailyFiltered = useMemo(() => {
    if (!pekaDaily || !pekaDailyLatestDate) return [];
    const rows = pekaDaily.filter((r) => r.state === state);
    if (pekaRange.days === null) return rows;
    const cutoff = new Date(pekaDailyLatestDate);
    cutoff.setDate(cutoff.getDate() - pekaRange.days);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return rows.filter((r) => r.date >= cutoffStr);
  }, [pekaDaily, pekaDailyLatestDate, state, pekaRange]);

  const pekaDailyTotal = useMemo(
    () => pekaDailyFiltered.reduce((sum, r) => sum + (r.screenings ?? 0), 0),
    [pekaDailyFiltered]
  );

  const pekaDailyTableColumns: Column[] = [
    { key: "date", label: "Date" },
    { key: "screenings", label: "Screenings", numeric: true },
  ];

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
    if (category === "covid") {
      return {
        rows: covid as unknown as Row[] | null,
        valueField: covidMetric.field as string,
        metricLabel: covidMetric.label,
        unit: covidMetric.unit,
        higherIsWorse: covidMetric.higherIsWorse,
        reason: `Fewer than two states report ${covidMetric.label.toLowerCase()} for ${effectiveYear ?? "the selected year"}.`,
      };
    }
    if (category === "programmes") {
      return {
        rows: programmes as unknown as Row[] | null,
        valueField: programmeMetric.field as string,
        metricLabel: programmeMetric.label,
        unit: programmeMetric.unit,
        higherIsWorse: programmeMetric.higherIsWorse,
        reason: `Fewer than two states report ${programmeMetric.label.toLowerCase()} for ${effectiveYear ?? "the selected year"}.`,
      };
    }
    return null;
  }, [category, stateOutcomes, mortalityMetric, covid, covidMetric, programmes, programmeMetric, effectiveYear]);

  // ---- Deaths by ethnicity ----
  // Shown as raw counts, not rates: this project has no state-level
  // population-by-ethnicity dataset to normalise against (population_state
  // only breaks down by sex; only the district-level population files have
  // an ethnicity breakdown) — see dataset_inventory.json's entry for
  // death_sex_ethnic_state for the full explanation. "overall" is DOSM's
  // own cross-check total across the other groups, not a real ethnicity —
  // excluded from the comparison below.
  const ethnicitySnapshot = useMemo(() => {
    if (!ethnicityDeaths || effectiveYear === null) return [];
    return ethnicityDeaths
      .filter((r) => r.state === state && r.year === effectiveYear && r.sex === "both" && r.ethnicity !== "overall" && r.deaths_abs !== null)
      .map((r) => ({ ethnicity: ETHNICITY_LABELS[r.ethnicity] ?? r.ethnicity, value: r.deaths_abs as number }));
  }, [ethnicityDeaths, state, effectiveYear]);

  const ethnicityTotal = useMemo(() => {
    if (!ethnicityDeaths || effectiveYear === null) return null;
    const overall = ethnicityDeaths.find((r) => r.state === state && r.year === effectiveYear && r.sex === "both" && r.ethnicity === "overall");
    return overall?.deaths_abs ?? null;
  }, [ethnicityDeaths, state, effectiveYear]);

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
        { key: "stillbirth_rate_per_1000", label: "Stillbirths", numeric: true, cautionField: "stillbirths_abs" },
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
    if (category === "covid") {
      return [
        { key: "state", label: "State" },
        { key: "year", label: "Year", numeric: true },
        { key: "covid_cases_abs", label: "Cases", numeric: true },
        { key: "covid_deaths_abs", label: "Deaths", numeric: true },
        { key: "covid_cases_child_abs", label: "Cases (children)", numeric: true },
        { key: "covid_cases_adolescent_abs", label: "Cases (adolescents)", numeric: true },
        { key: "covid_cases_adult_abs", label: "Cases (adults)", numeric: true },
        { key: "covid_cases_elderly_abs", label: "Cases (elderly)", numeric: true },
      ];
    }
    if (category === "programmes") {
      return [
        { key: "state", label: "State" },
        { key: "year", label: "Year", numeric: true },
        { key: "blood_donations_abs", label: "Blood donations", numeric: true },
        { key: "organ_pledges_abs", label: "Organ pledges", numeric: true },
        { key: "pekab40_screenings_abs", label: "PeKa B40 screenings", numeric: true },
      ];
    }
    if (category === "ethnicity") {
      return [
        { key: "state", label: "State" },
        { key: "year", label: "Year", numeric: true },
        { key: "sex", label: "Sex" },
        { key: "ethnicity", label: "Ethnicity" },
        { key: "deaths_abs", label: "Deaths (count)", numeric: true },
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
    if (category === "covid" && covid) return covid as unknown as Record<string, unknown>[];
    if (category === "programmes" && programmes) return programmes as unknown as Record<string, unknown>[];
    if (category === "ethnicity" && ethnicityDeaths) return ethnicityDeaths.filter((r) => r.state === state) as unknown as Record<string, unknown>[];
    return [];
  }, [category, stateOutcomes, immunisation, nutrition, covid, programmes, ethnicityDeaths, state]);

  const tableSourceKey =
    category === "mortality"
      ? "deaths"
      : category === "std"
        ? "std"
        : category === "immunisation"
          ? "immunisation"
          : category === "covid"
            ? "covid"
            : category === "programmes"
              ? "health_programmes"
              : category === "ethnicity"
                ? "deaths_ethnicity"
                : "nutrition";

  return (
    <div>
      <PageHeader
        title="Health Outcomes Explorer"
        subtitle="Mortality, maternal/infant/child health, STD incidence, immunisation coverage and child nutrition — across states and over time, exactly as published by MOH/DOSM."
      />
      <div className="space-y-8 p-6 lg:p-10">
        <MetadataPanel
          datasetIds={Array.from(
            new Set([
              ...INVENTORY_MAP["health_outcomes_state.json"],
              ...INVENTORY_MAP["immunisation_national.json"],
              ...INVENTORY_MAP["nutrition_national.json"],
              ...INVENTORY_MAP["hiv_incidence_national.json"],
              ...INVENTORY_MAP["deaths_ethnicity_state.json"],
              ...INVENTORY_MAP["covid_state.json"],
              ...INVENTORY_MAP["health_programmes_state.json"],
              ...INVENTORY_MAP["pekab40_screenings_daily_state.json"],
            ])
          )}
        />
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

          {category === "covid" && (
            <div>
              <label htmlFor="covid-metric-select" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                Metric
              </label>
              <select
                id="covid-metric-select"
                value={covidMetricId}
                onChange={(e) => setCovidMetricId(e.target.value)}
                className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
              >
                {COVID_METRICS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {category === "programmes" && (
            <div>
              <label htmlFor="programme-metric-select" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                Metric
              </label>
              <select
                id="programme-metric-select"
                value={programmeMetricId}
                onChange={(e) => setProgrammeMetricId(e.target.value)}
                className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
              >
                {PROGRAMME_METRICS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {(category === "mortality" || category === "std" || category === "covid" || category === "programmes" || category === "ethnicity") && (
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
            {category === "covid" &&
              "Aggregated from daily case/death counts to annual state totals — the latest year is partial (data continues to the ingestion date)."}
            {category === "programmes" &&
              "Aggregated from daily participation counts to annual state totals — each indicator starts in a different year and the latest year is partial."}
            {category === "ethnicity" &&
              "Raw death counts by ethnicity, not rates — this project has no state-level population-by-ethnicity dataset to normalise against, so ethnic groups' absolute counts are not directly comparable (larger groups will show larger counts regardless of relative risk)."}
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
              : category === "ethnicity"
                ? "Deaths by ethnicity are raw counts, not a comparable rate — no state-vs-state equity gap can be computed from this data without a matching population-by-ethnicity denominator (see the note above)."
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
                  { label: "Stillbirths", value: fmt(selectedStateRow?.stillbirth_rate_per_1000), unit: "per 1,000 total births", caution: isSmallCount(selectedStateRow?.stillbirths_abs) ? SMALL_COUNT_CAUTION_TEXT : undefined },
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
                  series={[{ key: mortalityMetric.label, label: mortalityMetric.label, color: "#3a7173" }]}
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
                  color="#3a7173"
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
                  color="#3a7173"
                  highlightWorst
                />
              ) : (
                <InsufficientData reason={`No HIV incidence records for ${effectiveYear}.`} />
              )}
              <SourceNote sourceKey="std" year={effectiveYear ?? undefined} />
            </section>

            <section aria-labelledby="hiv-incidence-national">
              <h2 id="hiv-incidence-national" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
                HIV incidence — national trend (SDG 3.3.1)
              </h2>
              <p className="mb-2 text-xs text-ink-muted">
                New HIV infections per 1,000 people not already living with HIV — a cleaner incidence metric than the
                diagnosed-case counts above, but published national-only with no state breakdown.
              </p>
              {hivIncidenceNationalTrend.length > 0 ? (
                <LineChartCard
                  title="HIV incidence (per 1,000 uninfected population)"
                  data={hivIncidenceNationalTrend}
                  xKey="year"
                  series={hivIncidenceNationalSeries}
                  unit="per 1,000"
                />
              ) : (
                <InsufficientData reason="No national HIV incidence records available." />
              )}
              <SourceNote sourceKey="hiv_incidence" />
            </section>
          </>
        )}

        {/* ---------------- COVID-19 ---------------- */}
        {category === "covid" && (
          <>
            <section>
              <KPISummarySection
                title={`${state} — ${effectiveYear ?? "…"}`}
                headingId="covid-kpis"
                columns={3}
                items={[
                  { label: "COVID-19 cases", value: fmt(selectedCovidRow?.covid_cases_abs, 0), unit: "cases" },
                  { label: "COVID-19 deaths", value: fmt(selectedCovidRow?.covid_deaths_abs, 0), unit: "deaths" },
                  { label: "Cases — children", value: fmt(selectedCovidRow?.covid_cases_child_abs, 0), unit: "cases" },
                  { label: "Cases — adolescents", value: fmt(selectedCovidRow?.covid_cases_adolescent_abs, 0), unit: "cases" },
                  { label: "Cases — adults", value: fmt(selectedCovidRow?.covid_cases_adult_abs, 0), unit: "cases" },
                  { label: "Cases — elderly", value: fmt(selectedCovidRow?.covid_cases_elderly_abs, 0), unit: "cases" },
                  { label: "Malaysia total cases", value: fmt(selectedCovidNationalRow?.covid_cases_abs, 0), unit: "cases" },
                  { label: "Malaysia total deaths", value: fmt(selectedCovidNationalRow?.covid_deaths_abs, 0), unit: "deaths" },
                ]}
              />
              <SourceNote sourceKey="covid" year={effectiveYear ?? undefined} />
            </section>

            <section aria-labelledby="covid-trend">
              <h2 id="covid-trend" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
                {covidMetric.label} over time — {state}
              </h2>
              {covidHasData ? (
                <LineChartCard
                  title={`${covidMetric.label} (${covidMetric.unit})`}
                  data={covidTrendData}
                  xKey="year"
                  series={[{ key: covidMetric.label, label: covidMetric.label, color: "#eb6834" }]}
                />
              ) : (
                <InsufficientData reason={`${covidMetric.label} is not published for ${state} in this dataset.`} />
              )}
              <SourceNote sourceKey="covid" year={effectiveYear ?? undefined} />
            </section>

            <section aria-labelledby="covid-ranking">
              <h2 id="covid-ranking" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
                {covidMetric.label} by state — {effectiveYear ?? "…"}
              </h2>
              {covidSnapshot.length > 0 ? (
                <BarRankingCard
                  title={`${covidMetric.label} (${covidMetric.unit})`}
                  data={covidSnapshot}
                  nameKey="state"
                  valueKey="value"
                  unit={covidMetric.unit}
                  color="#eb6834"
                  highlightWorst={covidMetric.higherIsWorse}
                />
              ) : (
                <InsufficientData reason={`No states report ${covidMetric.label} for ${effectiveYear}.`} />
              )}
              <SourceNote sourceKey="covid" year={effectiveYear ?? undefined} />
            </section>
          </>
        )}

        {/* ---------------- Health Programme Participation ---------------- */}
        {category === "programmes" && (
          <>
            <section>
              <KPISummarySection
                title={`${state} — ${effectiveYear ?? "…"}`}
                headingId="programmes-kpis"
                columns={3}
                items={[
                  { label: "Blood donations", value: fmt(selectedProgrammeRow?.blood_donations_abs, 0), unit: "donations" },
                  { label: "Organ pledges", value: fmt(selectedProgrammeRow?.organ_pledges_abs, 0), unit: "pledges" },
                  { label: "PeKa B40 screenings", value: fmt(selectedProgrammeRow?.pekab40_screenings_abs, 0), unit: "screenings" },
                ]}
              />
              <p className="mt-2 text-xs text-ink-muted">
                Each indicator starts in a different year (blood donations from 2006, organ pledges from 2009, PeKa
                B40 from 2019) and the latest year is partial — a blank cell means the indicator had not started
                yet, not that participation was zero.
              </p>
              <SourceNote sourceKey="health_programmes" year={effectiveYear ?? undefined} />
            </section>

            <section aria-labelledby="programmes-trend">
              <h2 id="programmes-trend" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
                {programmeMetric.label} over time — {state}
              </h2>
              {programmeHasData ? (
                <LineChartCard
                  title={`${programmeMetric.label} (${programmeMetric.unit})`}
                  data={programmeTrendData}
                  xKey="year"
                  series={[{ key: programmeMetric.label, label: programmeMetric.label, color: "#1baf7a" }]}
                />
              ) : (
                <InsufficientData reason={`${programmeMetric.label} is not published for ${state} in this dataset.`} />
              )}
              <SourceNote sourceKey="health_programmes" year={effectiveYear ?? undefined} />
            </section>

            <section aria-labelledby="programmes-ranking">
              <h2 id="programmes-ranking" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
                {programmeMetric.label} by state — {effectiveYear ?? "…"}
              </h2>
              {programmeSnapshot.length > 0 ? (
                <BarRankingCard
                  title={`${programmeMetric.label} (${programmeMetric.unit})`}
                  data={programmeSnapshot}
                  nameKey="state"
                  valueKey="value"
                  unit={programmeMetric.unit}
                  color="#1baf7a"
                  highlightWorst={programmeMetric.higherIsWorse}
                />
              ) : (
                <InsufficientData reason={`No states report ${programmeMetric.label} for ${effectiveYear}.`} />
              )}
              <SourceNote sourceKey="health_programmes" year={effectiveYear ?? undefined} />
            </section>

            {programmeMetricId === "pekab40" && (
              <section aria-labelledby="peka-daily">
                <h2 id="peka-daily" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
                  PeKa B40 screenings — daily trend, {state}
                </h2>
                <p className="mb-3 max-w-3xl text-sm text-ink-secondary">
                  Day-level screening counts, published daily by MOH — distinct from the annual totals above, and
                  useful for spotting recent uptake or campaign response rather than year-over-year change.
                </p>
                <div className="mb-4 flex flex-wrap items-end gap-4 rounded-lg border border-line-grid bg-surface p-4">
                  <div>
                    <label htmlFor="peka-range" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                      Range
                    </label>
                    <select
                      id="peka-range"
                      value={pekaRangeId}
                      onChange={(e) => setPekaRangeId(e.target.value)}
                      className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
                    >
                      {PEKA_RANGE_OPTIONS.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-xs text-ink-muted">
                    {pekaDailyFiltered.length} day{pekaDailyFiltered.length === 1 ? "" : "s"}, {pekaDailyTotal.toLocaleString()} total
                    screenings — latest data point: {pekaDailyLatestDate ?? "—"}
                  </p>
                </div>
                {pekaDailyFiltered.length > 0 ? (
                  <LineChartCard
                    title={`Daily PeKa B40 screenings — ${state}`}
                    data={pekaDailyFiltered.map((r) => ({ date: r.date, Screenings: r.screenings }))}
                    xKey="date"
                    series={[{ key: "Screenings", label: "Screenings", color: "#1baf7a" }]}
                    height={280}
                  />
                ) : (
                  <InsufficientData reason={`No daily PeKa B40 screening records for ${state} in this range.`} />
                )}
                <div className="mt-4">
                  <DataTable columns={pekaDailyTableColumns} rows={pekaDailyFiltered as unknown as Record<string, unknown>[]} pageSize={15} />
                </div>
                <SourceNote sourceKey="pekab40_daily" />
              </section>
            )}
          </>
        )}

        {/* ---------------- Deaths by ethnicity ---------------- */}
        {category === "ethnicity" && (
          <>
            <section>
              <div className="mb-4 rounded-lg border border-line-axis bg-plane p-3 text-sm text-ink-secondary">
                <strong>Raw counts, not rates.</strong> This project has no state-level population-by-ethnicity
                dataset to normalise against — larger ethnic groups will show larger death counts regardless of
                relative risk. Do not read this chart as a per-capita comparison.
              </div>
              <KPISummarySection
                title={`${state} — ${effectiveYear ?? "…"}, both sexes`}
                headingId="ethnicity-kpis"
                columns={2}
                items={[{ label: "Total deaths (all ethnicities)", value: fmt(ethnicityTotal, 0), unit: "deaths" }]}
              />
              <SourceNote sourceKey="deaths_ethnicity" year={effectiveYear ?? undefined} />
            </section>

            <section aria-labelledby="ethnicity-ranking">
              <h2 id="ethnicity-ranking" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
                Deaths by ethnicity — {state}, {effectiveYear ?? "…"}
              </h2>
              {ethnicitySnapshot.length > 0 ? (
                <BarRankingCard
                  title="Deaths (count)"
                  data={ethnicitySnapshot}
                  nameKey="ethnicity"
                  valueKey="value"
                  unit="deaths"
                  color="#7a4fb5"
                />
              ) : (
                <InsufficientData reason={`No ethnicity-disaggregated death records for ${state} in ${effectiveYear}.`} />
              )}
              <SourceNote sourceKey="deaths_ethnicity" year={effectiveYear ?? undefined} extra="Excludes DOSM's own 'overall' cross-check total row." />
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
