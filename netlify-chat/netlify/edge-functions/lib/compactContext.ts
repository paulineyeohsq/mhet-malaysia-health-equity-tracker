/**
 * Builds the per-request data context sent to Gemini, within a hard size budget.
 *
 * Why this exists: the chat used to attach each page's raw JSON files verbatim.
 * Counted with Gemini's own token counter that was ~28k tokens on the lightest
 * page, ~390-550k on /determinants and /map, and ~1.5M on /health-outcomes —
 * over the model's ~1.05M-token input limit (so chat could not work there at
 * all) and large enough elsewhere to burn the free tier's quota in a handful
 * of requests. Three things shrink it without losing what a chat answer needs:
 *   1. Row arrays are sent as CSV, not JSON — the same values without every
 *      key name repeated on every row (empty cell = null = "no data reported").
 *   2. Time series are cut to the most recent N distinct years per file
 *      (survey-based files with only 3 survey years are untouched).
 *   3. A total character budget is enforced: if it is still exceeded the window
 *      narrows (6 -> 3 -> 1 years), then the largest files are left out. Anything
 *      cut is disclosed to the model so it says so instead of guessing.
 *
 * Pure functions, no platform APIs.
 */

export interface ContextFile {
  name: string;
  body: string;
}

type Row = Record<string, unknown>;

/** Files never sent: too large to be useful as chat context. */
const ALWAYS_OMIT: Record<string, string> = {
  "pekab40_screenings_daily_state.json":
    "daily PeKa B40 screening counts, 43,600 rows — annual totals per state are in health_programmes_state.json",
};

/** ~240k characters of CSV is roughly 70-90k tokens. */
export const CONTEXT_CHAR_BUDGET = 240_000;
const YEAR_WINDOWS = [6, 3, 1];

const INVENTORY_FIELDS = [
  "id",
  "name",
  "source_org",
  "geographic_resolution",
  "unit",
  "date_range",
  "update_frequency",
  "missingness",
  "limitations",
  "status",
];

export const NO_PAGE_CONTEXT =
  "No dashboard data files are attached to this request: the user's own message contains all of the data you " +
  "should use. Apply the same rules to it.";

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: Row[], onlyColumns?: string[]): string {
  const cols: string[] = onlyColumns ? [...onlyColumns] : [];
  if (!onlyColumns) {
    const seen = new Set<string>();
    for (const r of rows) {
      for (const k of Object.keys(r)) {
        if (!seen.has(k)) {
          seen.add(k);
          cols.push(k);
        }
      }
    }
  }
  return [cols.join(","), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(","))].join("\n");
}

/** Keeps rows from the `keep` most recent distinct years (rows without a numeric year are always kept). */
function latestYears(rows: Row[], keep: number): { rows: Row[]; trimmed: boolean } {
  const years = [...new Set(rows.map((r) => r.year).filter((y): y is number => typeof y === "number"))].sort(
    (a, b) => b - a
  );
  if (years.length <= keep) return { rows, trimmed: false };
  const allowed = new Set(years.slice(0, keep));
  return {
    rows: rows.filter((r) => typeof r.year !== "number" || allowed.has(r.year)),
    trimmed: true,
  };
}

function compactInventory(parsed: { datasets?: Row[]; identified_but_not_yet_ingested?: Row[] }): string {
  const datasets = (parsed.datasets ?? []).map((d) => {
    const out: Row = {};
    for (const f of INVENTORY_FIELDS) out[f] = d[f];
    return out;
  });
  const notIngested = (parsed.identified_but_not_yet_ingested ?? []).map((d) => String(d.name ?? d.id ?? "")).filter(Boolean);
  return (
    toCsv(datasets, INVENTORY_FIELDS) +
    (notIngested.length ? `\nIdentified but not yet ingested (no data available): ${notIngested.join("; ")}` : "")
  );
}

function compactOne(file: ContextFile, keepYears: number): { text: string; trimmed: boolean } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(file.body);
  } catch {
    return { text: file.body, trimmed: false }; // not JSON (shouldn't happen) — send as-is
  }
  if (file.name === "dataset_inventory.json" && parsed && !Array.isArray(parsed)) {
    return { text: compactInventory(parsed as { datasets?: Row[] }), trimmed: false };
  }
  if (Array.isArray(parsed) && parsed.every((r) => r && typeof r === "object" && !Array.isArray(r))) {
    const { rows, trimmed } = latestYears(parsed as Row[], keepYears);
    return { text: toCsv(rows), trimmed };
  }
  return { text: JSON.stringify(parsed), trimmed: false };
}

export function buildCompactContext(files: ContextFile[], missing: string[]): string {
  const omitted: string[] = [];
  const usable: ContextFile[] = [];
  for (const f of files) {
    if (f.name in ALWAYS_OMIT) omitted.push(`${f.name} (${ALWAYS_OMIT[f.name]})`);
    else usable.push(f);
  }

  let items: { name: string; text: string }[] = [];
  let keepUsed = YEAR_WINDOWS[0];
  let anyTrimmed = false;
  for (const keep of YEAR_WINDOWS) {
    anyTrimmed = false;
    items = usable.map((f) => {
      const r = compactOne(f, keep);
      if (r.trimmed) anyTrimmed = true;
      return { name: f.name, text: r.text };
    });
    keepUsed = keep;
    if (items.reduce((s, i) => s + i.text.length, 0) <= CONTEXT_CHAR_BUDGET) break;
  }
  // Still over budget at a 1-year window: leave out the largest files (never the catalogue).
  while (items.reduce((s, i) => s + i.text.length, 0) > CONTEXT_CHAR_BUDGET) {
    const candidates = items.filter((i) => i.name !== "dataset_inventory.json");
    if (candidates.length === 0) break;
    const biggest = candidates.reduce((a, b) => (b.text.length > a.text.length ? b : a));
    items = items.filter((i) => i !== biggest);
    omitted.push(`${biggest.name} (too large for one request)`);
  }

  const parts = items.map((i) => `### ${i.name}\n${i.text}`);
  const notes: string[] = [];
  if (anyTrimmed) {
    notes.push(
      `time series were cut to the most recent ${keepUsed} year(s) with data per file to stay within size limits — ` +
        "older years exist on the dashboard but are not in the data you were given this turn; if asked about an " +
        "earlier year, say it isn't included here rather than guessing"
    );
  }
  if (omitted.length > 0) notes.push(`these files were left out to stay within size limits: ${omitted.join("; ")}`);
  if (missing.length > 0) notes.push(`the following files failed to load this turn and are unavailable: ${missing.join(", ")}`);

  return (
    "Here is the real data currently relevant to the page the user is on, plus the dataset catalogue. Each file is " +
    "CSV (first row = column names); an empty cell means null — no data reported — never zero.\n\n" +
    parts.join("\n\n") +
    (notes.length ? `\n\n### NOTES\n${notes.map((n) => `- ${n}`).join("\n")}` : "")
  );
}
