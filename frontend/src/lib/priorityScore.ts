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

// ---------------------------------------------------------------------------------------------------------------
// Grouped scoring: every indicator the user ticks counts, weighted within its component group.
// ---------------------------------------------------------------------------------------------------------------

export interface IndicatorInput {
  key: string;
  /** Which component the indicator belongs to ("burden", "ses", "access", "equity"). */
  group: string;
  label: string;
  /** state -> raw value (null where the state has no usable value). */
  values: Map<string, number | null>;
  /** true if a HIGHER raw value means MORE priority (e.g. a mortality rate); false if it means less (e.g. beds per 100,000). */
  higherIsMorePriority: boolean;
}

export interface GroupedScoreRow {
  state: string;
  /** indicator key -> min-max normalised value (1 = most priority-worthy), null where the state has no value. */
  indicators: Record<string, number | null>;
  /** group key -> mean of that group's normalised indicators (null when the state has none for the group). */
  groups: Record<string, number | null>;
  weightedTotal: number | null;
}

/**
 * Two-level score. Each indicator is min-max normalised across states (inverted where a higher raw value means less
 * priority); a group's score is the plain mean of its normalised indicators that the state actually has; the overall
 * score is the weighted mean of group scores, with weights re-based over the groups the state has. A missing value
 * is never scored as 0: it simply drops out and the remaining ones carry its share.
 */
export function computeGroupedScores(
  states: string[],
  indicators: IndicatorInput[],
  groupWeights: Record<string, number>
): GroupedScoreRow[] {
  const normalised: Record<string, (number | null)[]> = {};
  for (const ind of indicators) {
    normalised[ind.key] = normalizeMinMax(
      states.map((s) => ind.values.get(s) ?? null),
      !ind.higherIsMorePriority
    );
  }
  const groupKeys = Array.from(new Set(indicators.map((i) => i.group)));
  return states.map((state, i) => {
    const perIndicator: Record<string, number | null> = {};
    for (const ind of indicators) perIndicator[ind.key] = normalised[ind.key][i];
    const groups: Record<string, number | null> = {};
    for (const g of groupKeys) {
      const vals = indicators
        .filter((ind) => ind.group === g)
        .map((ind) => perIndicator[ind.key])
        .filter((v): v is number => v !== null);
      groups[g] = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    }
    const have = groupKeys.filter((g) => groups[g] !== null);
    const sumW = have.reduce((s, g) => s + (groupWeights[g] ?? 0), 0);
    const weightedTotal =
      have.length && sumW > 0 ? have.reduce((s, g) => s + (groupWeights[g] ?? 0) * (groups[g] as number), 0) / sumW : null;
    return { state, indicators: perIndicator, groups, weightedTotal };
  });
}

/** 1-based rank per state (1 = highest score); states without a score are absent. Ties share the better rank. */
export function rankStates(rows: GroupedScoreRow[]): Map<string, number> {
  const scored = rows.filter((r) => r.weightedTotal !== null).sort((a, b) => (b.weightedTotal as number) - (a.weightedTotal as number));
  const ranks = new Map<string, number>();
  scored.forEach((r, i) => {
    const prev = i > 0 ? scored[i - 1] : null;
    ranks.set(r.state, prev && prev.weightedTotal === r.weightedTotal ? (ranks.get(prev.state) as number) : i + 1);
  });
  return ranks;
}

/** Best and worst rank each state gets across several weightings (e.g. equal weights, and each group alone). */
export function rankRanges(
  states: string[],
  indicators: IndicatorInput[],
  weightings: Record<string, number>[]
): Map<string, { best: number; worst: number }> {
  const out = new Map<string, { best: number; worst: number }>();
  for (const w of weightings) {
    const ranks = rankStates(computeGroupedScores(states, indicators, w));
    for (const [state, rank] of ranks) {
      const cur = out.get(state);
      out.set(state, cur ? { best: Math.min(cur.best, rank), worst: Math.max(cur.worst, rank) } : { best: rank, worst: rank });
    }
  }
  return out;
}
