import { describe, expect, it } from "vitest";
import {
  buildPairs,
  buildPooledPairs,
  computeCorrelationStats,
  CORRELATION_RELIABLE_MIN,
  findBestYear,
  findYearsWithPairs,
  interpretCorrelation,
  rankTransform,
  spearmanCorrelation,
} from "./correlation";
import type { Row } from "./equity";

describe("rankTransform", () => {
  it("ranks ascending, 1-based", () => {
    expect(rankTransform([30, 10, 20])).toEqual([3, 1, 2]);
  });
  it("gives tied values their average rank", () => {
    expect(rankTransform([1, 2, 2, 3])).toEqual([1, 2.5, 2.5, 4]);
  });
});

describe("spearmanCorrelation", () => {
  it("is 1 for any strictly increasing relationship, even a non-linear one", () => {
    expect(spearmanCorrelation([1, 2, 3, 4], [1, 4, 9, 16])).toBeCloseTo(1, 10);
  });
  it("is -1 for a strictly decreasing one", () => {
    expect(spearmanCorrelation([1, 2, 3, 4], [9, 7, 3, 1])).toBeCloseTo(-1, 10);
  });
});

describe("computeCorrelationStats", () => {
  const pairs = (xs: number[], ys: number[]) => xs.map((x, i) => ({ state: `S${i}`, x, y: ys[i] }));

  it("returns null for fewer than 3 pairs (n=2 always gives |r|=1, which says nothing)", () => {
    expect(computeCorrelationStats(pairs([1, 2], [3, 4]))).toBeNull();
  });

  it("returns null when x or y has no variance", () => {
    expect(computeCorrelationStats(pairs([1, 2, 3], [5, 5, 5]))).toBeNull();
    expect(computeCorrelationStats(pairs([2, 2, 2], [1, 2, 3]))).toBeNull();
  });

  it("recovers a perfect line: r = 1, slope and intercept exact", () => {
    const s = computeCorrelationStats(pairs([1, 2, 3, 4], [3, 5, 7, 9]))!;
    expect(s.pearson).toBeCloseTo(1, 10);
    expect(s.r2).toBeCloseTo(1, 10);
    expect(s.slope).toBeCloseTo(2, 10);
    expect(s.intercept).toBeCloseTo(1, 10);
    expect(s.regressionLine).toEqual([
      { x: 1, y: 3 },
      { x: 4, y: 9 },
    ]);
  });

  it("flags small samples as not reliable but still computes them", () => {
    const small = computeCorrelationStats(pairs([1, 2, 3], [1, 3, 2]))!;
    expect(small.n).toBe(3);
    expect(small.reliable).toBe(false);
    const xs = Array.from({ length: CORRELATION_RELIABLE_MIN }, (_, i) => i);
    const big = computeCorrelationStats(pairs(xs, xs.map((x) => x * x)))!;
    expect(big.reliable).toBe(true);
  });

  it("keeps Pearson and Spearman distinct (monotone but non-linear data)", () => {
    const s = computeCorrelationStats(pairs([1, 2, 3, 4, 5], [1, 4, 9, 16, 100]))!;
    expect(s.spearman).toBeCloseTo(1, 10);
    expect(s.pearson).toBeLessThan(1);
  });
});

describe("interpretCorrelation", () => {
  it.each([
    [0.95, "Very strong", "positive"],
    [-0.65, "Strong", "negative"],
    [0.45, "Moderate", "positive"],
    [-0.25, "Weak", "negative"],
    [0.19, "Negligible", "none"],
    [0, "Negligible", "none"],
  ])("r = %s is %s (%s)", (r, strength, direction) => {
    const out = interpretCorrelation(r);
    expect(out.strength).toBe(strength);
    expect(out.direction).toBe(direction);
  });

  it("uses the Evans thresholds as inclusive lower bounds", () => {
    expect(interpretCorrelation(0.8).strength).toBe("Very strong");
    expect(interpretCorrelation(0.6).strength).toBe("Strong");
    expect(interpretCorrelation(0.4).strength).toBe("Moderate");
    expect(interpretCorrelation(0.2).strength).toBe("Weak");
  });
});

