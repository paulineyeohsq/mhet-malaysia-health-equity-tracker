/** A figure from this many whole years ago, or more, is flagged as "older data" (more than three years old). */
export const STALE_AFTER_YEARS = 3;

export function currentYear(now: Date = new Date()): number {
  return now.getFullYear();
}

/** True when `year` is more than STALE_AFTER_YEARS before `now`'s year (2022 is stale in 2026; 2023 is not). */
export function isStaleYear(year: number | null | undefined, now: Date = new Date()): boolean {
  return typeof year === "number" && currentYear(now) - year > STALE_AFTER_YEARS;
}

/** The latest plausible 4-digit year (1990-2100) mentioned in a piece of text, or null. */
export function latestYearIn(text: string | undefined | null): number | null {
  if (!text) return null;
  const years = [...text.matchAll(/\b(19[9]\d|20\d\d)\b/g)].map((m) => Number(m[1]));
  return years.length ? Math.max(...years) : null;
}
