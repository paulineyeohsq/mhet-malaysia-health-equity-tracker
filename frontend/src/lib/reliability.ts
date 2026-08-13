/**
 * Small-number caution flag for administrative rates (deaths, births, etc.)
 * — the registry-data equivalent of the NHMS survey data's own `_unreliable`
 * flag. A rate built on a handful of underlying events (e.g. 2 maternal
 * deaths in a small state in one year) swings wildly year to year and
 * state to state; flagging it costs nothing to compute and prevents
 * over-reading noise as a real disparity. This is NOT a confidence
 * interval — no interval is computed or implied, only a threshold check
 * on a real, already-published count field. 10 is the conventional
 * small-number-suppression threshold used in public health reporting
 * (e.g. many health agencies caution or suppress rates below this count).
 */
export const SMALL_COUNT_THRESHOLD = 10;

export function isSmallCount(abs: number | null | undefined, threshold: number = SMALL_COUNT_THRESHOLD): boolean {
  return typeof abs === "number" && abs > 0 && abs < threshold;
}

export const SMALL_COUNT_CAUTION_TEXT =
  `Based on fewer than ${SMALL_COUNT_THRESHOLD} recorded events — this rate can swing sharply from small ` +
  "changes in the underlying count and should be read with caution, not as a precise estimate.";
