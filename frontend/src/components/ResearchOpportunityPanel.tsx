import EquityInsightCard, { buildEquityInsight } from "./EquityInsightCard";
import InsufficientData from "./InsufficientData";
import { generateResearchQuestions } from "../lib/researchQuestionTemplates";
import { matchTechOpportunities } from "../lib/techOpportunityMap";
import { computeAverage, fmt, type Row } from "../lib/equity";
import type { FieldDef } from "../lib/determinantFields";

/**
 * The "From Inequity to Research Opportunities" signature panel. Every part
 * is deterministic (no LLM): (a) the observed-pattern sentence reuses
 * buildEquityInsight verbatim, (b) research questions are filled templates,
 * (c) technology opportunities are a plain rule lookup. Four visually
 * distinct sections keep OBSERVED DATA / ANALYTICAL FRAMING / RESEARCH
 * QUESTIONS / TECH OPPORTUNITIES from blurring into each other.
 */
export default function ResearchOpportunityPanel({
  state,
  outcome,
  determinant,
  outcomeRows,
  year,
}: {
  state: string;
  outcome: FieldDef;
  determinant?: FieldDef;
  outcomeRows: Row[] | null;
  year: number | null;
}) {
  const insight = buildEquityInsight({
    rows: outcomeRows,
    year,
    valueField: outcome.field,
    metricLabel: outcome.label,
    unit: outcome.unit,
    higherIsWorse: outcome.higherIsWorse,
  });

  const average = computeAverage(outcomeRows, year, outcome.field);
  const stateRow = outcomeRows?.find((r) => r.state === state && r.year === year);
  const stateValue = stateRow && typeof stateRow[outcome.field] === "number" ? (stateRow[outcome.field] as number) : null;

  const isWorseThanAverage =
    stateValue !== null && average ? (outcome.higherIsWorse ? stateValue > average.mean : stateValue < average.mean) : false;

  const districtDataAvailable = outcome.file !== "health_outcomes_state.json";

  const questions = generateResearchQuestions({
    state,
    outcomeLabel: outcome.label,
    determinantLabel: determinant?.label,
    gapMagnitude: insight ? "measured" : undefined,
    districtDataAvailable,
  });

  const isAccessOutcome = outcome.id === "staff_out" || outcome.id === "beds_out";
  const isMaternalChild = ["mmr", "imr", "u5mr"].includes(outcome.id);
  const isDeathRate = outcome.id === "cdr";
  const isStd = outcome.id === "hiv";

  const techRules = matchTechOpportunities({
    lowHealthcareAccess: isAccessOutcome && isWorseThanAverage,
    highMaternalOrChildMortality: isMaternalChild && isWorseThanAverage,
    highDeathRateOrChronicBurden: isDeathRate && isWorseThanAverage,
    highStdIncidence: isStd && isWorseThanAverage,
    highPovertyWithAccessGap: determinant?.id === "poverty" && isAccessOutcome && isWorseThanAverage,
    districtDataUnavailable: !districtDataAvailable,
  });

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-secondary">Observed data</h3>
        <EquityInsightCard
          insight={insight}
          reason={`Fewer than two states report ${outcome.label.toLowerCase()} for ${year ?? "the selected year"}.`}
        />
        {stateValue !== null && average && (
          <p className="mt-2 text-sm text-ink-secondary">
            <strong className="text-ink-primary">{state}</strong> reports {fmt(stateValue, 1)} {outcome.unit} for{" "}
            {outcome.label.toLowerCase()} in {year}, compared with a national average of {fmt(average.mean, 1)}{" "}
            {outcome.unit} (n={average.n}).
          </p>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-secondary">What does the data suggest?</h3>
        <div className="rounded-lg border border-line-axis bg-plane p-4 text-sm text-ink-secondary">
          {state} {isWorseThanAverage ? "shows a higher observed burden" : "does not show a higher observed burden"} for{" "}
          {outcome.label.toLowerCase()} relative to the national average
          {determinant ? `, alongside its reported ${determinant.label.toLowerCase()}` : ""}. This is a descriptive
          pattern from published data, not a causal explanation.
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-secondary">Potential research questions</h3>
        <p className="mb-2 text-xs text-ink-muted">
          Auto-generated from the selected variables — <strong>suggested questions for further investigation</strong>,
          not answers, and not vetted by a domain expert. Verify feasibility and ethics/data-access requirements
          before use.
        </p>
        <ul className="space-y-2">
          {questions.map((q) => (
            <li key={q.id} className="rounded-lg border border-line-grid bg-surface p-3 text-sm text-ink-primary">
              {q.question}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-secondary">
          Potential healthcare technology opportunities
        </h3>
        <p className="mb-2 text-xs text-ink-muted">
          Illustrative technology categories only — not a recommendation or endorsement of any specific vendor or
          solution. Health need first, technology second.
        </p>
        {techRules.length === 0 ? (
          <InsufficientData reason="No condition in this rule-based mapping is currently flagged for this selection." />
        ) : (
          <div className="space-y-3">
            {techRules.map((rule) => (
              <div key={rule.condition} className="rounded-lg border border-line-grid bg-surface p-3">
                <p className="text-xs font-medium text-ink-primary">{rule.condition}</p>
                <ul className="mt-2 space-y-1">
                  {rule.opportunities.map((op) => (
                    <li key={op.category} className="text-sm text-ink-secondary">
                      <strong className="text-ink-primary">{op.category}:</strong> {op.description}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
