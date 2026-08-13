import { useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import CorrelationCaveat from "../components/CorrelationCaveat";
import DataTable, { toCSV, downloadCSV, type Column } from "../components/DataTable";
import { useData } from "../lib/useData";
import type { Row } from "../lib/equity";
import { findBestYear, buildPairs, computeCorrelationStats, interpretCorrelation } from "../lib/correlation";
import { OUTCOME_FIELDS, DETERMINANT_FIELDS, type FieldDef } from "../lib/determinantFields";

/**
 * A wider scan across Determinants Explorer's same correlation engine —
 * one determinant against every selected outcome at once, as a sortable
 * table, instead of one outcome-vs-determinant pair per click. Reuses
 * findBestYear/buildPairs/computeCorrelationStats/interpretCorrelation
 * from lib/correlation.ts verbatim — no new statistics.
 */
export default function IndicatorMatrix() {
  const { data: healthOutcomes } = useData<Row[]>("health_outcomes_state.json");
  const { data: healthcareAccess } = useData<Row[]>("healthcare_access_state.json");
  const { data: socioeconomic } = useData<Row[]>("socioeconomic_state.json");
  const { data: nhmsNcd } = useData<Row[]>("nhms_ncd_state.json");
  const { data: nhmsAdolescentMentalHealth } = useData<Row[]>("nhms_adolescent_mental_health_state.json");

  const rowsByFile: Record<FieldDef["file"], Row[] | null> = useMemo(
    () => ({
      "health_outcomes_state.json": healthOutcomes,
      "healthcare_access_state.json": healthcareAccess,
      "socioeconomic_state.json": socioeconomic,
      "nhms_ncd_state.json": nhmsNcd,
      "nhms_adolescent_mental_health_state.json": nhmsAdolescentMentalHealth,
    }),
    [healthOutcomes, healthcareAccess, socioeconomic, nhmsNcd, nhmsAdolescentMentalHealth]
  );

  const [determinantId, setDeterminantId] = useState(DETERMINANT_FIELDS[1].id);
  const determinant = DETERMINANT_FIELDS.find((f) => f.id === determinantId)!;

  const [selectedOutcomeIds, setSelectedOutcomeIds] = useState<Set<string>>(() => new Set(OUTCOME_FIELDS.map((f) => f.id)));

  function toggleOutcome(id: string) {
    setSelectedOutcomeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const results = useMemo(() => {
    const determinantRows = rowsByFile[determinant.file];
    return OUTCOME_FIELDS.filter((o) => selectedOutcomeIds.has(o.id)).map((outcome) => {
      const outcomeRows = rowsByFile[outcome.file];
      if (!outcomeRows || !determinantRows) {
        return { outcome, year: null as number | null, stats: null, insufficientReason: "Data still loading." };
      }
      const { year, n } = findBestYear(determinantRows, outcomeRows, determinant.field, outcome.field);
      if (year === null) {
        return { outcome, year: null as number | null, stats: null, insufficientReason: `"${determinant.label}" and "${outcome.label}" share no common year with paired state-level data.` };
      }
      const pairs = buildPairs(determinantRows, outcomeRows, year, determinant.field, outcome.field);
      const stats = computeCorrelationStats(pairs);
      if (!stats) {
        return { outcome, year, stats: null, insufficientReason: `Only ${n} state(s) have paired data in ${year} (need at least 8).` };
      }
      return { outcome, year, stats, insufficientReason: null as string | null };
    });
  }, [selectedOutcomeIds, determinant, rowsByFile]);

  const columns: Column[] = [
    { key: "outcome", label: "Outcome" },
    { key: "year", label: "Year used", numeric: true },
    { key: "n", label: "n states", numeric: true },
    { key: "pearson", label: "Pearson r", numeric: true },
    { key: "spearman", label: "Spearman ρ", numeric: true },
    { key: "strength", label: "Strength & direction" },
  ];

  const tableRows = results.map((r) => ({
    outcome: r.outcome.label,
    year: r.year,
    n: r.stats?.n ?? null,
    pearson: r.stats ? r.stats.pearson.toFixed(3) : null,
    spearman: r.stats ? r.stats.spearman.toFixed(3) : null,
    strength: r.stats ? interpretCorrelation(r.stats.pearson).label : r.insufficientReason,
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
            Each row uses the most recent year with the most complete state-level pairing for that specific
            outcome/determinant pair — years can differ row to row, exactly as in Determinants Explorer. Where a
            row's "Strength & direction" cell reads as a sentence instead of e.g. "Strong positive", there was
            insufficient paired data (fewer than 8 states) to compute a correlation for any common year — the
            sentence explains why, matching Determinants Explorer's InsufficientData wording for the same case.
          </p>
        </div>
      </div>
    </div>
  );
}
