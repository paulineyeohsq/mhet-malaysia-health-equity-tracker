import type { InventoryDataset } from "./inventoryMap";

/**
 * How the Data Gaps page groups the dataset catalogue so it can be scanned (and, on a phone, opened one group at a
 * time). Display only: nothing here changes which datasets exist. A dataset not named below lands in "Other", and a
 * unit test fails if that ever happens, so a newly added dataset gets a group deliberately.
 */
export const DATASET_GROUPS: { id: string; label: string; ids: string[] }[] = [
  {
    id: "income",
    label: "Income, poverty and inequality",
    ids: [
      "hh_income", "hh_income_state", "hh_income_district", "hh_poverty", "hh_poverty_state", "hh_poverty_district",
      "hh_inequality", "hh_inequality_state", "hh_inequality_district", "hies_malaysia_percentile", "hies_2019_snapshot",
    ],
  },
  {
    id: "population",
    label: "Population and demography",
    ids: [
      "population_state", "population_district_full", "census_district", "population_parlimen", "population_dun",
      "marriages", "fertility_state",
    ],
  },
  {
    id: "health-system",
    label: "Healthcare resources, spending and programmes",
    ids: ["hospital_beds", "healthcare_staff", "mnha", "health_programmes_state", "pekab40_screenings_daily"],
  },
  {
    id: "outcomes",
    label: "Health outcomes",
    ids: [
      "life_expectancy", "death_state", "death_maternal_state", "deaths_early_childhood_state", "death_sex_ethnic_state",
      "death_district_sex", "birth_state", "birth_district_sex", "stillbirth_state", "std_state", "sdg_03-3-1",
      "infant_immunisation", "nutrition_status_u5_sex", "nutrition_children_strata", "nhms_ncd_2019",
      "nhms_adolescent_mental_health_2017", "covid_cases",
    ],
  },
  {
    id: "living",
    label: "Housing, water, energy and environment",
    ids: [
      "hh_access_amenities", "sanitation_access", "water_access", "electricity_access", "water_consumption",
      "water_production", "water_pollution_basin", "air_pollution", "ghg_emissions", "electricity_consumption",
      "electricity_supply", "forest_reserve", "forest_reserve_state",
    ],
  },
  { id: "boundaries", label: "Map boundaries", ids: ["administrative_boundaries"] },
];

export interface DatasetGroup {
  id: string;
  label: string;
  items: InventoryDataset[];
}

/** Every dataset in exactly one group, in the order above (then catalogue order); groups with nothing in them are left out. */
export function groupDatasets(datasets: InventoryDataset[]): DatasetGroup[] {
  const known = new Set(DATASET_GROUPS.flatMap((g) => g.ids));
  const groups: DatasetGroup[] = DATASET_GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    items: datasets.filter((d) => g.ids.includes(d.id)),
  }));
  const other = datasets.filter((d) => !known.has(d.id));
  if (other.length > 0) groups.push({ id: "other", label: "Other", items: other });
  return groups.filter((g) => g.items.length > 0);
}

/** Case-insensitive match on the words a visitor might search for. */
export function matchesQuery(d: Pick<InventoryDataset, "id" | "name" | "description" | "source_org" | "geographic_resolution" | "date_range" | "limitations">, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [d.id, d.name, d.description, d.source_org, d.geographic_resolution, d.date_range, d.limitations].some((s) => s.toLowerCase().includes(q));
}
