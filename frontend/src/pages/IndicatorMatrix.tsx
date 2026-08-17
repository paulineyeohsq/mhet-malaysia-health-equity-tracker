import { useEffect, useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import CorrelationCaveat from "../components/CorrelationCaveat";
import DataTable, { toCSV, downloadCSV, type Column } from "../components/DataTable";
import { useData } from "../lib/useData";
import type { Row } from "../lib/equity";
import { findBestYear, buildPairs, buildPooledPairs, findYearsWithPairs, computeCorrelationStats, interpretCorrelation, CORRELATION_MIN_PAIRS, type CorrelationPair } from "../lib/correlation";
import { OUTCOME_FIELDS, DETERMINANT_FIELDS, rowsForField, type FieldDef } from "../lib/determinantFields";

type MatrixPair = CorrelationPair & { year?: number };

/**
 * A wider scan across Determinants Explorer's same correlation engine —
 * one determinant against every selected outcome at once, as a sortable
 * table, instead of one outcome-vs-determinant pair per click. Reuses
 * findBestYear/buildPairs/buildPooledPairs/computeCorrelationStats/
 * interpretCorrelation from lib/correlation.ts verbatim — no new statistics.
 */
export default function IndicatorMatrix() {
  const { data: healthOutcomes } = useData<Row[]>("health_outcomes_state.json");
  const { data: healthcareAccess } = useData<Row[]>("healthcare_access_state.json");
  const { data: socioeconomic } = useData<Row[]>("socioeconomic_state.json");
  const { data: nhmsNcd } = useData<Row[]>("nhms_ncd_state.json");
  const { data: nhmsAdolescentMentalHealth } = useData<Row[]>("nhms_adolescent_mental_health_state.json");
  const { data: sanitation } = useData<Row[]>("sanitation_access_state.json");
  const { data: water } = useData<Row[]>("water_access_state.json");
  const { data: marriages } = useData<Row[]>("marriages_state.json");
  const { data: fertility } = useData<Row[]>("fertility_state.json");
  const { data: healthProgrammes } = useData<Row[]>("health_programmes_state.json");
  const { data: forestReserve } = useData<Row[]>("forest_reserve_state.json");
  const { data: waterConsumption } = useData<Row[]>("water_consumption_state.json");
  const { data: waterProduction } = useData<Row[]>("water_production_state.json");

  const rowsByFile: Record<FieldDef["file"], Row[] | null> = useMemo(
    () => ({
      "health_outcomes_state.json": healthOutcomes,
      "healthcare_access_state.json": healthcareAccess,
      "socioeconomic_state.json": socioeconomic,
      "nhms_ncd_state.json": nhmsNcd,
      "nhms_adolescent_mental_health_state.json": nhmsAdolescentMentalHealth,
      "sanitation_access_state.json": sanitation,
      "water_access_state.json": water,
      "marriages_state.json": marriages,
      "fertility_state.json": fertility,
      "health_programmes_state.json": healthProgrammes,
      "forest_reserve_state.json": forestReserve,
      "water_consumption_state.json": waterConsumption,
      "water_production_state.json": waterProduction,
    }),
    [
      healthOutcomes, healthcareAccess, socioeconomic, nhmsNcd, nhmsAdolescentMentalHealth, sanitation, water,
      marriages, fertility, healthProgrammes, forestReserve, waterConsumption, waterProduction,
    ]
  );

  const [determinantId, setDeterminantId] = useState(DETERMINANT_FIELDS[1].id);
  const determinant = DETERMINANT_FIELDS.find((f) => f.id === determinantId)!;
  const determinantRows = rowsForField(rowsByFile[determinant.file], determinant);

  // "auto" = today's behaviour (each outcome uses its own best year).
  // "pooled" = every state×year pair across all years, per outcome.
  // A specific year forces every outcome onto that same one year, so rows
  // are directly comparable to each other, unlike "auto".
  const [yearMode, setYearMode] = useState<string>("auto");

  const availableYears = useMemo(() => {
    if (!determinantRows) return [];
    const years = new Set<number>();
    for (const outcome of OUTCOME_FIELDS) {
      const outcomeRows = rowsForField(rowsByFile[outcome.file], outcome);
      if (!outcomeRows) continue;
      for (const y of findYearsWithPairs(determinantRows, outcomeRows, determinant.field, outcome.field)) {
        years.add(y.year);
      }
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [determinantRows, rowsByFile, determinant]);

  useEffect(() => {
    if (yearMode === "auto" || yearMode === "pooled") return;
    if (!availableYears.includes(Number(yearMode))) setYearMode("auto");
  }, [availableYears, yearMode]);

  const [selectedOutcomeIds, setSelectedOutcomeIds] = useState<Set<string>>(() => new Set(OUTCOME_FIELDS.map((f) => f.id)));

  function toggleOutcome(id: string) {
    setSelectedOutcomeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const isPooled = yearMode === "pooled";
  const fixedYear = yearMode !== "auto" && yearMode !== "pooled" ? Number(yearMode) : null;

  const results = useMemo(() => {
    return OUTCOME_FIELDS.filter((o) => selectedOutcomeIds.has(o.id)).map((outcome) => {
      const base = { outcome, pairs: [] as MatrixPair[] };
      const outcomeRows = rowsForField(rowsByFile[outcome.file], outcome);
      if (!outcomeRows || !determinantRows) {
        return { ...base, year: null as number | null, stats: null, insufficientReason: "Data still loading." };
      }

      if (isPooled) {
        const pairs = buildPooledPairs(determinantRows, outcomeRows, determinant.field, outcome.field);
        const stats = computeCorrelationStats(pairs);
        if (!stats) {
          return { ...base, year: null as number | null, pairs, stats: null, insufficientReason: `Only ${pairs.length} pooled state-year point(s) across all years (need at least ${CORRELATION_MIN_PAIRS}).` };
        }
        return { ...base, year: null as number | null, pairs, stats, insufficientReason: null as string | null };
      }

      if (fixedYear !== null) {
        const pairs = buildPairs(determinantRows, outcomeRows, fixedYear, determinant.field, outcome.field);
        const stats = computeCorrelationStats(pairs);
        if (!stats) {
          return { ...base, year: fixedYear, pairs, stats: null, insufficientReason: `Only ${pairs.length} state(s) have paired data in ${fixedYear} (need at least ${CORRELATION_MIN_PAIRS}).` };
        }
        return { ...base, year: fixedYear, pairs, stats, insufficientReason: null as string | null };
      }

      const { year, n } = findBestYear(determinantRows, outcomeRows, determinant.field, outcome.field);
      if (year === null) {
        return { ...base, year: null as number | null, stats: null, insufficientReason: `"${determinant.label}" and "${outcome.label}" share no common year with paired state-level data.` };
      }
      const pairs = buildPairs(determinantRows, outcomeRows, year, determinant.field, outcome.field);
      const stats = computeCorrelationStats(pairs);
      if (!stats) {
        return { ...base, year, pairs, stats: null, insufficientReason: `Only ${n} state(s) have paired data in ${year} (need at least ${CORRELATION_MIN_PAIRS}).` };
      }
      return { ...base, year, pairs, stats, insufficientReason: null as string | null };
    });
  }, [selectedOutcomeIds, determinant, rowsByFile, determinantRows, isPooled, fixedYear]);

  const [drillDownOutcomeId, setDrillDownOutcomeId] = useState<string | null>(null);
  const drillDown = results.find((r) => r.outcome.id === drillDownOutcomeId && r.stats) ?? null;

  const drillDownColumns: Column[] = isPooled
    ? [
        { key: "state", label: "State" },
        { key: "year", label: "Year", numeric: true },
        { key: "x", label: determinant.label, numeric: true },
        { key: "y", label: drillDown?.outcome.label ?? "Outcome", numeric: true },
      ]
    : [
        { key: "state", label: "State" },
        { key: "x", label: determinant.label, numeric: true },
        { key: "y", label: drillDown?.outcome.label ?? "Outcome", numeric: true },
      ];

  const columns: Column[] = [
    { key: "outcome", label: "Outcome" },
    { key: "year", label: isPooled ? "Year(s)" : "Year used", numeric: !isPooled },
    { key: "n", label: isPooled ? "n state-years" : "n states", numeric: true },
    { key: "pearson", label: "Pearson r", numeric: true },
    { key: "spearman", label: "Spearman ρ", numeric: true },
    { key: "strength", label: "Strength & direction" },
  ];

  const tableRows = results.map((r) => ({
    outcome: r.outcome.label,
    year: isPooled ? "pooled" : r.year,
    n: r.stats?.n ?? null,
    pearson: r.stats ? r.stats.pearson.toFixed(3) : null,
    spearman: r.stats ? r.stats.spearman.toFixed(3) : null,
    strength: r.stats ? interpretCorrelation(r.stats.pearson).label + (r.stats.reliable ? "" : ` (low n=${r.stats.n}, interpret with caution)`) : r.insufficientReason,
  }));

  function handleExportCSV() {
    const csv = toCSV(columns, tableRows as unknown as Record<string, unknown>[]);
    downloadCSV(`indicator_matrix_${determinant.id}.csv`, csv);
  }

  return (
    <div>
      <PageHeader
        title="Indicator Matrix"
        subtitle="WHY, at a wider scan: test one determinant against many outcomes at once, to spot candidate associations worth a closer look in Determinants Explorer."
      />
      <div className="space-y-6 p-6 lg:p-10">
        <CorrelationCaveat />

        <div className="rounded-lg border border-line-grid bg-surface p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label htmlFor="matrix-determinant" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                Potential determinant
              </label>
              <select
                id="matrix-determinant"
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
            <div>
              <label htmlFor="matrix-year" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                Year
              </label>
              <select
                id="matrix-year"
                value={yearMode}
                onChange={(e) => setYearMode(e.target.value)}
                className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
              >
                <option value="auto">Auto (best year per outcome)</option>
                <option value="pooled">Combine all years (pooled)</option>
                {availableYears.map((y) => (
                  <option key={y} value={String(y)}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {isPooled && (
            <div className="mt-3 rounded-lg border border-line-axis bg-plane p-3 text-xs text-ink-secondary">
              <strong className="text-ink-primary">Pooled across years.</strong> Every result below uses all
              state×year points with real data for that pair, not one snapshot year — the same state can appear
              more than once. This increases the sample size but mixes different time periods together.
            </div>
          )}

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="block text-xs font-medium uppercase tracking-wide text-ink-muted">Outcomes to test</span>
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedOutcomeIds(new Set(OUTCOME_FIELDS.map((f) => f.id)))}
                  className="text-series-1 underline underline-offset-2"
                >
                  Select all
                </button>
                <button type="button" onClick={() => setSelectedOutcomeIds(new Set())} className="text-series-1 underline underline-offset-2">
                  Clear
                </button>
              </div>
            </div>
            <div className="grid max-h-64 grid-cols-1 gap-1.5 overflow-y-auto rounded-md border border-line-grid p-2 sm:grid-cols-2 lg:grid-cols-3">
              {OUTCOME_FIELDS.map((f) => (
                <label key={f.id} className="flex items-center gap-1.5 text-xs text-ink-secondary">
                  <input type="checkbox" checked={selectedOutcomeIds.has(f.id)} onChange={() => toggleOutcome(f.id)} />
                  {f.label}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-secondary">
              Results — {determinant.label}, {results.length} outcome{results.length === 1 ? "" : "s"}
            </h2>
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={tableRows.length === 0}
              className="rounded border border-line-axis px-2 py-1 text-xs font-medium text-ink-secondary hover:border-series-1 hover:text-series-1 disabled:opacity-50"
            >
              Export CSV
            </button>
          </div>
          {tableRows.length > 0 ? (
            <DataTable columns={columns} rows={tableRows as unknown as Record<string, unknown>[]} searchable={false} pageSize={tableRows.length} />
          ) : (
            <p className="text-sm text-ink-secondary">Select at least one outcome above.</p>
          )}
          <p className="mt-2 text-xs text-ink-muted">
            {isPooled
              ? "Every row is pooled across all years with real data for that outcome/determinant pair — n counts state×year points, not states, and the same state can contribute more than once."
              : fixedYear !== null
                ? `Every row is fixed to ${fixedYear} — rows with no data in this specific year show "Insufficient data" rather than falling back to a different year.`
                : "Each row uses the most recent year with the most complete state-level pairing for that specific outcome/determinant pair — years can differ row to row, exactly as in Determinants Explorer."}{" "}
            Where a row's "Strength & direction" cell reads as a sentence instead of e.g. "Strong positive", there
            was insufficient paired data (fewer than 8 points) to compute a correlation — the sentence explains why.
          </p>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            State-level breakdown
          </h2>
          <div className="rounded-lg border border-line-grid bg-surface p-4">
            <label htmlFor="matrix-drilldown" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
              Drill into the 16 state values behind a result
            </label>
            <select
              id="matrix-drilldown"
              value={drillDownOutcomeId ?? ""}
              onChange={(e) => setDrillDownOutcomeId(e.target.value || null)}
              className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
            >
              <option value="">Choose a result…</option>
              {results
                .filter((r) => r.stats)
                .map((r) => (
                  <option key={r.outcome.id} value={r.outcome.id}>
                    {r.outcome.label} ({isPooled ? "pooled" : r.year})
                  </option>
                ))}
            </select>
            <div className="mt-4">
              {drillDown ? (
                <DataTable
                  columns={drillDownColumns}
                  rows={drillDown.pairs as unknown as Record<string, unknown>[]}
                  searchable={false}
                  pageSize={drillDown.pairs.length || 1}
                />
              ) : (
                <p className="text-sm text-ink-secondary">
                  Pick a result above to see the exact per-state values the correlation in that row was computed
                  from — the same numbers Determinants Explorer would show for that specific pair.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
