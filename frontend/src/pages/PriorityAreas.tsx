import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import DataTable, { type Column } from "../components/DataTable";
import BarRankingCard from "../components/BarRankingCard";
import InsufficientData from "../components/InsufficientData";
import SourceNote from "../components/SourceNote";
import Drawer from "../components/Drawer";
import Disclosure from "../components/Disclosure";
import { useData } from "../lib/useData";
import { yearsWithCoverage, type Row } from "../lib/equity";
import { isStaleYear } from "../lib/dataAge";
import { isSmallCount } from "../lib/reliability";
import { MALAYSIA_STATES } from "../lib/geoConstants";
import { kvLabel } from "../lib/klangValley";
import { computeGroupedScores, rankRanges, rankStates, type IndicatorInput } from "../lib/priorityScore";
import type { SOURCES } from "../lib/sources";

type GroupKey = "burden" | "ses" | "access" | "equity";

const GROUPS: Record<GroupKey, { label: string; blurb: string }> = {
  burden: {
    label: "Health burden (proxy)",
    blurb: "How much illness and death is recorded: mortality rates, HIV incidence, diabetes and hypertension prevalence.",
  },
  ses: {
    label: "Socioeconomic disadvantage",
    blurb: "Poverty, income and income inequality between households in the state.",
  },
  access: {
    label: "Healthcare access gap",
    blurb: "How much health-care capacity and basic infrastructure is available: staff, beds, sanitation, water, screening.",
  },
  equity: {
    label: "Equity gap (inequality inside the state)",
    blurb: "How unequal the state's own districts are, on poverty, income and death rates. A high state average can hide very different districts.",
  },
};
const GROUP_KEYS = Object.keys(GROUPS) as GroupKey[];

interface Spec {
  id: string;
  group: GroupKey;
  label: string;
  unit: string;
  sourceKey: keyof typeof SOURCES;
  /** Where the value comes from. "state": one value per state. "spread": the gap between a state's own districts. */
  kind: "state" | "spread";
  file: string;
  field: string;
  /** For kind "spread": the gap is the max minus the min district value ("range") or max divided by min ("ratio"). */
  measure?: "range" | "ratio";
  /** true if a HIGHER value means MORE priority. */
  higherIsMorePriority: boolean;
  defaultOn: boolean;
  filter?: (r: Row) => boolean;
  /** Field holding the number of underlying events: a state with fewer than 10 is left out of this indicator (a rate
   * from a handful of events swings wildly, which would let tiny states jump to the top or bottom of the ranking). */
  absField?: string;
  note?: string;
}

const SMALL_NOTE = "States with fewer than 10 recorded events are left out, because one or two events would swing their rate.";

