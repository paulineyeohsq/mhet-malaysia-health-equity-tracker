/**
 * The consolidated pages. "Health Topics" shows one of four domain dashboards chosen from a dropdown; "Patterns &
 * Inequality" shows one of three analytical views chosen with a toggle. Each option still renders the original page
 * unchanged, so every option keeps its old URL as a redirect (bookmarks and in-app links keep working) and keeps
 * being described to the rest of the app (data-as-of line, Klang Valley control, AI grounding) by its original path.
 */
export interface Option {
  id: string;
  /** The new URL. */
  path: string;
  /** The original URL, which now redirects to `path`. */
  legacy: string;
  label: string;
}

export const TOPICS: Option[] = [
  { id: "outcomes", path: "/topics/outcomes", legacy: "/health-outcomes", label: "Health Outcomes" },
  { id: "access", path: "/topics/access", legacy: "/healthcare-access", label: "Healthcare Access" },
  { id: "financing", path: "/topics/financing", legacy: "/financing", label: "Healthcare Financing" },
  { id: "environment", path: "/topics/environment", legacy: "/environment", label: "Environment" },
];

export const PATTERNS: Option[] = [
  { id: "trends", path: "/patterns/trends", legacy: "/trends", label: "Trend over time" },
  { id: "matrix", path: "/patterns/matrix", legacy: "/matrix", label: "Indicator matrix" },
  { id: "inequality", path: "/patterns/inequality", legacy: "/socioeconomic", label: "Inequality gap" },
];

const TO_LEGACY = new Map([...TOPICS, ...PATTERNS].map((o) => [o.path, o.legacy]));

/** The original path of a page, so a consolidated page is looked up (data files, AI context) as the page it shows. */
export function canonicalPath(pathname: string): string {
  return TO_LEGACY.get(pathname) ?? pathname;
}
