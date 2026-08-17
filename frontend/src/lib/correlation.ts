import * as ss from "simple-statistics";
import type { Row } from "./equity";

/** Rank-transform an array with average ranks for ties (required for Spearman). */
export function rankTransform(values: number[]): number[] {
  const idx = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(values.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1].v === idx[i].v) j++;
    const avgRank = (i + j) / 2 + 1; // 1-based average rank across the tie block
    for (let k = i; k <= j; k++) ranks[idx[k].i] = avgRank;
    i = j + 1;
  }
  return ranks;
}

export function spearmanCorrelation(xs: number[], ys: number[]): number {
  const rx = rankTransform(xs);
  const ry = rankTransform(ys);
  return ss.sampleCorrelation(rx, ry);
}

/**
 * Find the best year for a (X field, Y field) pair across two row sets keyed
 * by `state`: the year present in BOTH datasets with the most complete
 * non-null, same-year, same-state pairs. Ties broken by most recent year.
 * Never mixes rows from two different years.
 */
export function findBestYear(
  xRows: Row[],
  yRows: Row[],
  xField: string,
  yField: string
): { year: number | null; n: number } {
  const xYears = new Set(xRows.map((r) => r.year as number));
  const yYears = new Set(yRows.map((r) => r.year as number));
  const commonYears = [...xYears].filter((y) => yYears.has(y)).sort((a, b) => b - a);

  let best: { year: number | null; n: number } = { year: null, n: 0 };
  for (const y of commonYears) {
    const xByState = new Map(xRows.filter((r) => r.year === y).map((r) => [r.state as string, r[xField]]));
    const yByState = new Map(yRows.filter((r) => r.year === y).map((r) => [r.state as string, r[yField]]));
    let n = 0;
    for (const [state, xv] of xByState) {
      const yv = yByState.get(state);
      if (typeof xv === "number" && typeof yv === "number") n++;
    }
    if (n > best.n) best = { year: y, n };
  }
  return best;
}

export interface CorrelationPair {
  state: string;
  x: number;
  y: number;
}

export function buildPairs(xRows: Row[], yRows: Row[], year: number, xField: string, yField: string): CorrelationPair[] {
  const yByState = new Map(yRows.filter((r) => r.year === year).map((r) => [r.state as string, r[yField]]));
  const pairs: CorrelationPair[] = [];
  for (const row of xRows) {
    if (row.year !== year) continue;
    const x = row[xField];
    const y = yByState.get(row.state as string);
    if (typeof x === "number" && typeof y === "number") {
      pairs.push({ state: row.state as string, x, y });
    }
  }
  return pairs;
}

/**
 * Every year (not just the single "best" one) where at least one state has a
 * non-null value for both fields — powers an explicit year picker instead of
 * silently auto-selecting a year. Sorted most recent first.
 */
export function findYearsWithPairs(xRows: Row[], yRows: Row[], xField: string, yField: string): { year: number; n: number }[] {
  const xYears = new Set(xRows.map((r) => r.year as number));
  const yYears = new Set(yRows.map((r) => r.year as number));
  const commonYears = [...xYears].filter((y) => yYears.has(y)).sort((a, b) => b - a);

  const results: { year: number; n: number }[] = [];
  for (const y of commonYears) {
    const n = buildPairs(xRows, yRows, y, xField, yField).length;
    if (n > 0) results.push({ year: y, n });
  }
  return results;
}

export interface PooledPair extends CorrelationPair {
  year: number;
}

/**
 * Joins every (state, year) where BOTH datasets have a real value for the
 * chosen fields, across ALL years at once — not restricted to one shared
 * year. Each state can contribute more than one point (one per year it has
 * data), which increases n but means the result mixes multiple time
 * periods; callers must disclose this rather than presenting it as a
 * single-year snapshot. Structurally compatible with computeCorrelationStats
 * (PooledPair is a CorrelationPair plus `year`).
 */
