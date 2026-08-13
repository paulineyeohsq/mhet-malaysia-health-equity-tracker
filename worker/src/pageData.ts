/**
 * Maps a dashboard route path to the processed JSON files that page
 * actually fetches (mirrors each page's own useData()/useMultiData()
 * calls in frontend/src/pages/*.tsx), so the chat is grounded in "the
 * data on the page" the user is currently looking at.
 */
export const PAGE_DATA_FILES: Record<string, string[]> = {
  "/": [
    "socioeconomic_national.json",
    "socioeconomic_state.json",
    "healthcare_access_national.json",
    "population_state.json",
  ],
  "/map": ["socioeconomic_state.json", "healthcare_access_state.json", "health_outcomes_state.json"],
  "/socioeconomic": [
    "socioeconomic_national.json",
    "socioeconomic_state.json",
    "socioeconomic_district.json",
    "health_outcomes_state.json",
  ],
  "/health-outcomes": ["health_outcomes_state.json", "immunisation_national.json", "nutrition_national.json"],
  "/healthcare-access": [
    "healthcare_access_national.json",
    "healthcare_access_state.json",
    "healthcare_access_district_2022.json",
    "population_state.json",
  ],
  "/population": ["population_state.json", "population_district.json"],
  "/analytics": [
    "health_outcomes_state.json",
    "healthcare_access_state.json",
    "socioeconomic_state.json",
    "population_state.json",
  ],
};

/** /explorer, /methodology, and any unrecognized path fall through to []
 * — they still get dataset_inventory.json context (see index.ts). */
export function bundleFor(path: string): string[] {
  return PAGE_DATA_FILES[path] ?? [];
}
