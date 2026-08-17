import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import DataTable, { type Column } from "../components/DataTable";
import BarRankingCard from "../components/BarRankingCard";
import InsufficientData from "../components/InsufficientData";
import SourceNote from "../components/SourceNote";
import MetadataPanel from "../components/MetadataPanel";
import { useData } from "../lib/useData";
import { INVENTORY_MAP } from "../lib/inventoryMap";
import type { Row } from "../lib/equity";
import { yearsWithCoverage, computeAverage } from "../lib/equity";
import { MALAYSIA_STATES } from "../lib/geoConstants";
import { computePriorityScores, type ScoreComponentInput } from "../lib/priorityScore";
import type { SOURCES } from "../lib/sources";

interface BurdenIndicator {
  id: string;
  label: string;
  file: "health_outcomes_state.json" | "nhms_ncd_state.json";
  field: string;
  unit: string;
  sourceKey: keyof typeof SOURCES;
  filter?: (r: Row) => boolean;
}

const BURDEN_INDICATORS: BurdenIndicator[] = [
  { id: "mmr", label: "Maternal mortality rate", file: "health_outcomes_state.json", field: "maternal_mortality_rate_per_100k_births", unit: "per 100,000 live births", sourceKey: "maternal_deaths" },
  { id: "cdr", label: "Crude death rate", file: "health_outcomes_state.json", field: "crude_death_rate_per_1000", unit: "per 1,000 population", sourceKey: "deaths" },
  { id: "infant", label: "Infant mortality rate", file: "health_outcomes_state.json", field: "infant_mortality_rate", unit: "per 1,000 live births", sourceKey: "early_childhood_deaths" },
  { id: "under5", label: "Under-5 mortality rate", file: "health_outcomes_state.json", field: "under5_mortality_rate", unit: "per 1,000 live births", sourceKey: "early_childhood_deaths" },
  { id: "stillbirth", label: "Stillbirth rate", file: "health_outcomes_state.json", field: "stillbirth_rate_per_1000", unit: "per 1,000 total births", sourceKey: "deaths" },
  { id: "hiv", label: "HIV incidence (diagnosed cases)", file: "health_outcomes_state.json", field: "std_hiv_incidence_per_100k", unit: "per 100,000 population", sourceKey: "std" },
  { id: "diabetes", label: "Known diabetes prevalence (NHMS)", file: "nhms_ncd_state.json", field: "known_diabetes_prevalence_pct", unit: "%", sourceKey: "nhms_ncd" },
  { id: "hypertension", label: "Known hypertension prevalence (NHMS)", file: "nhms_ncd_state.json", field: "known_hypertension_prevalence_pct", unit: "%", sourceKey: "nhms_ncd" },
];

interface AccessIndicator {
  id: string;
  label: string;
  file: "healthcare_access_state.json" | "sanitation_access_state.json" | "water_access_state.json" | "health_programmes_state.json";
  field: string;
  unit: string;
  sourceKey: keyof typeof SOURCES;
  filter?: (r: Row) => boolean;
}

const ACCESS_INDICATORS: AccessIndicator[] = [
  { id: "staff", label: "Healthcare staff availability", file: "healthcare_access_state.json", field: "staff_per_100k", unit: "per 100,000 population", sourceKey: "healthcare_staff" },
  { id: "beds", label: "Hospital bed availability", file: "healthcare_access_state.json", field: "beds_per_100k", unit: "per 100,000 population", sourceKey: "hospital_beds" },
  { id: "sanitation", label: "Basic sanitation access", file: "sanitation_access_state.json", field: "sanitation_access_pct", unit: "%", sourceKey: "sanitation" },
  { id: "water", label: "Basic water access", file: "water_access_state.json", field: "water_access_pct", unit: "%", sourceKey: "water", filter: (r) => r.strata === "overall" },
  { id: "pekab40", label: "PeKa B40 screening reach (annual)", file: "health_programmes_state.json", field: "pekab40_screenings_abs", unit: "screenings", sourceKey: "health_programmes" },
];

