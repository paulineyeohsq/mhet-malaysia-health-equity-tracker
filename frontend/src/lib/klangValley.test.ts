import { afterEach, describe, expect, it } from "vitest";
import { computeGroupGapStats, type Row } from "./equity";
import { applyKlangValleyMode, getKlangValleyMode, kvLabel, setKlangValleyMode } from "./klangValley";

const rows: Row[] = [
  { state: "Selangor", year: 2022, staff_per_100k: 340, staff_per_100k_pooled: 509, beds_per_100k: 108, beds_per_100k_pooled: 144, pool_label: "KV" },
  { state: "W.P. Kuala Lumpur", year: 2022, staff_per_100k: 966, staff_per_100k_pooled: 509, beds_per_100k: 248, beds_per_100k_pooled: 144, pool_label: "KV" },
  { state: "W.P. Putrajaya", year: 2022, staff_per_100k: 3036, staff_per_100k_pooled: 509, beds_per_100k: 544, beds_per_100k_pooled: 144, pool_label: "KV" },
  { state: "Perlis", year: 2022, staff_per_100k: 730, staff_per_100k_pooled: 730, beds_per_100k: 175, beds_per_100k_pooled: 175, pool_label: null },
  { state: "Johor", year: 2022, staff_per_100k: 363, staff_per_100k_pooled: 363, beds_per_100k: 135, beds_per_100k_pooled: 135, pool_label: null },
];

afterEach(() => setKlangValleyMode("pooled"));

describe("applyKlangValleyMode on other files", () => {
  it("also resets the clinic rates, whatever the file, by the *_per_100k_pooled naming rule", () => {
    const rows = [{ state: "W.P. Putrajaya", pool_label: "KV", clinics_per_100k: 3.3, clinics_per_100k_pooled: 2.7, dental_clinics_per_100k: 5, dental_clinics_per_100k_pooled: 4 }];
    const sep = applyKlangValleyMode(rows, "separate")[0];
    expect(sep.clinics_per_100k_pooled).toBe(3.3);
    expect(sep.dental_clinics_per_100k_pooled).toBe(5);
    expect(sep.pool_label).toBeNull();
    expect(rows[0].clinics_per_100k_pooled).toBe(2.7);
  });
});

describe("applyKlangValleyMode", () => {
  it("returns the published rows untouched while pooled", () => {
    expect(applyKlangValleyMode(rows, "pooled")).toBe(rows);
  });

  it("gives every territory its own rate and no pool when separate", () => {
    const sep = applyKlangValleyMode(rows, "separate");
    expect(sep.map((r) => r.staff_per_100k_pooled)).toEqual([340, 966, 3036, 730, 363]);
    expect(sep.map((r) => r.beds_per_100k_pooled)).toEqual([108, 248, 544, 175, 135]);
    expect(sep.every((r) => r.pool_label === null)).toBe(true);
  });

  it("does not mutate the published rows", () => {
    applyKlangValleyMode(rows, "separate");
    expect(rows[2].staff_per_100k_pooled).toBe(509);
  });

  it("flows through the gap statistics: 2.0x pooled, 8.9x with each territory on its own", () => {
    const pooled = computeGroupGapStats(applyKlangValleyMode(rows, "pooled"), 2022, "staff_per_100k_pooled", false)!;
    const separate = computeGroupGapStats(applyKlangValleyMode(rows, "separate"), 2022, "staff_per_100k_pooled", false)!;
    expect(pooled.n).toBe(3); // Klang Valley counted once
    expect(pooled.ratio).toBeCloseTo(730 / 363, 5);
    expect(separate.n).toBe(5);
    expect(separate.best.name).toBe("W.P. Putrajaya");
    expect(separate.ratio).toBeCloseTo(3036 / 340, 5);
  });
});

describe("the mode itself", () => {
  it("defaults to pooled and can be switched", () => {
    expect(getKlangValleyMode()).toBe("pooled");
    setKlangValleyMode("separate");
    expect(getKlangValleyMode()).toBe("separate");
  });

  it("labels indicators as pooled only while pooled", () => {
    expect(kvLabel("Hospital bed availability", "pooled")).toBe("Hospital bed availability (Klang Valley pooled)");
    expect(kvLabel("Hospital bed availability", "separate")).toBe("Hospital bed availability");
    setKlangValleyMode("separate");
    expect(kvLabel("Hospital bed availability")).toBe("Hospital bed availability");
  });
});
