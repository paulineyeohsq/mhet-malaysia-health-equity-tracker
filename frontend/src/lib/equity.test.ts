import { describe, expect, it } from "vitest";
import {
  buildStateTrend,
  collapsePooledRows,
  computeAverage,
  computeGapStats,
  computeGroupGapStats,
  computeGroupMeanGap,
  computeTerciles,
  dedupePooled,
  fmt,
  isPooledField,
  unitName,
  yearsWithCoverage,
  type Row,
} from "./equity";

const rows: Row[] = [
  { state: "A", year: 2022, v: 10 },
  { state: "B", year: 2022, v: 20 },
  { state: "C", year: 2022, v: 40 },
  { state: "D", year: 2022, v: null },
  { state: "A", year: 2021, v: 99 },
];

describe("computeGroupGapStats", () => {
  it("finds best/worst, absolute gap and ratio for one year, ignoring nulls and other years", () => {
    const g = computeGroupGapStats(rows, 2022, "v", true)!;
    expect(g.n).toBe(3);
    expect(g.worst).toEqual({ name: "C", value: 40 });
    expect(g.best).toEqual({ name: "A", value: 10 });
    expect(g.absDiff).toBe(30);
    expect(g.ratio).toBe(4);
  });

  it("swaps best and worst when higher is better", () => {
    const g = computeGroupGapStats(rows, 2022, "v", false)!;
    expect(g.best.name).toBe("C");
    expect(g.worst.name).toBe("A");
  });

  it("returns a null ratio, not Infinity, when the lowest value is 0", () => {
    const g = computeGroupGapStats([{ state: "A", year: 1, v: 0 }, { state: "B", year: 1, v: 5 }], 1, "v", true)!;
    expect(g.ratio).toBeNull();
    expect(g.absDiff).toBe(5);
  });

  it("returns null when fewer than two groups have a value, or inputs are missing", () => {
    expect(computeGroupGapStats(rows, 2021, "v", true)).toBeNull();
    expect(computeGroupGapStats(null, 2022, "v", true)).toBeNull();
    expect(computeGroupGapStats(rows, null, "v", true)).toBeNull();
  });

  it("never treats a missing value as zero", () => {
    const g = computeGroupGapStats(rows, 2022, "v", true)!;
    expect(g.snapshot.map((e) => e.name)).not.toContain("D");
  });

  it("supports another grouping field", () => {
    const g = computeGroupGapStats(
      [{ district: "x", year: 1, v: 1 }, { district: "y", year: 1, v: 3 }],
      1,
      "v",
      true,
      "district"
    )!;
    expect(g.worst.name).toBe("y");
  });
});

describe("computeGapStats (state-shaped wrapper)", () => {
  it("renames the fields for the state-only callers", () => {
    const g = computeGapStats(rows, 2022, "v", true)!;
    expect(g.worstState).toBe("C");
    expect(g.bestState).toBe("A");
    expect(g.statesCount).toBe(3);
  });
});

