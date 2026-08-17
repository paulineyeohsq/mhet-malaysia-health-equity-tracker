/**
 * Maps a dashboard route path to the processed JSON files that page
 * actually fetches (mirrors each page's own useData() calls in
 * frontend/src/pages/*.tsx), so the chat is grounded in "the data on the
 * page" the user is currently looking at. Re-derive this list directly
 * from each page's useData() calls whenever a page's data dependencies
 * change — a stale entry here silently starves the assistant of context
 * on that page (it still gets dataset_inventory.json, but nothing else).
 * geo/*.geojson files are intentionally excluded — not useful text
 * context for a chat model.
 */
export const PAGE_DATA_FILES: Record<string, string[]> = {
  "/": [
    "socioeconomic_national.json",
    "socioeconomic_state.json",
    "healthcare_access_national.json",
    "population_state.json",
  ],
  "/map": [
    "socioeconomic_state.json",
    "healthcare_access_state.json",
    "health_outcomes_state.json",
    "fertility_state.json",
    "deaths_district_sex.json",
    "births_district_sex.json",
    "forest_reserve_state.json",
    "water_consumption_state.json",
    "water_production_state.json",
  ],
  "/socioeconomic": [
    "socioeconomic_national.json",
    "socioeconomic_state.json",
    "socioeconomic_district.json",
    "health_outcomes_state.json",
    "hies_percentile_national.json",
    "sanitation_access_state.json",
    "water_access_state.json",
    "water_access_national.json",
    "electricity_access_region.json",
  ],
  "/health-outcomes": [
    "health_outcomes_state.json",
    "immunisation_national.json",
    "nutrition_national.json",
    "covid_state.json",
    "health_programmes_state.json",
    "pekab40_screenings_daily_state.json",
    "hiv_incidence_national.json",
    "deaths_ethnicity_state.json",
  ],
  "/healthcare-access": [
    "healthcare_access_national.json",
    "healthcare_access_state.json",
    "healthcare_access_district_2022.json",
    "population_state.json",
  ],
  "/financing": ["mnha_national.json"],
  "/environment": [
    "forest_reserve_national.json",
    "forest_reserve_state.json",
    "water_consumption_state.json",
    "water_production_state.json",
    "air_pollution_national.json",
    "ghg_emissions_national.json",
    "water_pollution_basin_national.json",
    "electricity_consumption_national.json",
    "electricity_supply_national.json",
  ],
  "/population": [
    "population_state.json",
    "population_district.json",
    "population_parlimen.json",
    "population_dun.json",
    "marriages_national.json",
    "fertility_state.json",
    "nutrition_national.json",
  ],
  "/determinants": [
    "health_outcomes_state.json",
    "healthcare_access_state.json",
    "socioeconomic_state.json",
    "nhms_ncd_state.json",
    "nhms_adolescent_mental_health_state.json",
    "sanitation_access_state.json",
    "water_access_state.json",
    "marriages_state.json",
    "fertility_state.json",
    "health_programmes_state.json",
    "forest_reserve_state.json",
    "water_consumption_state.json",
    "water_production_state.json",
  ],
  "/matrix": [
    "health_outcomes_state.json",
    "healthcare_access_state.json",
    "socioeconomic_state.json",
    "nhms_ncd_state.json",
    "nhms_adolescent_mental_health_state.json",
    "sanitation_access_state.json",
    "water_access_state.json",
    "marriages_state.json",
    "fertility_state.json",
    "health_programmes_state.json",
    "forest_reserve_state.json",
    "water_consumption_state.json",
    "water_production_state.json",
  ],
  "/trends": [
    "health_outcomes_state.json",
    "healthcare_access_state.json",
    "socioeconomic_state.json",
    "nhms_ncd_state.json",
    "nhms_adolescent_mental_health_state.json",
    "sanitation_access_state.json",
    "water_access_state.json",
    "marriages_state.json",
    "fertility_state.json",
    "health_programmes_state.json",
    "forest_reserve_state.json",
    "water_consumption_state.json",
    "water_production_state.json",
  ],
  "/analytics": [
    "health_outcomes_state.json",
    "healthcare_access_state.json",
    "socioeconomic_state.json",
    "population_state.json",
  ],
  "/state-matrix": [
    "health_outcomes_state.json",
    "healthcare_access_state.json",
    "socioeconomic_state.json",
    "nhms_ncd_state.json",
    "nhms_adolescent_mental_health_state.json",
    "sanitation_access_state.json",
    "water_access_state.json",
    "marriages_state.json",
    "fertility_state.json",
    "health_programmes_state.json",
    "forest_reserve_state.json",
    "water_consumption_state.json",
    "water_production_state.json",
  ],
  "/priority-areas": ["health_outcomes_state.json", "healthcare_access_state.json", "socioeconomic_state.json"],
  "/research-opportunities": ["health_outcomes_state.json", "healthcare_access_state.json"],
};

/** /explorer, /data-gaps, /methodology, and any unrecognized path fall
 * through to [] — they still get dataset_inventory.json context (see
 * index.ts), which is the relevant "data" for those pages anyway. */
export function bundleFor(path: string): string[] {
  return PAGE_DATA_FILES[path] ?? [];
}