const SPECS: Spec[] = [
  // ---- health burden
  { id: "mmr", group: "burden", kind: "state", label: "Maternal mortality rate", file: "health_outcomes_state.json", field: "maternal_mortality_rate_per_100k_births", unit: "per 100,000 live births", sourceKey: "maternal_deaths", higherIsMorePriority: true, defaultOn: true, absField: "maternal_deaths_abs", note: SMALL_NOTE },
  { id: "cdr", group: "burden", kind: "state", label: "Crude death rate", file: "health_outcomes_state.json", field: "crude_death_rate_per_1000", unit: "per 1,000 population", sourceKey: "deaths", higherIsMorePriority: true, defaultOn: true, absField: "deaths_abs", note: SMALL_NOTE },
  { id: "infant", group: "burden", kind: "state", label: "Infant mortality rate", file: "health_outcomes_state.json", field: "infant_mortality_rate", unit: "per 1,000 live births", sourceKey: "early_childhood_deaths", higherIsMorePriority: true, defaultOn: true, absField: "infant_deaths_abs", note: SMALL_NOTE },
  { id: "under5", group: "burden", kind: "state", label: "Under-5 mortality rate", file: "health_outcomes_state.json", field: "under5_mortality_rate", unit: "per 1,000 live births", sourceKey: "early_childhood_deaths", higherIsMorePriority: true, defaultOn: true, absField: "under5_deaths_abs", note: SMALL_NOTE },
  { id: "stillbirth", group: "burden", kind: "state", label: "Stillbirth rate", file: "health_outcomes_state.json", field: "stillbirth_rate_per_1000", unit: "per 1,000 total births", sourceKey: "deaths", higherIsMorePriority: true, defaultOn: true, absField: "stillbirths_abs", note: SMALL_NOTE },
  { id: "hiv", group: "burden", kind: "state", label: "HIV incidence (diagnosed cases)", file: "health_outcomes_state.json", field: "std_hiv_incidence_per_100k", unit: "per 100,000 population", sourceKey: "std", higherIsMorePriority: true, defaultOn: true },
  { id: "diabetes", group: "burden", kind: "state", label: "Known diabetes prevalence (NHMS)", file: "nhms_ncd_state.json", field: "known_diabetes_prevalence_pct", unit: "%", sourceKey: "nhms_ncd", higherIsMorePriority: true, defaultOn: true, note: "Survey estimate; rows the survey flags as unreliable are left out." },
  { id: "hypertension", group: "burden", kind: "state", label: "Known hypertension prevalence (NHMS)", file: "nhms_ncd_state.json", field: "known_hypertension_prevalence_pct", unit: "%", sourceKey: "nhms_ncd", higherIsMorePriority: true, defaultOn: true, note: "Survey estimate; rows the survey flags as unreliable are left out." },
  // ---- socioeconomic disadvantage
  { id: "poverty", group: "ses", kind: "state", label: "Absolute poverty rate", file: "socioeconomic_state.json", field: "poverty_absolute", unit: "%", sourceKey: "poverty", higherIsMorePriority: true, defaultOn: true },
  { id: "hardcore", group: "ses", kind: "state", label: "Hardcore poverty rate", file: "socioeconomic_state.json", field: "poverty_hardcore", unit: "%", sourceKey: "poverty", higherIsMorePriority: true, defaultOn: true },
  { id: "income", group: "ses", kind: "state", label: "Median household income", file: "socioeconomic_state.json", field: "income_median", unit: "RM/month", sourceKey: "income", higherIsMorePriority: false, defaultOn: true },
  { id: "gini", group: "ses", kind: "state", label: "Gini coefficient", file: "socioeconomic_state.json", field: "gini", unit: "index (0-1)", sourceKey: "gini", higherIsMorePriority: true, defaultOn: true },
  // ---- healthcare access
  { id: "staff", group: "access", kind: "state", get label() { return kvLabel("Healthcare staff availability"); }, file: "healthcare_access_state.json", field: "staff_per_100k_pooled", unit: "per 100,000 population", sourceKey: "healthcare_staff", higherIsMorePriority: false, defaultOn: true },
  { id: "beds", group: "access", kind: "state", get label() { return kvLabel("Hospital bed availability"); }, file: "healthcare_access_state.json", field: "beds_per_100k_pooled", unit: "per 100,000 population", sourceKey: "hospital_beds", higherIsMorePriority: false, defaultOn: true },
  { id: "sanitation", group: "access", kind: "state", label: "Basic sanitation access", file: "sanitation_access_state.json", field: "sanitation_access_pct", unit: "%", sourceKey: "sanitation", higherIsMorePriority: false, defaultOn: true },
  { id: "water", group: "access", kind: "state", label: "Basic water access", file: "water_access_state.json", field: "water_access_pct", unit: "%", sourceKey: "water", higherIsMorePriority: false, defaultOn: true, filter: (r) => r.strata === "overall" },
  { id: "pekab40", group: "access", kind: "state", label: "PeKa B40 screenings (annual count)", file: "health_programmes_state.json", field: "pekab40_screenings_abs", unit: "screenings", sourceKey: "health_programmes", higherIsMorePriority: false, defaultOn: false, note: "An absolute count, not a rate, so larger states look better served. Off by default; tick it only if you want screening activity counted." },
  // ---- equity gap: inequality between a state's own districts
  { id: "eq_poverty", group: "equity", kind: "spread", measure: "range", label: "Poverty gap between districts", file: "socioeconomic_district.json", field: "poverty_absolute", unit: "percentage points, highest minus lowest district", sourceKey: "poverty", higherIsMorePriority: true, defaultOn: true },
  { id: "eq_income", group: "equity", kind: "spread", measure: "ratio", label: "Income gap between districts", file: "socioeconomic_district.json", field: "income_median", unit: "x, highest / lowest district median income", sourceKey: "income", higherIsMorePriority: true, defaultOn: true },
  { id: "eq_deaths", group: "equity", kind: "spread", measure: "range", label: "Death-rate gap between districts", file: "deaths_district_sex.json", field: "death_rate_per_1000", unit: "per 1,000, highest minus lowest district", sourceKey: "deaths_district", higherIsMorePriority: true, defaultOn: true, filter: (r) => r.sex === "both" && !isSmallCount(r.deaths_abs as number | null), note: "Districts with fewer than 10 recorded deaths are left out." },
];

