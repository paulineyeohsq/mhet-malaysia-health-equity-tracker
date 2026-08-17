import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import CorrelationCaveat from "../components/CorrelationCaveat";
import ResearchOpportunityPanel from "../components/ResearchOpportunityPanel";
import { useData } from "../lib/useData";
import type { Row } from "../lib/equity";
import { yearsWithCoverage, computeGroupGapStats, fmt } from "../lib/equity";
import { MALAYSIA_STATES } from "../lib/geoConstants";
import { OUTCOME_FIELDS, DETERMINANT_FIELDS, rowsForField, type FieldDef } from "../lib/determinantFields";
import { buildStructuredQuestion } from "../lib/researchQuestionTemplates";
import { useChat } from "../lib/chatContext";
import MetadataPanel from "../components/MetadataPanel";
import MarkdownLite from "../components/MarkdownLite";
import { INVENTORY_MAP } from "../lib/inventoryMap";

const POPULATION_SCOPES = ["General population", "Older adults (65+)", "Children under 5", "Adults of working age"];
const EQUITY_DIMENSIONS = ["Income", "Poverty", "Healthcare access", "Geographic (state-level)"];

/**
 * Bridges common ways a user might phrase an interest to the actual words
 * used in OUTCOME_FIELDS labels — e.g. a user typing "access" should match
 * "Healthcare staff availability" even though "access" isn't literally in
 * that label. Deliberately a small, reviewable, hand-written map rather
 * than an AI call: matching which real indicators exist is a closed-set
 * lookup this app can answer deterministically, so it isn't left to an LLM
 * to (possibly inconsistently) decide. Keys/values are lowercase tokens.
 */
const TOPIC_SYNONYMS: Record<string, string[]> = {
  diabetes: ["diabetes", "glucose", "sugar"],
  glucose: ["glucose", "diabetes", "sugar"],
  sugar: ["glucose", "diabetes"],
  hypertension: ["hypertension", "pressure"],
  pressure: ["pressure", "hypertension"],
  cholesterol: ["cholesterol", "hypercholesterolaemia"],
  cardiovascular: ["cholesterol", "pressure", "hypertension"],
  heart: ["cholesterol", "pressure", "hypertension"],
  obesity: ["obesity", "overweight", "underweight", "abdominal"],
  overweight: ["overweight", "obesity", "abdominal"],
  weight: ["overweight", "obesity", "underweight", "abdominal"],
  bmi: ["overweight", "obesity", "underweight", "abdominal"],
  smoking: ["smoker"],
  tobacco: ["smoker"],
  cigarette: ["smoker"],
  alcohol: ["drinker", "drinking"],
  drinking: ["drinker", "alcohol"],
  exercise: ["inactivity", "active"],
  activity: ["inactivity", "active"],
  inactive: ["inactivity"],
  sedentary: ["inactivity"],
  mental: ["depression", "anxiety", "stress"],
  psychological: ["depression", "anxiety", "stress"],
  depression: ["depression"],
  anxiety: ["anxiety"],
  stress: ["stress"],
  maternal: ["maternal", "birth"],
  pregnancy: ["maternal", "fertility", "birth"],
  childbirth: ["maternal", "birth"],
  child: ["under5"],
  children: ["under5"],
  hiv: ["hiv"],
  aids: ["hiv"],
  sti: ["hiv"],
  std: ["hiv"],
  healthcare: ["staff", "bed", "hospital", "availability"],
  hospital: ["staff", "bed", "hospital", "availability"],
  access: ["staff", "bed", "hospital", "availability"],
  staff: ["staff", "availability"],
  workforce: ["staff", "availability"],
  doctor: ["staff", "availability"],
  nurse: ["staff", "availability"],
  clinic: ["staff", "bed", "hospital"],
  fertility: ["fertility", "birth"],
  birth: ["birth", "fertility"],
  adolescent: ["adolescent"],
  teen: ["adolescent"],
  teenager: ["adolescent"],
  youth: ["adolescent"],
  death: ["death", "mortality"],
  mortality: ["death", "mortality"],
  dying: ["death", "mortality"],
  ncd: ["diabetes", "hypertension", "cholesterol", "glucose"],
  chronic: ["diabetes", "hypertension", "cholesterol", "glucose"],
  noncommunicable: ["diabetes", "hypertension", "cholesterol", "glucose"],
};

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => w.length >= 3);
}

/**
 * Deterministic (not AI-decided) relevance match: expands the user's typed
 * words via TOPIC_SYNONYMS, then scores each OUTCOME_FIELDS entry by token
 * overlap with its label. Returns fields sorted by score, best first; empty
 * array means nothing in this dashboard's tracked indicators matched by
 * keyword — a real, honest "not covered here" result, not a guess.
 */
