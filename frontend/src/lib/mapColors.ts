// Colours for the choropleth maps, plus the contrast maths used to keep region outlines readable.

/** Single-hue sequential ramp, light -> dark (low -> high value). */
export const SEQ_RAMP = ["#e3f2f3", "#c2d4da", "#a1b6c2", "#8098aa", "#6f889d", "#4e6a85", "#1c3d60"];
/** Fill for regions with no value (shown explicitly, never left blank). */
export const NO_DATA = "#e1e0d9";
/** Colour behind the regions (there is no basemap). */
export const MAP_BACKGROUND = "#e8eef2";

const OUTLINE_LIGHT = "#ffffff";
const OUTLINE_DARK = "#0b0b0b";

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a #rrggbb colour. */
export function relativeLuminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio (1 to 21) between two #rrggbb colours. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Region outline colour: white or near-black, whichever contrasts more with the region's own fill, so every
 * region's edge stays visible whether its fill is pale or dark. */
export function outlineFor(fill: string): string {
  return contrastRatio(OUTLINE_LIGHT, fill) >= contrastRatio(OUTLINE_DARK, fill) ? OUTLINE_LIGHT : OUTLINE_DARK;
}