const MIN_STATES_WITH_VALUE = 3; // an indicator with fewer states than this cannot be normalised meaningfully
const MIN_STATES_FOR_YEAR = 12; // a year counts as "the latest" for a state indicator when this many states report it
const MIN_STATES_FOR_SPREAD_YEAR = 8; // fewer states have several districts (only 12 of 16 do)

interface Resolved {
  spec: Spec;
  year: number | null;
  values: Map<string, number | null>;
  n: number;
}

/** The gap between a state's districts (max - min, or max / min), for the latest year that at least 8 states can report. */
function districtSpread(rows: Row[] | null, field: string, measure: "range" | "ratio", filter?: (r: Row) => boolean): { year: number | null; values: Map<string, number | null> } {
  const empty = { year: null, values: new Map<string, number | null>() };
  if (!rows) return empty;
  const usable = (filter ? rows.filter(filter) : rows).filter((r) => typeof r[field] === "number");
  const years = Array.from(new Set(usable.map((r) => r.year as number))).sort((a, b) => b - a);
  for (const year of years) {
    const byState = new Map<string, number[]>();
    for (const r of usable) {
      if (r.year !== year) continue;
      const list = byState.get(r.state as string) ?? [];
      list.push(r[field] as number);
      byState.set(r.state as string, list);
    }
    const values = new Map<string, number | null>();
    let n = 0;
    for (const state of MALAYSIA_STATES) {
      const list = byState.get(state);
      if (!list || list.length < 2) {
        values.set(state, null); // a single district (or none published) has no inside-the-state gap to measure
        continue;
      }
      const hi = Math.max(...list);
      const lo = Math.min(...list);
      const v = measure === "range" ? hi - lo : lo > 0 ? hi / lo : null;
      values.set(state, v);
      if (v !== null) n++;
    }
    if (n >= MIN_STATES_FOR_SPREAD_YEAR) return { year, values };
  }
  return empty;
}

function stateValues(rows: Row[] | null, spec: Spec): { year: number | null; values: Map<string, number | null> } {
  const empty = { year: null, values: new Map<string, number | null>() };
  if (!rows) return empty;
  let usable = spec.filter ? rows.filter(spec.filter) : rows;
  // NHMS survey estimates carry a per-indicator "<stem>_unreliable" flag (small sample / high relative standard error).
  if (spec.absField) usable = usable.filter((r) => !isSmallCount(r[spec.absField as string] as number | null));
  const flag = spec.field.replace(/_prevalence_pct$/, "_unreliable");
  if (flag !== spec.field && usable.some((r) => flag in r)) usable = usable.filter((r) => r[flag] !== true);
  const year = yearsWithCoverage(usable, spec.field, MIN_STATES_FOR_YEAR)[0] ?? null;
  if (year === null) return empty;
  const values = new Map<string, number | null>();
  for (const state of MALAYSIA_STATES) {
    const row = usable.find((r) => r.state === state && r.year === year);
    const v = row ? row[spec.field] : undefined;
    values.set(state, typeof v === "number" ? v : null);
  }
  return { year, values };
}

// Research Opportunities uses its own outcome ids.
const RESEARCH_ID: Record<string, string> = { mmr: "mmr", cdr: "cdr", infant: "imr", under5: "u5mr", hiv: "hiv", diabetes: "diabetes", hypertension: "hypertension" };

const EQUAL_WEIGHTS: Record<GroupKey, number> = { burden: 25, ses: 25, access: 25, equity: 25 };
const round = (x: number | null, d: number) => (x === null ? null : Math.round(x * 10 ** d) / 10 ** d);

