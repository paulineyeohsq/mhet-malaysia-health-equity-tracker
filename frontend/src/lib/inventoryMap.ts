// dataset_inventory.json shape + the processed-file -> inventory-id mapping.
// Shared by DataExplorer.tsx and MetadataPanel.tsx so this isn't duplicated.

export interface InventoryDataset {
  id: string;
  name: string;
  url: string;
  endpoint_csv?: string;
  endpoint_parquet?: string;
  description: string;
  source_org: string;
  update_frequency: string;
  date_range: string;
  geographic_resolution: string;
  dimensions?: string[];
  variables?: string[];
  unit: string;
  missingness: string;
  joinable_with?: string[];
  recommended_use?: string;
  limitations: string;
  status: string;
}

export interface NotIngestedDataset {
  id: string;
  name: string;
  reason: string;
}

export interface InventoryFile {
  generated: string;
  source_catalogue: string;
  note: string;
  datasets: InventoryDataset[];
  identified_but_not_yet_ingested: NotIngestedDataset[];
}

// Which dataset_inventory.json `datasets[].id` entries feed each processed
// file. transform_data.py merges multiple raw sources into some processed
// files (e.g. income + poverty + gini -> socioeconomic_state.json), so a
// processed file can map to several inventory entries — all are shown.
export const INVENTORY_MAP: Record<string, string[]> = {
  "socioeconomic_national.json": ["hh_income", "hh_poverty", "hh_inequality"],
  "socioeconomic_state.json": ["hh_income_state", "hh_poverty_state", "hh_inequality_state"],
  "socioeconomic_district.json": [
    "hh_income_district",
    "hh_poverty_district",
    "hh_inequality_district",
    "hh_access_amenities",
  ],
  "population_state.json": ["population_state"],
  // population_district.json is actually built from the DOSM census_district
  // series, not the (not-yet-ingested) live population_district source — see
  // that entry's `limitations` field in dataset_inventory.json.
  "population_district.json": ["census_district"],
  "healthcare_access_state.json": ["hospital_beds", "healthcare_staff"],
  "healthcare_access_national.json": ["hospital_beds", "healthcare_staff"],
  "healthcare_access_district_2022.json": ["hospital_beds"],
  "health_outcomes_state.json": [
    "death_state",
    "death_maternal_state",
    "deaths_early_childhood_state",
    "birth_state",
  ],
  "immunisation_national.json": ["infant_immunisation"],
  "nutrition_national.json": ["nutrition_status_u5_sex"],
  "nhms_ncd_state.json": ["nhms_ncd_2019"],
  "nhms_ncd_national.json": ["nhms_ncd_2019"],
};