const COMPONENT_LABELS: Record<string, string> = {
  burden: "Health burden (proxy)",
  ses: "Socioeconomic disadvantage",
  access: "Healthcare access gap",
  equity: "Equity gap (deviation from national average)",
};

function valuesByState(rows: Row[] | null, year: number | null, field: string, filter?: (r: Row) => boolean): Map<string, number | null> {
  const m = new Map<string, number | null>();
  if (!rows || year === null) return m;
  const filtered = filter ? rows.filter(filter) : rows;
  for (const state of MALAYSIA_STATES) {
    const row = filtered.find((r) => r.state === state && r.year === year);
    const v = row ? row[field] : undefined;
    m.set(state, typeof v === "number" ? v : null);
  }
  return m;
}

export default function PriorityAreas() {
  const navigate = useNavigate();
  const { data: healthOutcomes } = useData<Row[]>("health_outcomes_state.json");
  const { data: socioeconomic } = useData<Row[]>("socioeconomic_state.json");
  const { data: healthcareAccess } = useData<Row[]>("healthcare_access_state.json");
  const { data: nhmsNcd } = useData<Row[]>("nhms_ncd_state.json");
  const { data: sanitationAccess } = useData<Row[]>("sanitation_access_state.json");
  const { data: waterAccess } = useData<Row[]>("water_access_state.json");
  const { data: healthProgrammes } = useData<Row[]>("health_programmes_state.json");

  const BURDEN_SOURCES: Record<BurdenIndicator["file"], Row[] | null> = {
    "health_outcomes_state.json": healthOutcomes,
    "nhms_ncd_state.json": nhmsNcd,
  };
  const ACCESS_SOURCES: Record<AccessIndicator["file"], Row[] | null> = {
    "healthcare_access_state.json": healthcareAccess,
    "sanitation_access_state.json": sanitationAccess,
    "water_access_state.json": waterAccess,
    "health_programmes_state.json": healthProgrammes,
  };

  const [burdenId, setBurdenId] = useState(BURDEN_INDICATORS[0].id);
  const [accessId, setAccessId] = useState(ACCESS_INDICATORS[0].id);
  const burden = BURDEN_INDICATORS.find((b) => b.id === burdenId)!;
  const access = ACCESS_INDICATORS.find((a) => a.id === accessId)!;
  const burdenRows = BURDEN_SOURCES[burden.file];
  const accessRows = ACCESS_SOURCES[access.file];

  const [weights, setWeights] = useState<Record<string, number>>({ burden: 25, ses: 25, access: 25, equity: 25 });
  const totalWeight = Object.values(weights).reduce((s, w) => s + w, 0) || 1;

  const burdenYear = useMemo(() => yearsWithCoverage(burdenRows, burden.field)[0] ?? null, [burdenRows, burden.field]);
  const povertyYear = useMemo(() => yearsWithCoverage(socioeconomic, "poverty_absolute")[0] ?? null, [socioeconomic]);
  const accessYear = useMemo(() => yearsWithCoverage(accessRows, access.field)[0] ?? null, [accessRows, access.field]);

  const burdenValues = useMemo(() => valuesByState(burdenRows, burdenYear, burden.field, burden.filter), [burdenRows, burdenYear, burden.field, burden.filter]);
  const sesValues = useMemo(() => valuesByState(socioeconomic, povertyYear, "poverty_absolute"), [socioeconomic, povertyYear]);
  const accessValues = useMemo(() => valuesByState(accessRows, accessYear, access.field, access.filter), [accessRows, accessYear, access.field, access.filter]);

  const burdenAverage = useMemo(() => computeAverage(burdenRows, burdenYear, burden.field), [burdenRows, burdenYear, burden.field]);
  const equityValues = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const [state, v] of burdenValues) {
      m.set(state, v !== null && burdenAverage ? v - burdenAverage.mean : null);
    }
    return m;
  }, [burdenValues, burdenAverage]);

  const components: ScoreComponentInput[] = useMemo(
    () => [
      { key: "burden", label: COMPONENT_LABELS.burden, values: burdenValues, higherIsMorePriority: true },
      { key: "ses", label: COMPONENT_LABELS.ses, values: sesValues, higherIsMorePriority: true },
      { key: "access", label: COMPONENT_LABELS.access, values: accessValues, higherIsMorePriority: false },
      { key: "equity", label: COMPONENT_LABELS.equity, values: equityValues, higherIsMorePriority: true },
    ],
    [burdenValues, sesValues, accessValues, equityValues]
  );

  const scores = useMemo(() => computePriorityScores(MALAYSIA_STATES, components, weights), [components, weights]);

  const rankedScores = useMemo(
    () =>
      [...scores]
        .filter((s) => s.weightedTotal !== null)
        .sort((a, b) => (b.weightedTotal as number) - (a.weightedTotal as number)),
    [scores]
  );

  const tableColumns: Column[] = [
    { key: "state", label: "State" },
    { key: "burden_raw", label: `${burden.label} (raw)`, numeric: true },
    { key: "ses_raw", label: "Poverty rate (raw, %)", numeric: true },
    { key: "access_raw", label: `${access.label} (raw)`, numeric: true },
    { key: "equity_raw", label: "Deviation from national avg (raw)", numeric: true },
    { key: "weighted_total", label: "Priority score (0-1)", numeric: true },
    { key: "rank", label: "Rank", numeric: true },
  ];

  const tableRows = rankedScores.map((s, i) => ({
    state: s.state,
    burden_raw: s.components.find((c) => c.key === "burden")?.raw ?? null,
    ses_raw: s.components.find((c) => c.key === "ses")?.raw ?? null,
    access_raw: s.components.find((c) => c.key === "access")?.raw ?? null,
    equity_raw:
      s.components.find((c) => c.key === "equity")?.raw !== null && s.components.find((c) => c.key === "equity")?.raw !== undefined
        ? Math.round((s.components.find((c) => c.key === "equity")!.raw as number) * 100) / 100
        : null,
    weighted_total: s.weightedTotal !== null ? Math.round((s.weightedTotal as number) * 1000) / 1000 : null,
    rank: i + 1,
  }));

  const chartData = rankedScores.map((s) => ({ state: s.state, score: Math.round((s.weightedTotal as number) * 1000) / 1000 }));

  return (
    <div>
      <PageHeader
        title="Priority Areas"
        subtitle="WHAT should be investigated next? A transparent, configurable research-prioritisation tool combining real health-burden, socioeconomic-disadvantage, healthcare-access and equity-gap indicators — not a ranking of 'unhealthy' communities."
      />
      <div className="space-y-8 p-6 lg:p-10">
        <div className="rounded-lg border border-line-axis bg-plane p-4 text-sm text-ink-secondary">
          <p className="font-medium text-ink-primary">This is a research prioritisation tool, not a clinical risk score.</p>
          <p className="mt-1.5 max-w-4xl leading-relaxed">
            This is deliberately <strong>not</strong> the composite "equity index" this project's own methodology
            argues against (see the{" "}
            <a href="#/methodology" className="text-series-1 underline underline-offset-2">
              Methodology
            </a>{" "}
            page) — there is no single official weighting of health, socioeconomic and access indicators. Instead,
            every component below is a real published field, shown with its own value, and the weights are yours to
            adjust. A "higher score" means a state ranks closer to the more-disadvantaged end of the states with
            usable data for the selected indicators — describe it as a{" "}
            <em>potential priority area for further investigation</em>, never as a definitive judgement.
          </p>
        </div>

        {rankedScores.length > 0 && (
          <div className="rounded-lg border border-line-axis bg-plane p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-series-1">Key Equity Insight</div>
            <p className="mt-1 text-sm text-ink-primary">
              Under the current weights, <strong>{rankedScores[0].state}</strong> ranks as the top potential
              priority area (score {(rankedScores[0].weightedTotal as number).toFixed(2)} of 1.00), based on{" "}
              {burden.label.toLowerCase()}, poverty rate, {access.label.toLowerCase()} and deviation from the
              national average.
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              Adjust the weights or indicators below and this updates — it is not a fixed ranking.
            </p>
          </div>
        )}

        {/* Indicator + weight controls */}
        <section aria-labelledby="priority-controls">
          <h2 id="priority-controls" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Configure the score
          </h2>
          <div className="mb-4 flex flex-wrap items-end gap-4 rounded-lg border border-line-grid bg-surface p-4">
            <div>
              <label htmlFor="burden-select" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                Health burden proxy
              </label>
              <select
                id="burden-select"
                value={burdenId}
                onChange={(e) => setBurdenId(e.target.value)}
                className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
              >
                {BURDEN_INDICATORS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="access-select" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                Healthcare access indicator
              </label>
              <select
                id="access-select"
                value={accessId}
                onChange={(e) => setAccessId(e.target.value)}
                className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
              >
                {ACCESS_INDICATORS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
            <p className="ml-auto max-w-sm text-xs text-ink-muted">
              "Health burden" has no single composite in this dataset — pick whichever real outcome you want to use
              as the proxy. Socioeconomic disadvantage is fixed to the absolute poverty rate (the standard
              deprivation measure used elsewhere on this dashboard).
            </p>
          </div>

          <div className="rounded-lg border border-line-grid bg-surface p-4">
            <h3 className="mb-3 text-sm font-medium text-ink-primary">Component weights</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {(Object.keys(weights) as (keyof typeof weights)[]).map((key) => (
                <div key={key}>
                  <div className="flex items-center justify-between text-xs text-ink-secondary">
                    <label htmlFor={`weight-${key}`}>{COMPONENT_LABELS[key]}</label>
                    <span className="tabular-nums text-ink-primary">
                      {Math.round((weights[key] / totalWeight) * 100)}%
                    </span>
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
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-muted">
              Default is equal weighting (25% each) — a documented, defensible starting point, not an unstated
              assumption. Weights are automatically re-normalised to sum to 100%; a state missing a component is
              scored on its remaining components only, never penalised with a fabricated 0.
            </p>
          </div>
        </section>

        {/* Results */}
        <section aria-labelledby="priority-results">
          <h2 id="priority-results" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Priority score by state
          </h2>
          {rankedScores.length === 0 ? (
            <InsufficientData reason="Not enough states report real values for the selected indicators to compute a score." />
          ) : (
            <>
              <BarRankingCard
                title="Priority score (0 = least, 1 = most, among states with data for the selected indicators)"
                data={chartData}
                nameKey="state"
                valueKey="score"
                color="#7a3aa7"
              />
              <div className="mt-4">
                <DataTable columns={tableColumns} rows={tableRows} pageSize={16} searchable={false} />
              </div>
              <p className="mt-2 max-w-3xl text-xs text-ink-muted">
                "Deviation from national avg" is this state's {burden.label.toLowerCase()} minus the average across
                all states reporting a value in {burdenYear} — this is the real number behind the "equity gap"
                component, not a fabricated score.
              </p>
              <button
                type="button"
                onClick={() =>
                  navigate("/research-opportunities", {
                    state: { state: rankedScores[0].state, indicatorId: burdenId, determinantId: "poverty" },
                  })
                }
                className="mt-4 rounded-md bg-series-1 px-3 py-1.5 text-sm font-medium text-white hover:bg-seq-650"
              >
                Explore research opportunities for {rankedScores[0].state} →
              </button>
              <div className="mt-4 flex flex-wrap gap-4">
                <SourceNote sourceKey={burden.sourceKey} year={burdenYear ?? undefined} />
                <SourceNote sourceKey="poverty" year={povertyYear ?? undefined} />
                <SourceNote sourceKey={access.sourceKey} year={accessYear ?? undefined} />
              </div>
              <div className="mt-4">
                <MetadataPanel
                  datasetIds={Array.from(
                    new Set([
                      ...(INVENTORY_MAP["health_outcomes_state.json"] ?? []),
                      ...(INVENTORY_MAP["socioeconomic_state.json"] ?? []),
                      ...(INVENTORY_MAP["healthcare_access_state.json"] ?? []),
                    ])
                  )}
                />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