describe("pooled (Klang Valley) rates", () => {
  const pooledRows: Row[] = [
    { state: "Selangor", year: 2022, r_pooled: 500, pool_label: "KV" },
    { state: "W.P. Kuala Lumpur", year: 2022, r_pooled: 500, pool_label: "KV" },
    { state: "W.P. Putrajaya", year: 2022, r_pooled: 500, pool_label: "KV" },
    { state: "Perlis", year: 2022, r_pooled: 700, pool_label: null },
    { state: "Johor", year: 2022, r_pooled: 350, pool_label: null },
  ];

  it("recognises pooled fields by suffix", () => {
    expect(isPooledField("staff_per_100k_pooled")).toBe(true);
    expect(isPooledField("staff_per_100k")).toBe(false);
  });

  it("counts the pooled unit once, under its label", () => {
    const g = computeGroupGapStats(pooledRows, 2022, "r_pooled", false)!;
    expect(g.n).toBe(3); // KV, Perlis, Johor - not 5
    expect(g.snapshot.map((e) => e.name)).toContain("KV");
    expect(g.ratio).toBeCloseTo(2, 5);
    expect(g.best.name).toBe("Perlis");
    expect(g.worst.name).toBe("Johor");
  });

  it("leaves non-pooled fields untouched (three Klang Valley rows stay three rows)", () => {
    const plain = pooledRows.map((r) => ({ ...r, r: r.r_pooled }));
    expect(computeGroupGapStats(plain, 2022, "r", false)!.n).toBe(5);
    expect(dedupePooled(plain, "r")).toHaveLength(5);
    expect(unitName(plain[0], "r")).toBe("Selangor");
  });

  it("dedupes per year", () => {
    const two = [...pooledRows, { state: "Selangor", year: 2021, r_pooled: 400, pool_label: "KV" }, { state: "W.P. Putrajaya", year: 2021, r_pooled: 400, pool_label: "KV" }];
    expect(dedupePooled(two, "r_pooled").filter((r) => r.pool_label === "KV")).toHaveLength(2);
  });

  it("averages the pooled unit once", () => {
    const a = computeAverage(pooledRows, 2022, "r_pooled")!;
    expect(a.n).toBe(3);
    expect(a.mean).toBeCloseTo((500 + 700 + 350) / 3, 5);
  });

  it("collapses rows for a one-bar-per-unit chart", () => {
    const c = collapsePooledRows(pooledRows, "r_pooled");
    expect(c).toHaveLength(3);
    expect(c.find((r) => r.pool_label === "KV")!.state).toBe("KV");
  });

  it("keeps the first member's own state for group membership in mean gaps", () => {
    const m = computeGroupMeanGap(pooledRows, 2022, "r_pooled", ["Perlis"], "Perlis", ["Selangor", "W.P. Kuala Lumpur", "W.P. Putrajaya", "Johor"], "Rest")!;
    expect(m.nB).toBe(2); // Selangor (representing KV) and Johor
    expect(m.meanB).toBeCloseTo((500 + 350) / 2, 5);
  });
});

describe("computeGroupMeanGap", () => {
  it("compares group means and excludes members with no value", () => {
    const m = computeGroupMeanGap(rows, 2022, "v", ["A", "D"], "AD", ["B", "C"], "BC")!;
    expect(m.nA).toBe(1); // D is null -> excluded, not zero
    expect(m.meanA).toBe(10);
    expect(m.meanB).toBe(30);
    expect(m.diff).toBe(20);
    expect(m.ratio).toBe(3);
  });

  it("returns null when a group has no data", () => {
    expect(computeGroupMeanGap(rows, 2022, "v", ["D"], "D", ["A"], "A")).toBeNull();
  });
});

describe("computeAverage", () => {
  it("averages real values for one year only", () => {
    expect(computeAverage(rows, 2022, "v")).toEqual({ mean: (10 + 20 + 40) / 3, n: 3 });
    expect(computeAverage(rows, 2000, "v")).toBeNull();
  });
});

describe("yearsWithCoverage", () => {
  it("lists years with at least minCount reporting groups, newest first", () => {
    expect(yearsWithCoverage(rows, "v", 3)).toEqual([2022]);
    expect(yearsWithCoverage(rows, "v", 1)).toEqual([2022, 2021]);
    expect(yearsWithCoverage(null, "v")).toEqual([]);
  });
});

describe("buildStateTrend", () => {
  it("returns a state's real values in year order, with gaps rather than fills", () => {
    const trend = buildStateTrend(
      [{ state: "A", year: 2022, v: 2 }, { state: "A", year: 2020, v: 1 }, { state: "A", year: 2021, v: null }, { state: "B", year: 2022, v: 9 }],
      "A",
      "v"
    );
    expect(trend).toEqual([{ year: 2020, value: 1 }, { year: 2022, value: 2 }]);
  });
});

describe("computeTerciles", () => {
  it("splits sorted values at the 1/3 and 2/3 points, interpolating", () => {
    expect(computeTerciles([1, 2, 3, 4, 5, 6, 7])).toEqual([3, 5]);
  });
  it("needs at least three values", () => {
    expect(computeTerciles([1, 2])).toBeNull();
  });
});

describe("fmt", () => {
  it("formats numbers and shows a dash for missing values", () => {
    expect(fmt(1234.5, 1)).toBe((1234.5).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
    expect(fmt(null)).toBe("—");
    expect(fmt(undefined)).toBe("—");
    expect(fmt(Number.NaN)).toBe("—");
  });
});