export default function PriorityAreas() {
  const navigate = useNavigate();
  const { data: healthOutcomes } = useData<Row[]>("health_outcomes_state.json");
  const { data: socioeconomic } = useData<Row[]>("socioeconomic_state.json");
  const { data: healthcareAccess } = useData<Row[]>("healthcare_access_state.json");
  const { data: nhmsNcd } = useData<Row[]>("nhms_ncd_state.json");
  const { data: sanitationAccess } = useData<Row[]>("sanitation_access_state.json");
  const { data: waterAccess } = useData<Row[]>("water_access_state.json");
  const { data: healthProgrammes } = useData<Row[]>("health_programmes_state.json");
  const { data: socioDistrict } = useData<Row[]>("socioeconomic_district.json");
  const { data: deathsDistrict } = useData<Row[]>("deaths_district_sex.json");

  const FILES: Record<string, Row[] | null> = {
    "health_outcomes_state.json": healthOutcomes,
    "socioeconomic_state.json": socioeconomic,
    "healthcare_access_state.json": healthcareAccess,
    "nhms_ncd_state.json": nhmsNcd,
    "sanitation_access_state.json": sanitationAccess,
    "water_access_state.json": waterAccess,
    "health_programmes_state.json": healthProgrammes,
    "socioeconomic_district.json": socioDistrict,
    "deaths_district_sex.json": deathsDistrict,
  };

  const [weights, setWeights] = useState<Record<GroupKey, number>>(EQUAL_WEIGHTS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>(() => Object.fromEntries(SPECS.map((s) => [s.id, s.defaultOn])));

  // Every indicator's own latest year and per-state values (computed whether ticked or not, so the list can show them).
  const resolved: Resolved[] = SPECS.map((spec) => {
    const rows = FILES[spec.file];
    const r = spec.kind === "spread" ? districtSpread(rows, spec.field, spec.measure ?? "range", spec.filter) : stateValues(rows, spec);
    const n = Array.from(r.values.values()).filter((v) => v !== null).length;
    return { spec, year: r.year, values: r.values, n };
  });

  const active = resolved.filter((r) => selected[r.spec.id] && r.n >= MIN_STATES_WITH_VALUE);
  const inputs: IndicatorInput[] = active.map((r) => ({
    key: r.spec.id,
    group: r.spec.group,
    label: r.spec.label,
    values: r.values,
    higherIsMorePriority: r.spec.higherIsMorePriority,
  }));

  const totalWeight = Object.values(weights).reduce((s, w) => s + w, 0) || 1;
  const scores = useMemo(
    () => computeGroupedScores(MALAYSIA_STATES, inputs, weights),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [healthOutcomes, socioeconomic, healthcareAccess, nhmsNcd, sanitationAccess, waterAccess, healthProgrammes, socioDistrict, deathsDistrict, selected, weights]
  );
  const ranks = rankStates(scores);
  const ranked = scores.filter((s) => s.weightedTotal !== null).sort((a, b) => (b.weightedTotal as number) - (a.weightedTotal as number));

  // How much does the order depend on the weights? Re-rank under equal weights and under each component on its own.
  const groupsInUse = GROUP_KEYS.filter((g) => inputs.some((i) => i.group === g));
  const sensitivity = useMemo(() => {
    const alone = groupsInUse.map((g) => Object.fromEntries(GROUP_KEYS.map((k) => [k, k === g ? 1 : 0])) as Record<string, number>);
    return rankRanges(MALAYSIA_STATES, inputs, [EQUAL_WEIGHTS, ...alone]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [healthOutcomes, socioeconomic, healthcareAccess, nhmsNcd, sanitationAccess, waterAccess, healthProgrammes, socioDistrict, deathsDistrict, selected]);

  const columns: Column[] = [
    { key: "rank", label: "Rank", numeric: true },
    { key: "state", label: "State" },
    { key: "score", label: "Priority score (0-1)", numeric: true },
    ...GROUP_KEYS.map((g) => ({ key: g, label: `${GROUPS[g].label} (0-1)`, numeric: true })),
    { key: "range", label: "Rank range across weightings" },
  ];
  const tableRows = ranked.map((s) => {
    const range = sensitivity.get(s.state);
    return {
      rank: ranks.get(s.state) ?? null,
      state: s.state,
      score: round(s.weightedTotal, 3),
      burden: round(s.groups.burden ?? null, 3),
      ses: round(s.groups.ses ?? null, 3),
      access: round(s.groups.access ?? null, 3),
      equity: round(s.groups.equity ?? null, 3),
      range: range ? (range.best === range.worst ? `${range.best}` : `${range.best}–${range.worst}`) : "—",
    };
  });
  const chartData = ranked.map((s) => ({ state: s.state, score: round(s.weightedTotal, 3) }));

  const detailColumns: Column[] = [
    { key: "state", label: "State" },
    ...active.map((r) => ({ key: r.spec.id, label: `${r.spec.label}${r.year ? ` (${r.year})` : ""}`, numeric: true })),
  ];
  const detailRows = MALAYSIA_STATES.map((state) => ({
    state,
    ...Object.fromEntries(active.map((r) => [r.spec.id, round(r.values.get(state) ?? null, 2)])),
  }));

  const top = ranked[0];
  // Which ticked burden indicator pushes the top state up the most, for the Research Opportunities link.
  const topBurden = top
    ? active
        .filter((r) => r.spec.group === "burden")
        .map((r) => ({ id: r.spec.id, v: top.indicators[r.spec.id] }))
        .filter((x): x is { id: string; v: number } => x.v !== null)
        .sort((a, b) => b.v - a.v)[0]
    : undefined;

  return (
    <div>
      <PageHeader
        title="Priority Areas"
        subtitle="WHAT should be investigated next? A transparent, configurable research-prioritisation tool combining every health-burden, socioeconomic, healthcare-access and within-state equity indicator on this dashboard — not a ranking of 'unhealthy' communities."
      />
      <div className="space-y-8 p-6 lg:p-10">
        <div className="rounded-lg border border-line-axis bg-plane p-4 text-sm text-ink-secondary">
          <p className="font-medium text-ink-primary">This is a research prioritisation tool, not a clinical risk score.</p>
          <p className="mt-1.5 max-w-4xl leading-relaxed">
            This is deliberately <strong>not</strong> the composite "equity index" this project's own methodology argues
            against (see the{" "}
            <a href="#/methodology" className="text-series-1 underline underline-offset-2">
              Methodology
            </a>{" "}
            page) — there is no single official weighting of health, socioeconomic and access indicators. Every indicator
            below is a real published figure, shown with its own value and year, and the choices (which indicators count,
            and how much each component weighs) are yours. A higher score means a state sits closer to the more-disadvantaged
            end of the states with data — describe it as a <em>potential priority area for further investigation</em>,
            never as a definitive judgement.
          </p>
        </div>

        {top && (
          <div className="rounded-lg border border-line-axis bg-plane p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-series-1">Key Equity Insight</div>
            <p className="mt-1 text-sm text-ink-primary">
              With the indicators and weights below, <strong>{top.state}</strong> ranks as the top potential priority area
              (score {(top.weightedTotal as number).toFixed(2)} of 1.00), from {active.length} indicator
              {active.length === 1 ? "" : "s"} across {groupsInUse.length} component{groupsInUse.length === 1 ? "" : "s"}.
              {sensitivity.get(top.state) && sensitivity.get(top.state)!.worst > 3
                ? ` Its rank is not stable: it ranges from ${sensitivity.get(top.state)!.best} to ${sensitivity.get(top.state)!.worst} depending on which component you weight.`
                : ""}
            </p>
            <p className="mt-1 text-xs text-ink-muted">Change the indicators or weights below and this updates — it is not a fixed ranking.</p>
          </div>
        )}

        {/* The score's settings live in a panel; the page shows what they currently are and explains them. */}
        <section aria-labelledby="priority-settings" className="space-y-3">
          <h2 id="priority-settings" className="text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Score settings
          </h2>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line-grid bg-surface p-4">
            <div className="text-sm text-ink-secondary">
              <p className="text-ink-primary">
                <span className="font-medium">{active.length} indicators</span> across {groupsInUse.length} components
              </p>
              <p className="mt-0.5 text-xs">
                Weights:{" "}
                {GROUP_KEYS.map((g, i) => (
                  <span key={g}>
                    {i > 0 ? " · " : ""}
                    {GROUPS[g].label.split(" (")[0]} {Math.round((weights[g] / totalWeight) * 100)}%
                  </span>
                ))}
                {JSON.stringify(weights) === JSON.stringify(EQUAL_WEIGHTS) ? " (equal, the default)" : ""}
              </p>
            </div>
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setSettingsOpen(true)}
              className="rounded-md bg-series-1 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
            >
              Customize the score…
            </button>
          </div>

          <Disclosure
            className="rounded-lg border border-line-grid bg-surface p-3 text-sm text-ink-secondary"
            summaryClassName="font-medium text-ink-primary"
            summary="Where do the weights come from?"
          >
            <div className="max-w-4xl space-y-2 leading-relaxed">
              <p>
                <strong>They are an assumption, not a finding.</strong> The default of 25% for each of the four components
                is simply equal weighting. It was not estimated from the data, tested against outcomes, or taken from
                any ministry, WHO or published index, because no evidence-based way to say how much more a mortality rate
                should count than poverty or bed supply exists. Equal weights are the least presumptuous starting point, but
                they are still a choice, which is why you can change them.
              </p>
              <p>
                <strong>Inside a component</strong> every indicator you tick counts equally. <strong>Each indicator</strong>{" "}
                is first scaled from 0 (the state with the least priority-worthy value) to 1 (the most), using its own most
                recent year that at least {MIN_STATES_FOR_YEAR} states report (8 for district gaps), and flipped where more is
                better (income, staff, beds). So a score shows where a state sits <em>relative to the other states</em>, not
                how bad it is in absolute terms. A state missing an indicator is scored on the rest, never as zero.
              </p>
              <p>
                <strong>How much do the weights matter?</strong> The "Rank range" column re-ranks every state under equal
                weights and under each component on its own, and shows its best and worst rank. A wide range means the
                state's position depends on what you decide matters.
              </p>
            </div>
          </Disclosure>

          <Disclosure
            className="rounded-lg border border-line-grid bg-surface p-3 text-sm text-ink-secondary"
            summaryClassName="font-medium text-ink-primary"
            summary="Where does the equity gap come from?"
          >
            <div className="max-w-4xl space-y-2 leading-relaxed">
              <p>
                The equity-gap component measures <strong>inequality inside each state</strong>: how far apart its districts
                are. It uses three gaps between a state's highest and lowest district: the poverty rate (percentage points)
                and median household income (ratio) from DOSM's household survey for districts, and the death rate from
                DOSM's district death statistics. All three are computed here from the published district figures; nothing
                is estimated.
              </p>
              <p>
                W.P. Kuala Lumpur, W.P. Putrajaya, W.P. Labuan and Perlis publish a single district, so they have no
                inside-the-state gap and are scored on the other components only (not as zero).
              </p>
              <p>
                <strong>What it replaced.</strong> The earlier version defined the equity gap as a state's value on the one
                burden indicator you picked minus the average of all states. That is the same information as the burden
                indicator itself, only shifted, so it counted health burden twice (half of the whole score) and told you
                nothing about inequality. If you would rather define the equity gap another way, say so.
              </p>
            </div>
          </Disclosure>
        </section>

        <Drawer
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          title="Customize the score"
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
              <button
                type="button"
                onClick={() => {
                  setWeights(EQUAL_WEIGHTS);
                  setSelected(Object.fromEntries(SPECS.map((s) => [s.id, s.defaultOn])));
                }}
                className="rounded border border-line-axis px-2 py-1 font-medium text-ink-secondary hover:border-series-1 hover:text-series-1"
              >
                Reset everything to the defaults
              </button>
              <span>Results update as you change things.</span>
            </div>
          }
        >
          <h3 className="text-sm font-medium text-ink-primary">Component weights</h3>
          <p className="mt-0.5 text-xs text-ink-muted">Weights are re-scaled to sum to 100%.</p>
          <div className="mt-3 space-y-4">
            {GROUP_KEYS.map((key) => (
              <div key={key}>
                <div className="flex items-center justify-between text-xs text-ink-secondary">
                  <label htmlFor={`weight-${key}`}>{GROUPS[key].label}</label>
                  <span className="tabular-nums text-ink-primary">{Math.round((weights[key] / totalWeight) * 100)}%</span>
                </div>
                <input
                  id={`weight-${key}`}
                  type="range"
                  min={0}
                  max={100}
                  value={weights[key]}
                  onChange={(e) => setWeights((w) => ({ ...w, [key]: Number(e.target.value) }))}
                  className="mt-1 w-full"
                />
                <p className="mt-0.5 text-[11px] leading-snug text-ink-muted">{GROUPS[key].blurb}</p>
              </div>
            ))}
          </div>

          <h3 className="mt-6 text-sm font-medium text-ink-primary">Indicators included</h3>
          <p className="mt-0.5 text-xs text-ink-muted">Untick an indicator to leave it out of its component.</p>
          <div className="mt-3 space-y-5">
            {GROUP_KEYS.map((g) => (
              <fieldset key={g}>
                <legend className="text-xs font-semibold uppercase tracking-wide text-ink-secondary">{GROUPS[g].label}</legend>
                <ul className="mt-2 space-y-2">
                  {resolved
                    .filter((r) => r.spec.group === g)
                    .map((r) => {
                      const usable = r.n >= MIN_STATES_WITH_VALUE;
                      return (
                        <li key={r.spec.id} className="text-xs">
                          <label className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={Boolean(selected[r.spec.id]) && usable}
                              disabled={!usable}
                              onChange={(e) => setSelected((s) => ({ ...s, [r.spec.id]: e.target.checked }))}
                            />
                            <span>
                              <span className="font-medium text-ink-primary">{r.spec.label}</span>{" "}
                              <span className="text-ink-muted">
                                — {usable ? `${r.n} states` : "not enough states with data"}
                                {r.year ? `, ${r.year}` : ""}
                              </span>
                              {isStaleYear(r.year) && (
                                <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-900">{r.year} data</span>
                              )}
                              <span className="block text-ink-muted">
                                {r.spec.unit}; {r.spec.higherIsMorePriority ? "higher = more priority" : "lower = more priority"}
                              </span>
                              {r.spec.note && <span className="block text-ink-muted">{r.spec.note}</span>}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                </ul>
              </fieldset>
            ))}
          </div>
        </Drawer>

        <section aria-labelledby="priority-results">
          <h2 id="priority-results" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Priority score by state
          </h2>
          {ranked.length === 0 ? (
            <InsufficientData reason="Not enough states report real values for the ticked indicators to compute a score." />
          ) : (
            <>
              <BarRankingCard
                title="Priority score (0 = least, 1 = most, among states with data for the ticked indicators)"
                data={chartData}
                nameKey="state"
                valueKey="score"
                color="#7a3aa7"
              />
              <div className="mt-4">
                <DataTable columns={columns} rows={tableRows} pageSize={16} searchable={false} />
              </div>
              <h3 className="mb-2 mt-6 text-sm font-medium text-ink-primary">The values behind the score</h3>
              <DataTable columns={detailColumns} rows={detailRows} pageSize={16} searchable={false} />
              <p className="mt-2 max-w-3xl text-xs text-ink-muted">
                Blank = the state has no published value for that indicator (it is left out of that state's score, not
                counted as zero). Each indicator uses its own latest year, shown in its column heading.
              </p>
              {top && (
                <button
                  type="button"
                  onClick={() =>
                    navigate("/research-opportunities", {
                      state: { state: top.state, indicatorId: RESEARCH_ID[topBurden?.id ?? "cdr"] ?? "cdr", determinantId: "poverty" },
                    })
                  }
                  className="mt-4 rounded-md bg-series-1 px-3 py-1.5 text-sm font-medium text-white hover:bg-seq-650"
                >
                  Explore research opportunities for {top.state} →
                </button>
              )}
              <div className="mt-4 flex flex-wrap gap-4">
                {Array.from(new Set(active.map((r) => r.spec.sourceKey))).map((k) => {
                  const years = active.filter((r) => r.spec.sourceKey === k).map((r) => r.year).filter((y): y is number => y !== null);
                  return <SourceNote key={k} sourceKey={k} year={years.length ? Math.max(...years) : undefined} />;
                })}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
