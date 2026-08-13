/**
 * Shared "correlation, not causation" disclaimer for any WHY/determinants
 * analysis. Language throughout the app must stick to "associated with /
 * correlated with / shows a relationship with" — never "causes / leads to /
 * results in" — unless a causal study design supports it (none does here).
 */
export default function CorrelationCaveat() {
  return (
    <div className="mb-3 rounded-md border border-status-warning bg-status-warning/10 p-3 text-sm text-ink-primary">
      <span className="font-medium">Correlation, not causation.</span> These analyses are observational and
      descriptive. Associations should not be interpreted as causal relationships. The statistics below describe a
      statistical association across Malaysian states in a single year — confounding factors such as urbanisation,
      age structure, healthcare capacity and reporting practices are not controlled for here.
    </div>
  );
}
