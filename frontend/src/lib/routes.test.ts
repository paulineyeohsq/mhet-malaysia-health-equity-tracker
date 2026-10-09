import { describe, expect, it } from "vitest";
import { PAGE_DATA_FILES } from "./pageDataFiles";
import { canonicalPath, PATTERNS, TOPICS } from "./routes";

describe("consolidated routes", () => {
  it("maps each new URL back to the original page path", () => {
    expect(canonicalPath("/topics/access")).toBe("/healthcare-access");
    expect(canonicalPath("/patterns/inequality")).toBe("/socioeconomic");
    expect(canonicalPath("/patterns/trends")).toBe("/trends");
  });

  it("leaves every other path alone", () => {
    expect(canonicalPath("/map")).toBe("/map");
    expect(canonicalPath("/topics")).toBe("/topics");
  });

  it("keeps the data-as-of line, Klang Valley control and AI context working: every option's original path has a data-file entry", () => {
    for (const o of [...TOPICS, ...PATTERNS]) {
      expect(PAGE_DATA_FILES[o.legacy], o.legacy).toBeTruthy();
    }
  });

  it("uses unique ids, paths and legacy paths", () => {
    const all = [...TOPICS, ...PATTERNS];
    expect(new Set(all.map((o) => o.path)).size).toBe(all.length);
    expect(new Set(all.map((o) => o.legacy)).size).toBe(all.length);
    expect(new Set(TOPICS.map((o) => o.id)).size).toBe(TOPICS.length);
    expect(new Set(PATTERNS.map((o) => o.id)).size).toBe(PATTERNS.length);
  });
});
