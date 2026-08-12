export interface AskMhetQuestion {
  id: string;
  question: string;
  path: string;
  /** Passed as router location state; each target page reads this once on
   * mount to pre-apply the matching filter — see each page's useLocation
   * useEffect. Keys/values must match that page's real useState setters. */
  state?: Record<string, unknown>;
}

/**
 * A curated shortcut list, not a free-text query — each entry deep-links to
 * an existing page with a real filter pre-applied. No natural-language
 * parsing and no backend; this is a static site.
 */
export const ASK_MHET_QUESTIONS: AskMhetQuestion[] = [
  {
    id: "poverty-state",
    question: "Which state has the highest poverty rate?",
    path: "/map",
    state: { indicatorId: "poverty", geography: "state" },
  },
  {
    id: "poverty-district",
    question: "Which district has the highest poverty rate?",
    path: "/map",
    state: { indicatorId: "poverty", geography: "district" },
  },
  {
    id: "poverty-inequality",
    question: "How unequal is poverty across Malaysian states?",
    path: "/socioeconomic",
    state: { rankIndicatorId: "poverty_absolute" },
  },
  {
    id: "maternal-mortality",
    question: "Which state has the highest maternal mortality rate?",
    path: "/health-outcomes",
    state: { category: "mortality", mortalityMetricId: "maternal_mortality" },
  },
  {
    id: "staff-gap",
    question: "Where is the healthcare workforce gap widest?",
    path: "/analytics",
    state: { primaryId: "staff" },
  },
];
