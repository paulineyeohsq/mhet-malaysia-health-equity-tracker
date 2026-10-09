/**
 * Every routed page (see src/App.tsx and src/components/Layout.tsx). "" is the home page. The four health topics and
 * three analytical views are options of two consolidated pages; their old URLs redirect (tested separately).
 */
export const ROUTES = [
  "",
  "population",
  "map",
  "topics/outcomes",
  "topics/access",
  "topics/financing",
  "topics/environment",
  "patterns/trends",
  "patterns/matrix",
  "patterns/inequality",
  "determinants",
  "analytics",
  "state-matrix",
  "priority-areas",
  "research-opportunities",
  "explorer",
  "data-gaps",
  "methodology",
] as const;

/** Old URL -> where it now lands. */
export const LEGACY_REDIRECTS: Record<string, string> = {
  "health-outcomes": "topics/outcomes",
  "healthcare-access": "topics/access",
  financing: "topics/financing",
  environment: "topics/environment",
  trends: "patterns/trends",
  matrix: "patterns/matrix",
  socioeconomic: "patterns/inequality",
};