function matchOutcomeFields(interest: string): FieldDef[] {
  const tokens = tokenize(interest);
  if (tokens.length === 0) return [];
  const expanded = new Set(tokens);
  for (const t of tokens) {
    // Try the token as-is, then a naive singular (strip trailing "s") —
    // TOPIC_SYNONYMS is keyed on singular forms, so "teenagers"/"children"
    // still resolve without needing every plural spelled out by hand.
    const singular = t.endsWith("s") && t.length > 3 ? t.slice(0, -1) : t;
    for (const syn of TOPIC_SYNONYMS[t] ?? TOPIC_SYNONYMS[singular] ?? []) expanded.add(syn);
  }
  const scored = OUTCOME_FIELDS.map((field) => {
    const labelTokens = tokenize(field.label);
    let score = 0;
    for (const t of expanded) {
      if (labelTokens.some((lw) => lw === t || lw.includes(t) || t.includes(lw))) score++;
    }
    return { field, score };
  }).filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.map((x) => x.field);
}

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
    "forest_reserve_state.json": null,
    "water_consumption_state.json": null,
    "water_production_state.json": null,
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

  // ---- Automated research question suggestion (AI agent) ----
  // The gap computed for every outcome indicator below is 100% real —
  // the exact same computeGroupGapStats() used everywhere else in this
  // app, no invented numbers. What used to be hardcoded here was the
  // DECISION (always pick the single largest ratio) and the JUSTIFICATION
  // (a fixed sentence template). Both of those now come from the Gemini
  // agent instead: it's handed the full real table below — every outcome,
  // its worst/best state, and the gap between them — and asked to pick
  // the most compelling starting point and explain why in its own words,
  // the same way "Explain this" already grounds Gemini in real chart data
  // rather than letting it invent anything. The answer now renders directly
  // in an on-page card (via askDirect, which doesn't touch the shared chat
  // panel state), not the Ask MY-HEO panel — there's still no deterministic
  // winner to parse back out and auto-fill the selects with, but showing it
  // inline avoids sending the user to a different part of the page for an
  // answer to a question they asked right here.
  const { askDirect } = useChat();

  // Markdown table, not a loose pipe-separated wall of text — a real
  // header/separator row gives the model an unambiguous column structure to
  // align against, which a same-content free-text version of this prompt
  // did not: a live test surfaced Gemini stating numbers for one row that
  // didn't match the real data it was given, despite an explicit "don't
  // invent numbers" instruction. Units are dropped from the table (kept
  // only in the on-page selects) since the long NHMS methodology
  // parentheticals were adding noise without helping the model pick a row.
  // Shared by both the suggestion card and the research-interest card below
  // so they're always grounded in the exact same real numbers.
  function buildGapTable(fields: FieldDef[] = OUTCOME_FIELDS): string[] {
    const rows: string[] = ["| Indicator | Year | Worst state | Worst value | Best state | Best value | Ratio |", "|---|---|---|---|---|---|---|"];
    for (const field of fields) {
      let fieldRows = rowsForField(OUTCOME_SOURCES[field.file], field);
      // NHMS survey fields carry a per-indicator "<stem>_unreliable" flag
      // (small sample size / high relative standard error) — exclude those
      // rows before ranking states, so a flagged outlier is never handed
      // to the agent as if it were a reliable data point.
      const reliabilityKey = field.field.replace(/_prevalence_pct$/, "_unreliable");
      if (reliabilityKey !== field.field && fieldRows?.some((r) => reliabilityKey in r)) {
        fieldRows = fieldRows.filter((r) => r[reliabilityKey] !== true);
      }
      const year = yearsWithCoverage(fieldRows, field.field)[0] ?? null;
      const stats = computeGroupGapStats(fieldRows, year, field.field, field.higherIsWorse);
      if (!stats || stats.ratio === null || year === null) continue;
      rows.push(
        `| ${field.label} | ${year} | ${stats.worst.name} | ${fmt(stats.worst.value, 1)} | ${stats.best.name} | ${fmt(stats.best.value, 1)} | ${fmt(stats.ratio, 1)}× |`
      );
    }
    return rows;
  }

  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [excludeIndicators, setExcludeIndicators] = useState<string[]>([]);
  const [hasAutoSuggested, setHasAutoSuggested] = useState(false);

  async function handleSuggest() {
    const rows = buildGapTable();
    if (rows.length < 3 || suggestLoading) return;
    setSuggestLoading(true);
    setSuggestError(null);
    try {
      const exclusionRule = excludeIndicators.length
        ? `- Do not pick these indicators again — they were already suggested in this session: ${excludeIndicators.join(", ")}. Choose a different one this time.\n`
        : "";
      const reply = await askDirect(
        `I'm using the Malaysia Health Equity Observatory dashboard's Research Opportunities page. The table below is ` +
          `the ONLY data you may use for this task — a real, computed table for every outcome indicator this dashboard ` +
          `tracks: the state reporting the worst value, the state reporting the best value, and the ratio between them, ` +
          `all in the most recent year each indicator has data for.\n\n${rows.join("\n")}\n\n` +
          `Rules:\n` +
          `- Use ONLY the numbers in this table. Do not use outside knowledge about Malaysian health statistics, and ` +
          `do not recalculate, round differently, or restate any number other than exactly as it appears above.\n` +
          `- Pick exactly ONE row as the most compelling starting point for further research — not necessarily the ` +
          `largest ratio, but the one you judge most policy-relevant, actionable, or under-explored.\n` +
          exclusionRule +
          `\nRespond in exactly this format:\n` +
          `INDICATOR: <exact indicator name, copied from the table>\n` +
          `ROW: <the exact matching row, copied verbatim from the table above, unchanged>\n` +
          `WHY THIS ONE: <2-3 sentences of your own reasoning>`
      );
      setSuggestion(reply);
      const match = /INDICATOR:\s*(.+)/.exec(reply);
      if (match) setExcludeIndicators((prev) => Array.from(new Set([...prev, match[1].trim()])));
    } catch (e) {
      setSuggestError(e instanceof Error ? e.message : String(e));
    } finally {
      setSuggestLoading(false);
    }
  }

  // Auto-generate one suggestion as soon as the real indicator data has
  // loaded, so the card never sits empty waiting for a click — "Refresh"
  // (same button, relabelled once a suggestion exists) is how a user asks
  // for another. Guarded by hasAutoSuggested so this only ever fires once
  // per page visit, not on every re-render as more datasets stream in.
  useEffect(() => {
    if (hasAutoSuggested) return;
    if (buildGapTable().length < 3) return;
    setHasAutoSuggested(true);
    void handleSuggest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [healthOutcomes, healthcareAccess, nhmsNcd, nhmsAdolescentMentalHealth, fertility, hasAutoSuggested]);

  // ---- Explore by research interest ----
  // Relevance is decided deterministically (matchOutcomeFields, a keyword
  // match against real indicator labels) rather than asking Gemini to pick
  // relevant rows out of the full table — Gemini's job here is narrowed to
  // explaining/phrasing questions about a table that's *already* scoped to
  // the topic, which is both more reliable (a closed-set keyword match
  // can't invent a match) and, empirically, keeps the model from drifting
  // into a broad "here's everything in the table" summary instead of
  // answering what was actually typed.
  const [interestText, setInterestText] = useState("");
  const [interestMatchedFields, setInterestMatchedFields] = useState<FieldDef[] | null>(null);
  const [interestResult, setInterestResult] = useState<string | null>(null);
  const [interestLoading, setInterestLoading] = useState(false);
  const [interestError, setInterestError] = useState<string | null>(null);

  async function handleInterestSubmit() {
    const trimmed = interestText.trim();
    if (!trimmed || interestLoading) return;
    if (buildGapTable().length < 3) {
      setInterestError("Indicator data hasn't finished loading yet — try again in a moment.");
      return;
    }
    const matched = matchOutcomeFields(trimmed);
    setInterestMatchedFields(matched);
    // Cap at 8 so a broad interest (e.g. "health") that matches many
    // indicators doesn't balloon the prompt — the AI still only ever sees
    // real, matched rows, just the strongest-scoring subset of them.
    const scopedFields = matched.slice(0, 8);
    const rows = buildGapTable(scopedFields.length > 0 ? scopedFields : OUTCOME_FIELDS);
    setInterestLoading(true);
    setInterestError(null);
    try {
      const reply = await askDirect(
        `I'm using the Malaysia Health Equity Observatory dashboard's Research Opportunities page. The table below is ` +
          `the ONLY data you may use for this task — a real, computed table for every outcome indicator this dashboard ` +
          `tracks: the state reporting the worst value, the state reporting the best value, and the ratio between them, ` +
          `all in the most recent year each indicator has data for.\n\n${rows.join("\n")}\n\n` +
          `A user of this dashboard has typed the following research interest, in their own words: "${trimmed}"\n\n` +
          (scopedFields.length > 0
            ? `This table has ALREADY been filtered by keyword match to only the indicators relevant to that stated ` +
              `interest — every row below is relevant, none are extra. Discuss the row(s) below only; do not describe ` +
              `or summarise any indicator not shown in this table.\n\n`
            : `No indicator this dashboard tracks matched that stated interest by keyword, so the FULL indicator table ` +
              `is shown below only so you can check for yourself. State plainly that nothing in this dashboard's ` +
              `tracked indicators directly covers their interest. Only if one row is genuinely closely related may ` +
              `you mention it as the nearest available proxy — do not force an unrelated match, and do not describe ` +
              `the rest of the table.\n\n`) +
          `Rules:\n` +
          `- Use ONLY the numbers and indicators in the table above. Do not use outside knowledge about Malaysian ` +
          `health statistics, and do not recalculate, round differently, or restate any number other than exactly ` +
          `as it appears above.\n` +
          `- For each relevant row, write one short suggested research question a researcher could investigate, tied ` +
          `to the user's stated interest and the real gap shown in that row.\n\n` +
          `For each row, respond in this format:\n` +
          `INDICATOR: <exact indicator name, copied from the table>\n` +
          `ROW: <the exact matching row, copied verbatim from the table above, unchanged>\n` +
          `SUGGESTED QUESTION: <one research question tied to this row and the user's interest>`
      );
      setInterestResult(reply);
    } catch (e) {
      setInterestError(e instanceof Error ? e.message : String(e));
    } finally {
      setInterestLoading(false);
    }
  }

  const outcome = OUTCOME_FIELDS.find((f) => f.id === outcomeId)!;
  const determinant = DETERMINANT_FIELDS.find((f) => f.id === determinantId);
  const outcomeSourceRows = OUTCOME_SOURCES[outcome.file];
  const outcomeRows = useMemo(() => rowsForField(outcomeSourceRows, outcome), [outcomeSourceRows, outcome]);
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
        <MetadataPanel
          datasetIds={Array.from(
            new Set([...OUTCOME_FIELDS, ...DETERMINANT_FIELDS].flatMap((f) => INVENTORY_MAP[f.file] ?? []))
          )}
        />

        <section aria-labelledby="ro-suggest">
          <h2 id="ro-suggest" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Not sure where to start?
          </h2>
          <div className="rounded-lg border border-line-axis bg-plane p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-2xl text-sm text-ink-secondary">
                Computes the real state-to-state gap for every outcome indicator this dashboard tracks, then asks the
                MY-HEO Assistant (Gemini) to pick the most compelling starting point and explain why — the numbers
                are always real and computed, never invented, but the pick and the reasoning come from the AI agent,
                not a fixed rule.
              </p>
              <button
                type="button"
                onClick={handleSuggest}
                disabled={suggestLoading}
                className="shrink-0 rounded-md bg-series-1 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
              >
                {suggestLoading ? "Thinking…" : suggestion ? "Refresh — suggest another" : "Suggest a research question"}
              </button>
            </div>
            <div className="mt-4 rounded-md border border-line-grid bg-surface p-4">
              {suggestError ? (
                <p className="text-sm text-status-critical">Couldn't get a suggestion: {suggestError}</p>
              ) : suggestion ? (
                <MarkdownLite text={suggestion} />
              ) : (
                <p className="text-sm text-ink-muted">
                  {suggestLoading ? "Asking the MY-HEO Assistant…" : "Loading real indicator gaps…"}
                </p>
              )}
            </div>
          </div>
        </section>

        <section aria-labelledby="ro-interest">
          <h2 id="ro-interest" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Have a research interest in mind?
          </h2>
          <div className="rounded-lg border border-line-axis bg-plane p-4">
            <p className="max-w-2xl text-sm text-ink-secondary">
              Type a topic in your own words — the same real gap table above is matched against your interest, so any
              question surfaced is tied to a real indicator this dashboard actually tracks, never an invented one.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleInterestSubmit();
              }}
              className="mt-3 flex flex-wrap items-end gap-3"
            >
              <div className="min-w-[240px] flex-1">
                <label htmlFor="ro-interest-input" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                  e.g. "diabetes in rural areas", "maternal health", "poverty and healthcare access"
                </label>
                <input
                  id="ro-interest-input"
                  type="text"
                  value={interestText}
                  onChange={(e) => setInterestText(e.target.value)}
                  placeholder="Your research interest…"
                  className="mt-1 w-full rounded-md border border-line-axis px-2 py-1.5 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={interestLoading || !interestText.trim()}
                className="shrink-0 rounded-md bg-series-1 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
              >
                {interestLoading ? "Searching…" : "Find relevant questions"}
              </button>
            </form>
            {(interestResult || interestError) && (
              <div className="mt-4 rounded-md border border-line-grid bg-surface p-4">
                {interestError ? (
                  <p className="text-sm text-status-critical">Couldn't search: {interestError}</p>
                ) : (
                  <>
                    <p className="mb-2 text-xs text-ink-muted">
                      {interestMatchedFields && interestMatchedFields.length > 0
                        ? `Matched by keyword to ${interestMatchedFields.length} tracked indicator${interestMatchedFields.length > 1 ? "s" : ""}: ${interestMatchedFields.map((f) => f.label).join(", ")}.`
                        : "No tracked indicator matched your interest by keyword — showing the full indicator list for context; see below for what the assistant found."}
                    </p>
                    <MarkdownLite text={interestResult as string} />
                  </>
                )}
              </div>
            )}
          </div>
        </section>

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
