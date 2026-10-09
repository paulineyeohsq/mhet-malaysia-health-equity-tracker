import { describe, expect, it } from "vitest";
import {
  computeGroupedScores,
  computePriorityScores,
  normalizeMinMax,
  rankRanges,
  rankStates,
  type IndicatorInput,
  type ScoreComponentInput,
} from "./priorityScore";

describe("normalizeMinMax", () => {
  it("maps min to 0 and max to 1", () => {
    expect(normalizeMinMax([10, 20, 30], false)).toEqual([0, 0.5, 1]);
  });

  it("inverts so 1 always means more priority", () => {
    expect(normalizeMinMax([10, 20, 30], true)).toEqual([1, 0.5, 0]);
  });

  it("keeps missing values missing - never 0", () => {
    expect(normalizeMinMax([10, null, 30], false)).toEqual([0, null, 1]);
  });

  it("cannot normalise fewer than two real values", () => {
    expect(normalizeMinMax([5, null], false)).toEqual([null, null]);
    expect(normalizeMinMax([], false)).toEqual([]);
  });

  it("puts identical values in the middle rather than dividing by zero", () => {
    expect(normalizeMinMax([4, 4, 4], false)).toEqual([0.5, 0.5, 0.5]);
  });
});

const comp = (key: string, vals: Record<string, number | null>, higherIsMorePriority: boolean): ScoreComponentInput => ({
  key,
  label: key,
  values: new Map(Object.entries(vals)),
  higherIsMorePriority,
});

describe("computePriorityScores", () => {
  const states = ["A", "B", "C"];

  it("weights components and inverts those where a higher raw value means less priority", () => {
    const rows = computePriorityScores(
      states,
      [comp("burden", { A: 1, B: 2, C: 3 }, true), comp("staff", { A: 30, B: 20, C: 10 }, false)],
      { burden: 1, staff: 1 }
    );
    // burden normalised 0, .5, 1; staff inverted: 0, .5, 1 -> equal weights
    expect(rows.map((r) => r.weightedTotal)).toEqual([0, 0.5, 1]);
    expect(rows[2].components.find((c) => c.key === "staff")).toEqual({ key: "staff", raw: 10, normalized: 1 });
  });

  it("respects unequal weights", () => {
    const rows = computePriorityScores(
      states,
      [comp("x", { A: 0, B: 0, C: 10 }, true), comp("y", { A: 10, B: 0, C: 0 }, true)],
      { x: 3, y: 1 }
    );
    expect(rows[0].weightedTotal).toBeCloseTo(0.25, 10); // (3*0 + 1*1) / 4
    expect(rows[2].weightedTotal).toBeCloseTo(0.75, 10); // (3*1 + 1*0) / 4
  });

  it("re-bases a state's weights over the components it has, instead of scoring a missing one as 0", () => {
    const rows = computePriorityScores(
      states,
      [comp("x", { A: 1, B: 2, C: 3 }, true), comp("y", { A: 5, B: 9, C: null }, true)],
      { x: 1, y: 1 }
    );
    const c = rows.find((r) => r.state === "C")!;
    expect(c.components.find((k) => k.key === "y")!.normalized).toBeNull();
    expect(c.weightedTotal).toBe(1); // only x counts: normalised 1, weight re-based to 1
  });

  it("gives no total when a state has no usable component, or when all weights are zero", () => {
    const none = computePriorityScores(["A", "B"], [comp("x", { A: 1, B: null }, true)], { x: 1 });
    expect(none.find((r) => r.state === "B")!.weightedTotal).toBeNull();
    const zero = computePriorityScores(states, [comp("x", { A: 1, B: 2, C: 3 }, true)], { x: 0 });
    expect(zero.every((r) => r.weightedTotal === null)).toBe(true);
  });

  it("ignores components that have no weight entry", () => {
    const rows = computePriorityScores(states, [comp("x", { A: 1, B: 2, C: 3 }, true), comp("z", { A: 9, B: 1, C: 5 }, true)], { x: 1 });
    expect(rows.map((r) => r.weightedTotal)).toEqual([0, 0.5, 1]);
  });
});

const ind = (key: string, group: string, vals: Record<string, number | null>, higherIsMorePriority = true): IndicatorInput => ({
  key,
  group,
  label: key,
  values: new Map(Object.entries(vals)),
  higherIsMorePriority,
});

describe("computeGroupedScores", () => {
  const states = ["A", "B", "C"];

  it("averages the indicators inside a group, then weights the groups", () => {
    const rows = computeGroupedScores(
      states,
      [ind("m1", "burden", { A: 0, B: 5, C: 10 }), ind("m2", "burden", { A: 10, B: 5, C: 0 }), ind("p", "ses", { A: 1, B: 2, C: 3 })],
      { burden: 1, ses: 1 }
    );
    const b = rows.find((r) => r.state === "B")!;
    expect(b.groups.burden).toBeCloseTo(0.5, 10); // (0.5 + 0.5) / 2
    expect(b.groups.ses).toBeCloseTo(0.5, 10);
    expect(rows.find((r) => r.state === "A")!.groups.burden).toBeCloseTo(0.5, 10); // (0 + 1) / 2
    expect(rows.find((r) => r.state === "C")!.weightedTotal).toBeCloseTo((0.5 + 1) / 2, 10);
  });

  it("inverts indicators where higher means less priority", () => {
    const rows = computeGroupedScores(states, [ind("beds", "access", { A: 100, B: 200, C: 300 }, false)], { access: 1 });
    expect(rows.map((r) => r.weightedTotal)).toEqual([1, 0.5, 0]);
  });

  it("drops a missing value instead of scoring it as zero, at both levels", () => {
    const rows = computeGroupedScores(
      states,
      [ind("x1", "burden", { A: 1, B: 2, C: null }), ind("x2", "burden", { A: 2, B: 1, C: 9 }), ind("s", "ses", { A: 1, B: 2, C: null })],
      { burden: 1, ses: 1 }
    );
    const c = rows.find((r) => r.state === "C")!;
    expect(c.indicators.x1).toBeNull();
    expect(c.groups.burden).toBe(1); // only x2 counts for C: it is C's max
    expect(c.groups.ses).toBeNull();
    expect(c.weightedTotal).toBe(1); // ses missing -> weight re-based onto burden alone
  });

  it("gives no score when a state has no value in any indicator", () => {
    const none = computeGroupedScores(["A", "B"], [ind("x", "burden", { A: 1, B: null })], { burden: 1 });
    expect(none.find((r) => r.state === "B")!.weightedTotal).toBeNull();
  });
});

describe("rankStates and rankRanges", () => {
  const states = ["A", "B", "C"];
  const indicators = [ind("burden1", "burden", { A: 3, B: 2, C: 1 }), ind("ses1", "ses", { A: 1, B: 2, C: 3 })];

  it("ranks by score, 1 = highest, ties sharing the better rank", () => {
    const tie = computeGroupedScores(states, indicators, { burden: 1, ses: 1 });
    expect([...rankStates(tie).values()]).toEqual([1, 1, 1]); // every state scores 0.5
    const burdenOnly = rankStates(computeGroupedScores(states, indicators, { burden: 1, ses: 0 }));
    expect(burdenOnly.get("A")).toBe(1);
    expect(burdenOnly.get("C")).toBe(3);
  });

  it("reports the best and worst rank over several weightings", () => {
    const r = rankRanges(states, indicators, [{ burden: 1, ses: 0 }, { burden: 0, ses: 1 }]);
    expect(r.get("A")).toEqual({ best: 1, worst: 3 });
    expect(r.get("B")).toEqual({ best: 2, worst: 2 });
  });
});
