/**
 * Transparent, configurable priority-scoring math. This is deliberately NOT
 * a composite "equity index" (docs/METHODOLOGY.md §8 explains why this
 * project doesn't build one) — it's a single-purpose research
 * prioritization tool, always shown with its full component breakdown,
 * never presented as a hidden score. Every component here is a real,
 * user-visible field from the pipeline; nothing is invented.
 */

export interface ScoreComponentInput {
  key: string;
  label: string;
  /** state -> raw value (null where the state has no reported value). */
  values: Map<string, number | null>;
  /** true if a HIGHER raw value indicates MORE priority (e.g. poverty rate, a burden rate).
   * false if a higher raw value indicates LESS priority (e.g. staff availability) and must be inverted. */
  higherIsMorePriority: boolean;
}

export interface PriorityComponentResult {
  key: string;
  raw: number | null;
  normalized: number | null;
}

export interface PriorityScoreRow {
  state: string;
  components: PriorityComponentResult[];
  weightedTotal: number | null;
}

/** Min-max normalize to [0,1], optionally inverted so 1 always means "more priority-worthy."
 * Returns null for any input with fewer than 2 real values (can't normalize) or for null entries. */
export function normalizeMinMax(values: (number | null)[], invert: boolean): (number | null)[] {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) return values.map(() => null);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  if (max === min) return values.map((v) => (v === null ? null : 0.5));
  return values.map((v) => {
    if (v === null) return null;
    const t = (v - min) / (max - min);
    return invert ? 1 - t : t;
  });
}

/**
 * Weighted sum across components, per state. Weights are normalized to sum
 * to 1 across whichever components actually have a value for that state —
 * a state missing one component isn't silently scored as if that component
 * were 0, its weighted total is re-based over the components it does have.
 */
export function computePriorityScores(
  states: string[],
  components: ScoreComponentInput[],
  weights: Record<string, number>
): PriorityScoreRow[] {
  const normalizedByComponent: Record<string, (number | null)[]> = {};
  for (const comp of components) {
    const rawValues = states.map((s) => comp.values.get(s) ?? null);
    normalizedByComponent[comp.key] = normalizeMinMax(rawValues, !comp.higherIsMorePriority);
  }

  return states.map((state, i) => {
    const comps: PriorityComponentResult[] = components.map((comp) => ({
      key: comp.key,
      raw: comp.values.get(state) ?? null,
      normalized: normalizedByComponent[comp.key][i],
    }));
    const validComps = comps.filter((c) => c.normalized !== null);
    let weightedTotal: number | null = null;
    if (validComps.length > 0) {
      const sumWeights = validComps.reduce((s, c) => s + (weights[c.key] ?? 0), 0);
      if (sumWeights > 0) {
        weightedTotal =
          validComps.reduce((s, c) => s + (weights[c.key] ?? 0) * (c.normalized as number), 0) / sumWeights;
      }
    }
    return { state, components: comps, weightedTotal };
  });
}
