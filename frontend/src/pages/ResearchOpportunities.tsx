import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import CorrelationCaveat from "../components/CorrelationCaveat";
import ResearchOpportunityPanel from "../components/ResearchOpportunityPanel";
import { useData } from "../lib/useData";
import type { Row } from "../lib/equity";
import { yearsWithCoverage } from "../lib/equity";
import { MALAYSIA_STATES } from "../lib/geoConstants";
import { OUTCOME_FIELDS, DETERMINANT_FIELDS, rowsForField, type FieldDef } from "../lib/determinantFields";
import { buildStructuredQuestion } from "../lib/researchQuestionTemplates";

const POPULATION_SCOPES = ["General population", "Older adults (65+)", "Children under 5", "Adults of working age"];
const EQUITY_DIMENSIONS = ["Income", "Poverty", "Healthcare access", "Geographic (state-level)"];

export default function ResearchOpportunities() {
  const location = useLocation();
  const { data: healthOutcomes } = useData<Row[]>("health_outcomes_state.json");
  const { data: healthcareAccess } = useData<Row[]>("healthcare_access_state.json");
  const { data: nhmsNcd } = useData<Row[]>("nhms_ncd_state.json");
  const { data: nhmsAdolescentMentalHealth } = useData<Row[]>("nhms_adolescent_mental_health_state.json");
  const { data: fertility } = useData<Row[]>("fertility_state.json");
  const OUTCOME_SOURCES: Record<FieldDef["file"], Row[] | null> = {
    "health_outcomes_state.json": healthOutcomes,
    "healthcare_access_state.json": healthcareAccess,
    "nhms_ncd_state.json": nhmsNcd,
    "nhms_adolescent_mental_health_state.json": nhmsAdolescentMentalHealth,
    "fertility_state.json": fertility,
    "socioeconomic_state.json": null,
    "sanitation_access_state.json": null,
    "water_access_state.json": null,
    "marriages_state.json": null,
    "health_programmes_state.json": null,
  };

  const [selectedState, setSelectedState] = useState<string>(MALAYSIA_STATES[0]);
  const [outcomeId, setOutcomeId] = useState(OUTCOME_FIELDS[1].id); // mmr by default
  const [determinantId, setDeterminantId] = useState<string>("poverty");

  useEffect(() => {
    const s = location.state as { state?: string; indicatorId?: string; determinantId?: string } | null;
    if (s?.state) setSelectedState(s.state);
    if (s?.indicatorId && OUTCOME_FIELDS.some((f) => f.id === s.indicatorId)) setOutcomeId(s.indicatorId);
    if (s?.determinantId && DETERMINANT_FIELDS.some((f) => f.id === s.determinantId)) setDeterminantId(s.determinantId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const outcome = OUTCOME_FIELDS.find((f) => f.id === outcomeId)!;
  const determinant = DETERMINANT_FIELDS.find((f) => f.id === determinantId);
  const outcomeRows = useMemo(() => rowsForField(OUTCOME_SOURCES[outcome.file], outcome), [OUTCOME_SOURCES[outcome.file], outcome]);
  const year = useMemo(() => yearsWithCoverage(outcomeRows, outcome.field)[0] ?? null, [outcomeRows, outcome.field]);

  // Minimal embedded Research Question Builder (deterministic templates, not chat).
  const [population, setPopulation] = useState(POPULATION_SCOPES[0]);
  const [equityDimension, setEquityDimension] = useState(EQUITY_DIMENSIONS[1]);
  const structuredQuestion = buildStructuredQuestion({
    population,
    location: selectedState,
    outcome: outcome.label,
    determinant: determinant?.label ?? "the selected determinant",
    equityDimension,
  });

  return (
    <div>
      <PageHeader
        title="Research Opportunities"
        subtitle="From inequity to research opportunities: turn an observed disparity into suggested research questions and illustrative technology directions — never claims of cause, never answers."
      />
      <div className="space-y-8 p-6 lg:p-10">
        <CorrelationCaveat />

        <section aria-labelledby="ro-controls">
          <h2 id="ro-controls" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Selection
          </h2>
          <div className="mb-4 flex flex-wrap items-end gap-4 rounded-lg border border-line-grid bg-surface p-4">
            <div>
              <label htmlFor="ro-state" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                State
              </label>
              <select
                id="ro-state"
                value={selectedState}
                onChange={(e) => setSelectedState(e.target.value)}
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
              <label htmlFor="ro-outcome" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                Health outcome
              </label>
              <select
                id="ro-outcome"
                value={outcomeId}
                onChange={(e) => setOutcomeId(e.target.value)}
                className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
              >
                {OUTCOME_FIELDS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="ro-determinant" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                Potential determinant
              </label>
              <select
                id="ro-determinant"
                value={determinantId}
                onChange={(e) => setDeterminantId(e.target.value)}
                className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
              >
                {DETERMINANT_FIELDS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section aria-labelledby="ro-panel">
          <h2 id="ro-panel" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            {selectedState} — {outcome.label}
          </h2>
          <ResearchOpportunityPanel
            state={selectedState}
            outcome={outcome}
            determinant={determinant}
            outcomeRows={outcomeRows}
            year={year}
          />
        </section>

        {/* Research Question Builder (Researcher Mode, minimal/embedded this phase) */}
        <section aria-labelledby="ro-builder">
          <h2 id="ro-builder" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Research Question Builder
          </h2>
          <p className="mb-3 max-w-3xl text-sm text-ink-secondary">
            Select a population, geography, outcome, determinant and equity dimension to generate a structured
            research question. This is a deterministic sentence template, not an AI-generated suggestion.
          </p>
          <div className="mb-4 flex flex-wrap items-end gap-4 rounded-lg border border-line-grid bg-surface p-4">
            <div>
              <label htmlFor="rqb-population" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                Population (descriptive framing only — not a data filter)
              </label>
              <select
                id="rqb-population"
                value={population}
                onChange={(e) => setPopulation(e.target.value)}
                className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
              >
                {POPULATION_SCOPES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="rqb-equity" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                Equity dimension
              </label>
              <select
                id="rqb-equity"
                value={equityDimension}
                onChange={(e) => setEquityDimension(e.target.value)}
                className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
              >
                {EQUITY_DIMENSIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="rounded-lg border border-line-axis bg-plane p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-series-1">
              Suggested research question for further investigation
            </p>
            <p className="mt-1 text-sm text-ink-primary">{structuredQuestion}</p>
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            "Population" here is a descriptive framing for the question text only — this dataset doesn't have health
            outcomes broken down by age/sex/population subgroup beyond national-level nutrition-by-sex (2019), so
            selecting a population above does not filter the underlying data.
          </p>
        </section>
      </div>
    </div>
  );
}
