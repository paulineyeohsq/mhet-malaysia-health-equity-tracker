import { useSyncExternalStore } from "react";
import type { Row } from "./equity";

/**
 * How Selangor, W.P. Kuala Lumpur and W.P. Putrajaya are treated in staff / hospital-bed per-100,000 comparisons.
 *   "pooled"   - the three are one Klang Valley unit (the pipeline's `*_per_100k_pooled` fields). Default, because
 *                they share referral hospitals and federal institutions, so a per-resident rate for each on its
 *                own is not like-for-like.
 *   "separate" - each territory keeps its own rate (`staff_per_100k` / `beds_per_100k`), e.g. W.P. Putrajaya's
 *                3,036 staff per 100,000 in 2022. Shown on request, with a warning.
 * The choice is global and remembered in this browser. It is applied once, where the healthcare-access file is
 * loaded (see useData), so every ranking, gap, map, score, correlation and AI prompt follows it.
 */
export type KlangValleyMode = "pooled" | "separate";

export const KLANG_VALLEY_UNITS = ["Selangor", "W.P. Kuala Lumpur", "W.P. Putrajaya"] as const;
export const HEALTHCARE_ACCESS_FILE = "healthcare_access_state.json";

const STORAGE_KEY = "myheo:klang-valley-mode";

function readStored(): KlangValleyMode {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "separate" ? "separate" : "pooled";
  } catch {
    return "pooled"; // storage can be unavailable (private window, blocked site data)
  }
}

let mode: KlangValleyMode = typeof window === "undefined" ? "pooled" : readStored();
const listeners = new Set<() => void>();

export function getKlangValleyMode(): KlangValleyMode {
  return mode;
}

export function setKlangValleyMode(next: KlangValleyMode): void {
  if (next === mode) return;
  mode = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* remembered for this page view only */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useKlangValleyMode(): [KlangValleyMode, (m: KlangValleyMode) => void] {
  const current = useSyncExternalStore(subscribe, getKlangValleyMode, () => "pooled" as KlangValleyMode);
  return [current, setKlangValleyMode];
}

/** "Healthcare staff availability" -> "... (Klang Valley pooled)" while pooled, unchanged while separate. */
export function kvLabel(base: string, current: KlangValleyMode = mode): string {
  return current === "pooled" ? `${base} (Klang Valley pooled)` : base;
}

/**
 * Rows for the healthcare-access file in the chosen mode. In "separate" mode the pooled fields are overwritten with
 * each state's own rate and `pool_label` is cleared, so downstream code (which only ever reads the `*_pooled`
 * fields and `pool_label`) treats every state as its own unit without knowing about the toggle.
 */
export function applyKlangValleyMode(rows: Row[], current: KlangValleyMode): Row[] {
  if (current === "pooled") return rows;
  return rows.map((r) => ({
    ...r,
    pool_label: null,
    staff_per_100k_pooled: r.staff_per_100k ?? null,
    beds_per_100k_pooled: r.beds_per_100k ?? null,
  }));
}