describe("pairing rows", () => {
  const x: Row[] = [
    { state: "A", year: 2022, d: 1 },
    { state: "B", year: 2022, d: 2 },
    { state: "C", year: 2022, d: null },
    { state: "A", year: 2021, d: 5 },
  ];
  const y: Row[] = [
    { state: "A", year: 2022, o: 10 },
    { state: "B", year: 2022, o: 20 },
    { state: "C", year: 2022, o: 30 },
    { state: "A", year: 2021, o: 50 },
    { state: "B", year: 2021, o: 60 },
  ];

  it("buildPairs joins one year, state by state, and skips missing values", () => {
    expect(buildPairs(x, y, 2022, "d", "o")).toEqual([
      { state: "A", x: 1, y: 10 },
      { state: "B", x: 2, y: 20 },
    ]);
  });

  it("findBestYear picks the year with the most complete pairs", () => {
    expect(findBestYear(x, y, "d", "o")).toEqual({ year: 2022, n: 2 });
  });

  it("findBestYear breaks ties toward the most recent year", () => {
    const a: Row[] = [{ state: "A", year: 2020, d: 1 }, { state: "A", year: 2021, d: 1 }];
    const b: Row[] = [{ state: "A", year: 2020, o: 1 }, { state: "A", year: 2021, o: 1 }];
    expect(findBestYear(a, b, "d", "o").year).toBe(2021);
  });

  it("findBestYear reports no year when the two sets share none", () => {
    expect(findBestYear([{ state: "A", year: 2000, d: 1 }], [{ state: "A", year: 2001, o: 1 }], "d", "o")).toEqual({ year: null, n: 0 });
  });

  it("findYearsWithPairs lists every shared year, newest first", () => {
    expect(findYearsWithPairs(x, y, "d", "o")).toEqual([
      { year: 2022, n: 2 },
      { year: 2021, n: 1 },
    ]);
  });

  it("buildPooledPairs joins across years and sorts by year then state", () => {
    const pooled = buildPooledPairs(x, y, "d", "o");
    expect(pooled.map((p) => `${p.year}${p.state}`)).toEqual(["2021A", "2022A", "2022B"]);
  });
});

describe("pooled (Klang Valley) rates are left out of correlations", () => {
  const kv = "KV";
  const staff: Row[] = [
    { state: "Selangor", year: 2022, s_pooled: 500, pool_label: kv },
    { state: "W.P. Kuala Lumpur", year: 2022, s_pooled: 500, pool_label: kv },
    { state: "Perlis", year: 2022, s_pooled: 700, pool_label: null },
    { state: "Johor", year: 2022, s_pooled: 350, pool_label: null },
  ];
  const poverty: Row[] = [
    { state: "Selangor", year: 2022, p: 1 },
    { state: "W.P. Kuala Lumpur", year: 2022, p: 2 },
    { state: "Perlis", year: 2022, p: 6 },
    { state: "Johor", year: 2022, p: 4 },
  ];

  it("drops the pooled units whether the pooled field is x or y", () => {
    expect(buildPairs(staff, poverty, 2022, "s_pooled", "p").map((p) => p.state)).toEqual(["Perlis", "Johor"]);
    expect(buildPairs(poverty, staff, 2022, "p", "s_pooled").map((p) => p.state)).toEqual(["Perlis", "Johor"]);
    expect(buildPooledPairs(staff, poverty, "s_pooled", "p").map((p) => p.state)).toEqual(["Johor", "Perlis"]);
    expect(buildPooledPairs(poverty, staff, "p", "s_pooled").map((p) => p.state)).toEqual(["Johor", "Perlis"]);
    expect(findBestYear(staff, poverty, "s_pooled", "p")).toEqual({ year: 2022, n: 2 });
  });

  it("keeps them for a field that is not pooled", () => {
    const plain = staff.map((r) => ({ ...r, s: r.s_pooled }));
    expect(buildPairs(plain, poverty, 2022, "s", "p")).toHaveLength(4);
  });
});