export function buildPooledPairs(xRows: Row[], yRows: Row[], xField: string, yField: string): PooledPair[] {
  const yByStateYear = new Map<string, unknown>();
  for (const row of yRows) {
    const v = row[yField];
    if (typeof v === "number") yByStateYear.set(`${row.state as string}|${row.year as number}`, v);
  }
  const pairs: PooledPair[] = [];
  for (const row of xRows) {
    const x = row[xField];
    if (typeof x !== "number") continue;
    const key = `${row.state as string}|${row.year as number}`;
    const y = yByStateYear.get(key);
    if (typeof y === "number") {
      pairs.push({ state: row.state as string, year: row.year as number, x, y });
    }
  }
  return pairs.sort((a, b) => a.year - b.year || a.state.localeCompare(b.state));
}

export interface CorrelationStats {
  pearson: number;
  spearman: number;
  r2: number;
  n: number;
  regressionLine: { x: number; y: number }[];
  slope: number;
  intercept: number;
  /** false when n is below CORRELATION_RELIABLE_MIN — the stat is still real
   * and shown, not hidden, but callers should render a caution alongside it
   * rather than presenting it with the same confidence as a larger sample. */
  reliable: boolean;
}

// The absolute floor below which a correlation isn't just unreliable but
// mathematically meaningless to show at all: n=2 always produces |r|=1
// trivially (a line always fits exactly through 2 points), so it conveys
// nothing. n=3 is the smallest sample where r can actually vary.
const MIN_PAIRS_COMPUTABLE = 3;

// The sample size below which a real, computed correlation is flagged as
// low-reliability rather than hidden — deliberately NOT a hard block.
// Small samples are still real data; hiding them entirely would be less
// honest than showing the number with an explicit caution, matching this
// project's existing convention for small underlying counts (see
// lib/reliability.ts's isSmallCount/SMALL_COUNT_CAUTION_TEXT).
export const CORRELATION_RELIABLE_MIN = 8;

/** Full correlation + linear regression summary for a set of (x,y) pairs, or
 * null only when a correlation is mathematically undefined/meaningless
 * (fewer than 3 pairs, or no variance in x or y) — NOT merely "small". */
export function computeCorrelationStats(pairs: CorrelationPair[]): CorrelationStats | null {
  if (pairs.length < MIN_PAIRS_COMPUTABLE) return null;
  const xs = pairs.map((p) => p.x);
  const ys = pairs.map((p) => p.y);
  if (new Set(xs).size < 2 || new Set(ys).size < 2) return null;
  const pearson = ss.sampleCorrelation(xs, ys);
  const spearman = spearmanCorrelation(xs, ys);
  const regression = ss.linearRegression(pairs.map((p) => [p.x, p.y] as [number, number]));
  const line = ss.linearRegressionLine(regression);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  return {
    pearson,
    spearman,
    r2: pearson * pearson,
    n: pairs.length,
    regressionLine: [
      { x: minX, y: line(minX) },
      { x: maxX, y: line(maxX) },
    ],
    slope: regression.m,
    intercept: regression.b,
    reliable: pairs.length >= CORRELATION_RELIABLE_MIN,
  };
}

/** @deprecated Use CORRELATION_RELIABLE_MIN (an advisory flag threshold, not
 * a hard block) — kept as an alias so existing call sites that gate
 * visibility on this constant keep compiling; new code should not treat
 * this as a reason to hide a result. */
export const CORRELATION_MIN_PAIRS = MIN_PAIRS_COMPUTABLE;

/**
 * Qualitative label for a Pearson r, using the conventional Evans (1996)
 * thresholds on |r|. Purely descriptive of the computed number — never a
 * substitute for looking at the scatter plot itself.
 */
export function interpretCorrelation(r: number): { strength: string; direction: "positive" | "negative" | "none"; label: string } {
  const abs = Math.abs(r);
  let strength: string;
  if (abs >= 0.8) strength = "Very strong";
  else if (abs >= 0.6) strength = "Strong";
  else if (abs >= 0.4) strength = "Moderate";
  else if (abs >= 0.2) strength = "Weak";
  else strength = "Negligible";

  const direction: "positive" | "negative" | "none" = abs < 0.2 ? "none" : r > 0 ? "positive" : "negative";
  const label = direction === "none" ? `${strength} correlation` : `${strength} ${direction}`;
  return { strength, direction, label };
}
