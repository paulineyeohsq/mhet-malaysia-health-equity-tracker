import { describe, expect, it } from "vitest";
import { isStaleYear, latestYearIn } from "./dataAge";

const in2026 = new Date("2026-10-08T00:00:00Z");

describe("isStaleYear", () => {
  it("flags figures from more than three years ago", () => {
    expect(isStaleYear(2022, in2026)).toBe(true); // 4 years
    expect(isStaleYear(2023, in2026)).toBe(false); // exactly 3 years: not more than three
    expect(isStaleYear(2026, in2026)).toBe(false);
  });
  it("is false when there is no year", () => {
    expect(isStaleYear(null, in2026)).toBe(false);
    expect(isStaleYear(undefined, in2026)).toBe(false);
  });
});

describe("latestYearIn", () => {
  it("returns the latest plausible year in free text", () => {
    expect(latestYearIn("2019, 2022 and 2024")).toBe(2024);
    expect(latestYearIn("2022, MOH + non-MOH")).toBe(2022);
  });
  it("ignores numbers that are not years", () => {
    expect(latestYearIn("49,985 beds")).toBeNull();
    expect(latestYearIn("RM 7,017")).toBeNull();
    expect(latestYearIn("code 12345")).toBeNull();
  });
  it("handles empty input", () => {
    expect(latestYearIn(undefined)).toBeNull();
    expect(latestYearIn("")).toBeNull();
  });
});
