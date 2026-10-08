import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import CorrelationCaveat from "../components/CorrelationCaveat";
import ResearchOpportunityPanel from "../components/ResearchOpportunityPanel";
import { useData } from "../lib/useData";
import type { Row } from "../lib/equity";
import { yearsWithCoverage, computeGroupGapStats, computeAverage, fmt } from "../lib/equity";
import { MALAYSIA_STATES } from "../lib/geoConstants";
import { OUTCOME_FIELDS, DETERMINANT_FIELDS, rowsForField, type FieldDef } from "../lib/determinantFields";
import { buildStructuredQuestion } from "../lib/researchQuestionTemplates";
import { aiCacheKey, readAiCache, writeAiCache } from "../lib/aiCache";
import { findBestYear, buildPairs, computeCorrelationStats, interpretCorrelation } from "../lib/correlation";
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
  const { data: socioeconomic } = useData<Row[]>("socioeconomic_state.json");
  const OUTCOME_SOURCES: Record<FieldDef["file"], Row[] | null> = {
    "health_outcomes_state.json": healthOutcomes,
    "healthcare_access_state.json": healthcareAccess,
    "nhms_ncd_state.json": nhmsNcd,
    "nhms_adolescent_mental_health_state.json": nhmsAdolescentMentalHealth,
    "fertility_state.json": fertility,
    "socioeconomic_state.json": socioeconomic,
    "sanitation_access_state.json": null,
    "water_access_state.json": null,
    "marriages_state.json": null,
    "health_programmes_state.json": null,
    "forest_reserve_state.json": null,
    "water_consumption_state.json": null,
    "water_production_state.json": null,
  };

  const [selectedState, setSelectedState] = useState<string>(MALAYSIA_STATES[0]);
  const [outcomeId, setOutcomeId] = useState("cdr"); // crude death rate: always has a defined state-to-state ratio (maternal mortality opens on "ratio undefined" when a state reports 0)
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

  // Core, always-available determinants to check for a correlation against
  // whichever outcomes the interest search matches — income/poverty/Gini
  // (socioeconomic_state.json) plus healthcare staff/bed availability
  // (healthcare_access_state.json), both already fetched above for other
  // parts of this page. Deliberately a small fixed set, not all 23
  // DETERMINANT_FIELDS: checking every determinant against every matched
  // outcome would multiply the number of correlation computations and the
  // prompt size for little added value, since these five are the most
  // commonly asked-about determinants (and the ones with the broadest real
  // state-level coverage) — see DeterminantsExplorer for the full picker.
  const CORE_DETERMINANT_IDS = ["income", "poverty", "gini", "staff_det", "beds_det"];
  const CORE_DETERMINANTS = DETERMINANT_FIELDS.filter((f) => CORE_DETERMINANT_IDS.includes(f.id));

  /**
   * Real Pearson/Spearman correlation (lib/correlation.ts — the same engine
   * Determinants Explorer uses) between one outcome and each core
   * determinant, for whichever single year has the most complete overlap.
   * Returns the strongest of the five by |Pearson r|, or null if none of
   * them share enough real, non-null state-year data to compute one at all
   * — never a fabricated or estimated correlation.
   */
  function findTopCorrelation(outcomeField: FieldDef) {
    const outcomeRows = rowsForField(OUTCOME_SOURCES[outcomeField.file], outcomeField);
    if (!outcomeRows) return null;
    let best: { determinant: FieldDef; year: number; n: number; stats: NonNullable<ReturnType<typeof computeCorrelationStats>> } | null = null;
    for (const det of CORE_DETERMINANTS) {
      // Guard against self-correlation: "Healthcare staff availability" and
      // "Hospital bed availability" each appear as BOTH an outcome and a
      // core determinant (same underlying file+field, just offered from
      // two different pickers elsewhere on this page) — correlating a
      // field against itself is always a trivial, meaningless r=1.00.
      if (det.file === outcomeField.file && det.field === outcomeField.field) continue;
      const detRows = rowsForField(OUTCOME_SOURCES[det.file], det);
      if (!detRows) continue;
      const { year, n } = findBestYear(detRows, outcomeRows, det.field, outcomeField.field);
      if (year === null || n < 3) continue;
      const pairs = buildPairs(detRows, outcomeRows, year, det.field, outcomeField.field);
      const stats = computeCorrelationStats(pairs);
      if (!stats) continue;
      if (!best || Math.abs(stats.pearson) > Math.abs(best.stats.pearson)) {
        best = { determinant: det, year, n, stats };
      }
    }
    return best;
  }

  /** Plain-text lines summarising each field's strongest real correlation
   * (or the honest absence of one), for the AI prompt below — computed
   * entirely by lib/correlation.ts, the AI never computes or estimates a
   * correlation itself. */
  function buildCorrelationSummary(fields: FieldDef[]): string[] {
    return fields.slice(0, 4).map((field) => {
      const top = findTopCorrelation(field);
      if (!top) {
        return `- ${field.label}: no correlation could be computed against income, poverty rate, Gini coefficient, healthcare staff availability or hospital bed availability (not enough states report both in any shared year).`;
      }
      const { label } = interpretCorrelation(top.stats.pearson);
      const cautionNote = top.stats.reliable ? "" : ` — based on only ${top.n} states, read with caution`;
      return `- ${field.label} vs ${top.determinant.label} (${top.year}, n=${top.n} states): Pearson r = ${top.stats.pearson.toFixed(2)} (${label})${cautionNote}.`;
    });
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
      // Instructions come FIRST and the (long) data table LAST: if a prompt
      // ever exceeds the backend's per-message cap, what gets cut is the tail
      // of the table, never the rules or required response format.
      const reply = await askDirect(
        `You are helping a user of the Malaysia Health Equity Observatory dashboard's Research Opportunities page.\n\n` +
          `Rules:\n` +
          `- The table at the end of this message is the ONLY data you may use — a real, computed table for every ` +
          `outcome indicator this dashboard tracks: the state with the worst value, the state with the best value, ` +
          `and the ratio between them, in the most recent year each indicator has data for. Use ONLY its numbers. ` +
          `Do not use outside knowledge about Malaysian health statistics, and do not recalculate, round ` +
          `differently, or restate any number other than exactly as it appears in the table.\n` +
          `- Pick exactly ONE row as the most compelling starting point for further research — not necessarily the ` +
          `largest ratio, but the one you judge most policy-relevant, actionable, or under-explored.\n` +
          exclusionRule +
          `\nRespond in exactly this format and nothing else:\n` +
          `INDICATOR: <exact indicator name, copied from the table>\n` +
          `ROW: <the exact matching row, copied verbatim from the table, unchanged>\n` +
          `WHY THIS ONE: <2-3 sentences of your own reasoning>\n\n` +
          `DATA TABLE:\n${rows.join("\n")}`
      );
      setSuggestion(reply);
      const match = /INDICATOR:\s*(.+)/.exec(reply);
      const nextExcluded = match ? Array.from(new Set([...excludeIndicators, match[1].trim()])) : excludeIndicators;
      setExcludeIndicators(nextExcluded);
      writeAiCache(aiCacheKey(location.pathname, "suggest"), { text: reply, excluded: nextExcluded });
    } catch (e) {
      setSuggestError(e instanceof Error ? e.message : String(e));
    } finally {
      setSuggestLoading(false);
    }
  }

  // Auto-generate a suggestion as soon as the real indicator data has
  // loaded, so the card never sits empty waiting for a click — "Refresh"
  // (same button, relabelled once a suggestion exists) is how a user asks
  // for another. Guarded by hasAutoSuggested so this only ever fires once
  // per page visit, and the last suggestion is cached in sessionStorage so
  // revisiting the page (or navigating away and back) in the same browser
  // session re-uses it instead of spending another Gemini call — the free
  // tier's quota was being exhausted by one call per visit.
  useEffect(() => {
    if (hasAutoSuggested) return;
    if (buildGapTable().length < 3) return;
    setHasAutoSuggested(true);
    const cached = readAiCache<{ text?: string; excluded?: string[] }>(aiCacheKey(location.pathname, "suggest"));
    if (cached?.text) {
      setSuggestion(cached.text);
      setExcludeIndicators(cached.excluded ?? []);
      return;
    }
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
    // Real, pre-computed correlations (lib/correlation.ts) between each
    // matched outcome and this page's core determinants — capped to the
    // top 4 matched fields internally by buildCorrelationSummary, same
    // reasoning as the row cap above.
    const correlationLines = scopedFields.length > 0 ? buildCorrelationSummary(scopedFields) : [];
    // Same topic typed again in this session → serve the stored answer, no new AI call.
    const interestKey = aiCacheKey(location.pathname, "interest", trimmed.toLowerCase());
    const cachedInterest = readAiCache<{ text: string }>(interestKey);
    if (cachedInterest?.text) {
      setInterestResult(cachedInterest.text);
      return;
    }
    setInterestLoading(true);
    setInterestError(null);
    try {
      // Instructions first, data last — see the note in handleSuggest.
      const reply = await askDirect(
        `You are helping a user of the Malaysia Health Equity Observatory dashboard's Research Opportunities page. ` +
          `The user typed this research interest, in their own words: "${trimmed}"\n\n` +
          (scopedFields.length > 0
            ? `The DATA TABLE at the end has ALREADY been filtered by keyword match to only the indicators relevant ` +
              `to that interest — every row is relevant, none are extra. Discuss only those rows; do not describe or ` +
              `summarise any indicator not shown in it.\n\n`
            : `No indicator this dashboard tracks matched that interest by keyword, so the FULL indicator table is ` +
              `shown at the end only so you can check for yourself. State plainly that nothing in this dashboard's ` +
              `tracked indicators directly covers their interest. Only if one row is genuinely closely related may ` +
              `you mention it as the nearest available proxy — do not force an unrelated match, and do not describe ` +
              `the rest of the table.\n\n`) +
          `Rules:\n` +
          `- Use ONLY the numbers, indicators and correlation figures given in this message. Do not use outside ` +
          `knowledge about Malaysian health statistics, and do not recalculate, round differently, or restate any ` +
          `number other than exactly as it appears here.\n` +
          `- If no correlation line is given for a row, say plainly that no correlation was computed for it — never ` +
          `invent, guess, or describe a correlation number that wasn't provided. Correlations are cross-sectional ` +
          `associations only, never proof of cause: never state or imply that one causes the other.\n` +
          `- For each relevant row give: one sentence summarising the real gap (DATA SUMMARY), one sentence ` +
          `summarising what the correlation figures show — strength, direction, and that it is an association only ` +
          `(CORRELATION SUMMARY), and one specific research question tied to the user's interest and this row's real ` +
          `numbers (SUGGESTED QUESTION).\n\n` +
          `For each row, respond in exactly this format:\n` +
          `INDICATOR: <exact indicator name, copied from the table>\n` +
          `ROW: <the exact matching row, copied verbatim from the table, unchanged>\n` +
          `DATA SUMMARY: <one sentence>\n` +
          `CORRELATION SUMMARY: <one sentence>\n` +
          `SUGGESTED QUESTION: <one research question tied to this row and the user's interest>\n\n` +
          (correlationLines.length > 0
            ? `CORRELATIONS (already computed, Pearson r, single most-complete shared year per pair, between each ` +
              `indicator and median household income, absolute poverty rate, Gini coefficient, healthcare staff ` +
              `availability, hospital bed availability):\n${correlationLines.join("\n")}\n\n`
            : "") +
          `DATA TABLE:\n${rows.join("\n")}`
      );
      setInterestResult(reply);
      writeAiCache(interestKey, { text: reply });
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

  // ---- Context-aware AI research angle ----
  // Unlike the two cards above (which look at the whole indicator table or
  // a typed topic), this one is driven by the Selection controls: change the
  // state, outcome or determinant and the facts sent to the AI change with
  // them. The facts are computed here from the loaded data - the AI only
  // writes the framing. Each combination is cached in sessionStorage under
  // its own composite key (ai_research_<route>_<outcome>_<determinant>_<state>)
  // so revisiting a combination costs no AI call, and switching selection can
  // never show an answer written for a different one.
  const detFile = determinant?.file;
  const detAlreadyLoaded = detFile ? OUTCOME_SOURCES[detFile] !== null : true;
  // Most determinant files aren't loaded for the other cards on this page;
  // fetch only the selected one, on demand.
  const { data: extraDetRows } = useData<Row[]>(detFile && !detAlreadyLoaded ? detFile : null);

  function buildSelectionContext(): { text: string } | { error: string } {
    if (year === null) return { error: `No ${outcome.label.toLowerCase()} data is available to describe.` };
    const gap = computeGroupGapStats(outcomeRows, year, outcome.field, outcome.higherIsWorse);
    const stateEntry = gap?.snapshot.find((e) => e.name === selectedState);
    if (!gap || !stateEntry) {
      return { error: `${selectedState} has no reported ${outcome.label.toLowerCase()} for ${year}, so there is nothing to ground an AI answer in.` };
    }
    const avg = computeAverage(outcomeRows, year, outcome.field);
    const worstFirst = [...gap.snapshot].sort((a, b) => (outcome.higherIsWorse ? b.value - a.value : a.value - b.value));
    const rank = worstFirst.findIndex((e) => e.name === selectedState) + 1;
    const lines = [
      `SELECTION: state = ${selectedState}; health outcome = ${outcome.label} (${outcome.unit}); potential determinant = ${determinant?.label ?? "none"}${determinant ? ` (${determinant.unit})` : ""}`,
      `OUTCOME (${year}): ${selectedState} = ${fmt(stateEntry.value, 1)}${avg ? `; average of the ${avg.n} reporting states = ${fmt(avg.mean, 1)}` : ""}. ` +
        `Ranks ${rank} of ${gap.n} states (1 = worst). Worst: ${gap.worst.name} ${fmt(gap.worst.value, 1)}; best: ${gap.best.name} ${fmt(gap.best.value, 1)}.`,
    ];
    if (!determinant) {
      lines.push("DETERMINANT: none selected.");
    } else {
      const detRows = rowsForField(OUTCOME_SOURCES[determinant.file] ?? extraDetRows, determinant);
      if (!detRows) {
        lines.push(`DETERMINANT: data for ${determinant.label} is still loading or unavailable.`);
      } else if (determinant.file === outcome.file && determinant.field === outcome.field) {
        lines.push("DETERMINANT: same measure as the outcome, so no correlation is meaningful.");
      } else {
        const shared = findBestYear(detRows, outcomeRows ?? [], determinant.field, outcome.field);
        const stats =
          shared.year !== null && shared.n >= 3
            ? computeCorrelationStats(buildPairs(detRows, outcomeRows ?? [], shared.year, determinant.field, outcome.field))
            : null;
        const stateDet = shared.year !== null ? detRows.find((r) => r.state === selectedState && r.year === shared.year) : undefined;
        const stateDetVal = typeof stateDet?.[determinant.field] === "number" ? (stateDet[determinant.field] as number) : null;
        if (stats && shared.year !== null) {
          lines.push(
            `DETERMINANT (${shared.year}): ${selectedState} = ${stateDetVal !== null ? fmt(stateDetVal, 1) : "not reported"}. ` +
              `CORRELATION across ${shared.n} states in ${shared.year}: Pearson r = ${stats.pearson.toFixed(2)} (${interpretCorrelation(stats.pearson).label})${stats.reliable ? "" : " - small sample, read with caution"}.`
          );
        } else {
          lines.push(`DETERMINANT: no correlation could be computed - fewer than 3 states report both ${outcome.label} and ${determinant.label} in a shared year.`);
        }
      }
    }
    return { text: lines.join("\n") };
  }

  const route = location.pathname;
  const ctxKey = aiCacheKey(route, outcomeId, determinantId, selectedState);
  const [ctxResults, setCtxResults] = useState<Record<string, string>>({});
  const [ctxLoadingKey, setCtxLoadingKey] = useState<string | null>(null);
  const [ctxError, setCtxError] = useState<{ key: string; message: string } | null>(null);
  const ctxText = ctxResults[ctxKey] ?? readAiCache<{ text: string }>(ctxKey)?.text ?? null;
  const ctxContext = buildSelectionContext();

  async function handleSelectionAngle(force: boolean) {
    if (ctxLoadingKey) return;
    if ("error" in ctxContext) {
      setCtxError({ key: ctxKey, message: ctxContext.error });
      return;
    }
    if (!force && ctxText) return;
    const key = ctxKey;
    setCtxLoadingKey(key);
    setCtxError(null);
    try {
      // Instructions first, facts last - see the note in handleSuggest.
      const reply = await askDirect(
        `You are helping a user of the Malaysia Health Equity Observatory dashboard's Research Opportunities page. ` +
          `They have selected the combination described in CONTEXT at the end of this message.\n\n` +
          `Rules:\n` +
          `- Use ONLY the facts in CONTEXT. Do not use outside knowledge about Malaysian health statistics, and do not ` +
          `recalculate, round differently, or restate any number other than exactly as written there.\n` +
          `- A correlation is a cross-sectional association between states, never proof of cause: never say or imply ` +
          `that the determinant causes the outcome. If CONTEXT says no correlation could be computed, say so plainly.\n` +
          `- Be specific to the selected state, not generic.\n\n` +
          `Respond in exactly this format and nothing else:\n` +
          `WHAT THE DATA SHOWS: <1-2 sentences using only numbers from CONTEXT>\n` +
          `RESEARCH ANGLE: <one specific research question for this state and outcome, treating the determinant only as a possible association>\n` +
          `CAVEAT: <one sentence on the main limit, e.g. state-level aggregate, single year, or small sample>\n\n` +
          `CONTEXT:\n${ctxContext.text}`
      );
      setCtxResults((prev) => ({ ...prev, [key]: reply }));
      writeAiCache(key, { text: reply });
    } catch (e) {
      setCtxError({ key, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setCtxLoadingKey(null);
    }
  }

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

        <section aria-labelledby="ro-ctx">
          <h2 id="ro-ctx" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            AI research angle for this selection
          </h2>
          <div className="rounded-lg border border-line-axis bg-plane p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-2xl text-sm text-ink-secondary">
                Uses the state, health outcome and determinant chosen above: the facts (this state's value, its rank,
                the state average and the correlation with the determinant) are computed from the data first, then the
                MY-HEO Assistant frames a research angle around them. Change a selection and this card follows it -
                answers you've already generated for a combination are kept for this session.
              </p>
              <button
                type="button"
                onClick={() => void handleSelectionAngle(Boolean(ctxText))}
                disabled={ctxLoadingKey !== null}
                className="shrink-0 rounded-md bg-series-1 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
              >
                {ctxLoadingKey !== null ? "Thinking…" : ctxText ? "Regenerate" : "Generate AI research angle"}
              </button>
            </div>
            <p className="mt-3 text-xs text-ink-muted">
              Selection: {selectedState} · {outcome.label} · {determinant?.label ?? "no determinant"}
            </p>
            <div className="mt-2 rounded-md border border-line-grid bg-surface p-4">
              {ctxError && ctxError.key === ctxKey ? (
                <p className="text-sm text-status-critical">Couldn't generate an angle: {ctxError.message}</p>
              ) : ctxText ? (
                <MarkdownLite text={ctxText} />
              ) : (
                <p className="text-sm text-ink-muted">
                  {"error" in ctxContext
                    ? ctxContext.error
                    : "Not generated yet for this combination. Choose Generate to ask the assistant."}
                </p>
              )}
            </div>
            {!("error" in ctxContext) && (
              <details className="mt-3 text-xs text-ink-muted">
                <summary className="cursor-pointer">Facts sent to the AI for this selection</summary>
                <pre className="mt-2 whitespace-pre-wrap rounded-md border border-line-grid bg-surface p-3 text-xs text-ink-secondary">
                  {ctxContext.text}
                </pre>
              </details>
            )}
          </div>
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
