import { describe, expect, it } from "vitest";
import { computePriorityScores, normalizeMinMax, type ScoreComponentInput } from "./priorityScore";

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
