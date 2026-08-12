/**
 * Central provenance registry. Every indicator shown in the dashboard must
 * cite its source (per project requirement) — components look up their
 * indicator key here and render a <SourceNote>. Keep this in sync with
 * data/inventory/dataset_inventory.json (the machine-readable version used
 * by the Data Explorer / Methodology pages).
 */
export interface SourceInfo {
  label: string;
  org: string;
  url: string;
  geography: string;
  unit: string;
  lastUpdated: string;
}

export const SOURCES: Record<string, SourceInfo> = {
  income: {
    label: "Household Income",
    org: "Department of Statistics Malaysia (DOSM)",
    url: "https://data.gov.my/data-catalogue/hh_income_state",
    geography: "National / State / District",
    unit: "RM per month",
    lastUpdated: "2025-12-31",
  },
  poverty: {
    label: "Poverty Rate",
    org: "Department of Statistics Malaysia (DOSM)",
    url: "https://data.gov.my/data-catalogue/hh_poverty_state",
    geography: "National / State / District",
    unit: "%",
    lastUpdated: "2025-12-31",
  },
  gini: {
    label: "Gini Coefficient",
    org: "Department of Statistics Malaysia (DOSM)",
    url: "https://data.gov.my/data-catalogue/hh_inequality_state",
    geography: "National / State / District",
    unit: "index (0–1)",
    lastUpdated: "2025-12-31",
  },
  amenities: {
    label: "Access to Basic Amenities",
    org: "Department of Statistics Malaysia (DOSM), from HIES",
    url: "https://data.gov.my/data-catalogue/hh_access_amenities",
    geography: "State / District (2022)",
    unit: "%",
    lastUpdated: "2024-09-01",
  },
  hospital_beds: {
    label: "Hospital Beds",
    org: "Ministry of Health Malaysia",
    url: "https://data.gov.my/data-catalogue/hospital_beds",
    geography: "National / State / District",
    unit: "count",
    lastUpdated: "2024-09-01",
  },
  healthcare_staff: {
    label: "Healthcare Staff",
    org: "Ministry of Health Malaysia",
    url: "https://data.gov.my/data-catalogue/healthcare_staff",
    geography: "National / State",
    unit: "count",
    lastUpdated: "2024-09-01",
  },
  deaths: {
    label: "Deaths",
    org: "National Registration Department / DOSM",
    url: "https://data.gov.my/data-catalogue/deaths_state",
    geography: "National / State",
    unit: "count, per 1,000 population",
    lastUpdated: "2025-10-16",
  },
  maternal_deaths: {
    label: "Maternal Deaths",
    org: "National Registration Department / DOSM",
    url: "https://data.gov.my/data-catalogue/deaths_maternal_state",
    geography: "National / State",
    unit: "per 100,000 live births",
    lastUpdated: "2025-10-16",
  },
  early_childhood_deaths: {
    label: "Early Childhood Deaths",
    org: "National Registration Department / DOSM",
    url: "https://data.gov.my/data-catalogue/deaths_early_childhood_state",
    geography: "State",
    unit: "count / rate (varies by sub-type)",
    lastUpdated: "2025-10-16",
  },
  births: {
    label: "Live Births",
    org: "National Registration Department / DOSM",
    url: "https://data.gov.my/data-catalogue/births_annual_state",
    geography: "National / State",
    unit: "count, per 1,000 population",
    lastUpdated: "2025-10-16",
  },
  immunisation: {
    label: "Infant Immunisation Coverage",
    org: "Ministry of Health Malaysia",
    url: "https://data.gov.my/data-catalogue/infant_immunisation",
    geography: "National",
    unit: "%",
    lastUpdated: "2024-11-20",
  },
  nutrition: {
    label: "Nutritional Status of Children Under 5",
    org: "Ministry of Health Malaysia (NHMS)",
    url: "https://data.gov.my/data-catalogue/nutrition_children_sex",
    geography: "National",
    unit: "%",
    lastUpdated: "2024-09-01",
  },
  std: {
    label: "Sexually Transmitted Diseases",
    org: "Ministry of Health Malaysia",
    url: "https://data.gov.my/data-catalogue/std_state",
    geography: "State",
    unit: "cases, per 100,000 population",
    lastUpdated: "2024-09-01",
  },
  population: {
    label: "Population",
    org: "Department of Statistics Malaysia (DOSM)",
    url: "https://data.gov.my/data-catalogue/population_state",
    geography: "National / State / District",
    unit: "persons",
    lastUpdated: "2026-07-31",
  },
  census: {
    label: "Census Population (historical)",
    org: "Department of Statistics Malaysia (DOSM), GitHub open-data mirror",
    url: "https://github.com/dosm-malaysia/data-open",
    geography: "District",
    unit: "persons",
    lastUpdated: "2020 census round",
  },
  boundaries: {
    label: "Administrative Boundaries",
    org: "Department of Statistics Malaysia (DOSM), GitHub open-data mirror",
    url: "https://github.com/dosm-malaysia/data-open",
    geography: "State / District",
    unit: "geometry",
    lastUpdated: "current gazette",
  },
};
