export type Row = Record<string, unknown>;

export interface GapEntry {
  name: string;
  value: number;
}

export interface GenericGapStats {
  snapshot: GapEntry[];
  best: GapEntry;
  worst: GapEntry;
  absDiff: number;
  /** highest value / lowest value; null if the lowest value is 0 (undefined ratio). */
  ratio: number | null;
  n: number;
}

/**
 * Absolute difference and relative ratio between the highest- and lowest-value
 * group (state or district) for one field/year. `groupField` names the row key
 * that identifies each comparison unit (e.g. "state" or "district").
 */
export function computeGroupGapStats(
  rows: Row[] | null,
  year: number | null,
  valueField: string,
  higherIsWorse: boolean,
  groupField: string = "state"
): GenericGapStats | null {
  if (!rows || year === null) return null;
  const snapshot = rows
    .filter((r) => r.year === year)
    .map((r) => ({ name: r[groupField] as string, value: r[valueField] }))
    .filter((r): r is GapEntry => typeof r.value === "number")
    .sort((a, b) => a.value - b.value);
  if (snapshot.length < 2) return null;
  const lowest = snapshot[0];
  const highest = snapshot[snapshot.length - 1];
  const best = higherIsWorse ? lowest : highest;
  const worst = higherIsWorse ? highest : lowest;
  return {
    snapshot,
    best,
    worst,
    absDiff: highest.value - lowest.value,
    ratio: lowest.value !== 0 ? highest.value / lowest.value : null,
    n: snapshot.length,
  };
}

/**
 * Original state-only shape, preserved so InequalityAnalytics.tsx's existing
 * call sites (gapStats.bestState, snapshot fed to BarRankingCard nameKey="state",
 * etc.) keep working unmodified after this module's extraction.
 */
export interface GapStats {
  snapshot: { state: string; value: number }[];
  bestState: string;
  bestValue: number;
  worstState: string;
  worstValue: number;
  absDiff: number;
  ratio: number | null;
  statesCount: number;
}

export function computeGapStats(
  rows: Row[] | null,
  year: number | null,
  valueField: string,
  higherIsWorse: boolean
): GapStats | null {
  const g = computeGroupGapStats(rows, year, valueField, higherIsWorse, "state");
  if (!g) return null;
  return {
    snapshot: g.snapshot.map((e) => ({ state: e.name, value: e.value })),
    bestState: g.best.name,
    bestValue: g.best.value,
    worstState: g.worst.name,
    worstValue: g.worst.value,
    absDiff: g.absDiff,
    ratio: g.ratio,
    statesCount: g.n,
  };
}

/** Years where at least `minCount` groups report a non-null value for this field. */
export function yearsWithCoverage(rows: Row[] | null, valueField: string, minCount = 12): number[] {
  if (!rows) return [];
  const counts = new Map<number, number>();
  for (const r of rows) {
    const y = r.year as number;
    const v = r[valueField];
    if (typeof v === "number") counts.set(y, (counts.get(y) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, c]) => c >= minCount)
    .map(([y]) => y)
    .sort((a, b) => b - a);
}

export function fmt(v: number | null | undefined, decimals = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export interface GroupMeanGap {
  meanA: number;
  meanB: number;
  labelA: string;
  labelB: string;
  nA: number;
  nB: number;
  diff: number;
  ratio: number | null;
}

/**
 * Mean of `valueField` across groupA's members vs groupB's members, for one
 * year (e.g. East Malaysia vs Peninsular states). Only real reported values
 * are averaged — members with no data for the year are excluded from both
 * the mean and the count, never treated as 0.
 */
export function computeGroupMeanGap(
  rows: Row[] | null,
  year: number | null,
  valueField: string,
  groupA: string[],
  groupALabel: string,
  groupB: string[],
  groupBLabel: string,
  groupField: string = "state"
): GroupMeanGap | null {
  if (!rows || year === null) return null;
  const snapshot = rows.filter((r) => r.year === year);
  const valuesFor = (names: string[]) =>
    snapshot
      .filter((r) => names.includes(r[groupField] as string))
      .map((r) => r[valueField])
      .filter((v): v is number => typeof v === "number");
  const valsA = valuesFor(groupA);
  const valsB = valuesFor(groupB);
  if (valsA.length === 0 || valsB.length === 0) return null;
  const meanA = valsA.reduce((s, v) => s + v, 0) / valsA.length;
  const meanB = valsB.reduce((s, v) => s + v, 0) / valsB.length;
  return {
    meanA,
    meanB,
    labelA: groupALabel,
    labelB: groupBLabel,
    nA: valsA.length,
    nB: valsB.length,
    diff: Math.abs(meanA - meanB),
    ratio: Math.min(meanA, meanB) !== 0 ? Math.max(meanA, meanB) / Math.min(meanA, meanB) : null,
  };
}

export interface AverageResult {
  mean: number;
  n: number;
}

/**
 * Mean of `valueField` across the given rows for one year — used for "vs.
 * Malaysia average" (pass all rows) / "vs. state average" (pass rows
 * pre-filtered to one state's districts) comparisons. Only real reported
 * values are averaged; missing rows are excluded from both the mean and the
 * count, never treated as 0.
 */
export function computeAverage(rows: Row[] | null, year: number | null, valueField: string): AverageResult | null {
  if (!rows || year === null) return null;
  const values = rows
    .filter((r) => r.year === year)
    .map((r) => r[valueField])
    .filter((v): v is number => typeof v === "number");
  if (values.length === 0) return null;
  return { mean: values.reduce((s, v) => s + v, 0) / values.length, n: values.length };
}

export interface TrendPoint {
  year: number;
  value: number;
}

/**
 * One state's real reported values for `valueField` across every year it
 * has one, sorted ascending — used for the Trends page's per-state line
 * chart. Years with no reported value are simply absent from the result,
 * never interpolated or filled.
 */
export function buildStateTrend(rows: Row[] | null, state: string, valueField: string): TrendPoint[] {
  if (!rows) return [];
  return rows
    .filter((r) => r.state === state && typeof r[valueField] === "number")
    .map((r) => ({ year: r.year as number, value: r[valueField] as number }))
    .sort((a, b) => a.year - b.year);
}

/**
 * Tercile breakpoints of a numeric array: returns [p33, p67] such that values
 * <= p33 fall in the bottom third, <= p67 in the middle third, else the top
 * third. Used for the poverty-tier overlay's self-defined bucketing — not an
 * official classification, just a reproducible split of the current data.
 */
export function computeTerciles(values: number[]): [number, number] | null {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length < 3) return null;
  const at = (p: number) => {
    const idx = p * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  };
  return [at(1 / 3), at(2 / 3)];
}
