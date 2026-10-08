// Colour contrast for the parts axe-core cannot judge: chart marks (categorical palette) and choropleth fills/outlines.
// WCAG 2.1: 1.4.3 needs 4.5:1 for normal text, 1.4.11 needs 3:1 for graphical objects and UI components.
import { describe, expect, it } from "vitest";
import config from "../tailwind.config.js";
import { contrastRatio, MAP_BACKGROUND, NO_DATA, outlineFor, SEQ_RAMP } from "../src/lib/mapColors";

const colors = (config as { theme: { extend: { colors: Record<string, any> } } }).theme.extend.colors;
const SURFACES = [colors.surface as string, colors.plane as string, "#ffffff"];

describe("text colours", () => {
  it.each([
    ["ink.primary", colors.ink.primary],
    ["ink.secondary", colors.ink.secondary],
    ["ink.muted", colors.ink.muted],
    ["series.1 (links and accents)", colors.series[1]],
    ["status.critical", colors.status.critical],
  ])("%s is at least 4.5:1 on every page surface", (_name, hex) => {
    for (const bg of SURFACES) expect(contrastRatio(hex, bg), `${hex} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });
});

describe("categorical chart palette (series 1-8)", () => {
  const entries = Object.entries(colors.series as Record<string, string>);
  it.each(entries)("series %s is at least 3:1 against the page surface", (_k, hex) => {
    for (const bg of SURFACES) expect(contrastRatio(hex, bg), `${hex} on ${bg}`).toBeGreaterThanOrEqual(3);
  });
});

describe("choropleth map", () => {
  it("every region outline is at least 3:1 against its own fill, so each region's edge stays visible", () => {
    for (const fill of [...SEQ_RAMP, NO_DATA]) {
      expect(contrastRatio(outlineFor(fill), fill), `outline on ${fill}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("the ramp gets monotonically darker, so order is readable without colour names", () => {
    for (let i = 1; i < SEQ_RAMP.length; i++) {
      expect(contrastRatio(SEQ_RAMP[i], "#ffffff")).toBeGreaterThan(contrastRatio(SEQ_RAMP[i - 1], "#ffffff"));
    }
  });

  it("the darker half of the ramp stands out from the map background by at least 3:1", () => {
    for (const fill of SEQ_RAMP.slice(4)) expect(contrastRatio(fill, MAP_BACKGROUND)).toBeGreaterThanOrEqual(3);
  });

  it("documents the limit: pale steps cannot reach 3:1 against the background or each other", () => {
    // Adjacent steps of any 7-step single-hue ramp are about 1.2-2:1 apart, which is why every map has a
    // text summary, tooltips, a legend and a 'View as table' alternative rather than relying on fill colour alone.
    const adjacent = SEQ_RAMP.slice(1).map((c, i) => contrastRatio(c, SEQ_RAMP[i]));
    expect(Math.max(...adjacent)).toBeLessThan(3);
  });
});
