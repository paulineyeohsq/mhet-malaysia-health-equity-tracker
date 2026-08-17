import type { SOURCES } from "./sources";
import type { Row } from "./equity";

export interface FieldDef {
  id: string;
  label: string;
  file:
    | "health_outcomes_state.json"
    | "healthcare_access_state.json"
    | "socioeconomic_state.json"
    | "nhms_ncd_state.json"
    | "nhms_adolescent_mental_health_state.json"
    | "sanitation_access_state.json"
    | "water_access_state.json"
    | "marriages_state.json"
    | "fertility_state.json"
    | "health_programmes_state.json"
    | "forest_reserve_state.json"
    | "water_consumption_state.json"
    | "water_production_state.json";
  field: string;
  unit: string;
  sourceKey: keyof typeof SOURCES;
  /** true if a higher value reflects greater disadvantage (used for research-question phrasing). */
  higherIsWorse: boolean;
  /**
   * Some source files carry an extra dimension (sex, strata, age_group)
   * beyond state+year, so state+year alone isn't a unique key until that
   * dimension is pinned to one value. Apply via rowsForField() below before
   * handing rows to the correlation engine, which assumes one row per
   * state+year.
   */
  filter?: (row: Row) => boolean;
}

/**
 * National-only indicators — no state dimension in the source at all (see
 * each dataset's `geographic_resolution` in dataset_inventory.json), so
 * unlike FieldDef these can never be grouped/ranked/averaged by state. Kept
 * as a separate, smaller registry rather than folded into FieldDef so that
 * anything doing a state comparison (Determinants Explorer, Indicator
 * Matrix, Research Opportunities, State Equity Gap Matrix, priority
 * scoring) never accidentally picks one up. Trends' "Multiple indicators —
 * Malaysia average" overlay mode is the one place these ARE usable
 * alongside state-level fields, since that mode already plots one national
 * figure per indicator per year — for these fields that figure is simply
 * read directly rather than averaged across states.
 */
export interface NationalFieldDef {
  id: string;
  label: string;
  file:
    | "air_pollution_national.json"
    | "ghg_emissions_national.json"
    | "water_pollution_basin_national.json"
    | "electricity_consumption_national.json"
    | "electricity_supply_national.json";
  field: string;
  unit: string;
  sourceKey: keyof typeof SOURCES;
  filter?: (row: Row) => boolean;
}

export const NATIONAL_FIELDS: NationalFieldDef[] = [
  { id: "air_co_nat", label: "Air pollution — CO (national)", file: "air_pollution_national.json", field: "concentration", unit: "ppm", sourceKey: "air_pollution", filter: (r) => r.pollutant === "CO" },
  { id: "air_no2_nat", label: "Air pollution — NO2 (national)", file: "air_pollution_national.json", field: "concentration", unit: "ppm", sourceKey: "air_pollution", filter: (r) => r.pollutant === "NO2" },
  { id: "air_o3_nat", label: "Air pollution — O3 (national)", file: "air_pollution_national.json", field: "concentration", unit: "ppm", sourceKey: "air_pollution", filter: (r) => r.pollutant === "O3" },
  { id: "air_pm10_nat", label: "Air pollution — PM10 (national)", file: "air_pollution_national.json", field: "concentration", unit: "µg/m³", sourceKey: "air_pollution", filter: (r) => r.pollutant === "PM 10" },
  { id: "air_pm25_nat", label: "Air pollution — PM2.5 (national)", file: "air_pollution_national.json", field: "concentration", unit: "µg/m³", sourceKey: "air_pollution", filter: (r) => r.pollutant === "PM 2.5" },
  { id: "air_so2_nat", label: "Air pollution — SO2 (national)", file: "air_pollution_national.json", field: "concentration", unit: "ppm", sourceKey: "air_pollution", filter: (r) => r.pollutant === "SO2" },
  { id: "ghg_total_nat", label: "GHG emissions, total (national)", file: "ghg_emissions_national.json", field: "emissions_gg_co2e", unit: "Gg CO2e", sourceKey: "ghg_emissions", filter: (r) => r.source === "total" },
  { id: "river_clean_nat", label: "River basins classified clean, BOD5 (national)", file: "water_pollution_basin_national.json", field: "proportion_pct", unit: "%", sourceKey: "water_pollution", filter: (r) => r.measure === "bod5" && r.status === "clean" },
  { id: "electricity_consumption_nat", label: "Electricity consumption, total (national)", file: "electricity_consumption_national.json", field: "consumption_mkwh", unit: "MKWh", sourceKey: "electricity_flow", filter: (r) => r.sector === "total" },
  { id: "electricity_supply_nat", label: "Electricity supply, total (national)", file: "electricity_supply_national.json", field: "supply_mkwh", unit: "MKWh", sourceKey: "electricity_flow", filter: (r) => r.sector === "total" },
];

/** Applies a FieldDef's optional row filter, if any. Use this instead of reading rowsByFile[field.file] directly whenever the field may have a filter. */
export function rowsForField(rows: Row[] | null, field: FieldDef): Row[] | null {
  if (!rows || !field.filter) return rows;
  return rows.filter(field.filter);
}

/**
 * Health/healthcare-access fields that can stand in as the outcome (y-axis
 * in Determinants Explorer, "outcome" picklist in Research Opportunities) —
 * the "WHY might this outcome vary?" side of the question.
 */
export const OUTCOME_FIELDS: FieldDef[] = [
  { id: "cdr", label: "Crude death rate", file: "health_outcomes_state.json", field: "crude_death_rate_per_1000", unit: "per 1,000 population", sourceKey: "deaths", higherIsWorse: true },
  { id: "mmr", label: "Maternal mortality rate", file: "health_outcomes_state.json", field: "maternal_mortality_rate_per_100k_births", unit: "per 100,000 live births", sourceKey: "maternal_deaths", higherIsWorse: true },
  { id: "imr", label: "Infant mortality rate", file: "health_outcomes_state.json", field: "infant_mortality_rate", unit: "per 1,000 live births", sourceKey: "early_childhood_deaths", higherIsWorse: true },
  { id: "u5mr", label: "Under-5 mortality rate", file: "health_outcomes_state.json", field: "under5_mortality_rate", unit: "per 1,000 live births", sourceKey: "early_childhood_deaths", higherIsWorse: true },
  { id: "cbr", label: "Crude birth rate", file: "health_outcomes_state.json", field: "crude_birth_rate_per_1000", unit: "per 1,000 population", sourceKey: "births", higherIsWorse: false },
  { id: "hiv", label: "HIV incidence", file: "health_outcomes_state.json", field: "std_hiv_incidence_per_100k", unit: "per 100,000 population", sourceKey: "std", higherIsWorse: true },
  { id: "staff_out", label: "Healthcare staff availability", file: "healthcare_access_state.json", field: "staff_per_100k", unit: "per 100,000 population", sourceKey: "healthcare_staff", higherIsWorse: false },
  { id: "beds_out", label: "Hospital bed availability", file: "healthcare_access_state.json", field: "beds_per_100k", unit: "per 100,000 population", sourceKey: "hospital_beds", higherIsWorse: false },
  { id: "diabetes", label: "Known diabetes prevalence (NHMS)", file: "nhms_ncd_state.json", field: "known_diabetes_prevalence_pct", unit: "% (survey estimate, adults 18+; 2015, 2019 or 2023)", sourceKey: "nhms_ncd", higherIsWorse: true },
  { id: "hypertension", label: "Known hypertension prevalence (NHMS)", file: "nhms_ncd_state.json", field: "known_hypertension_prevalence_pct", unit: "% (survey estimate, adults 18+; 2015, 2019 or 2023)", sourceKey: "nhms_ncd", higherIsWorse: true },
  { id: "raised_glucose", label: "Raised blood glucose (undiagnosed + known, NHMS)", file: "nhms_ncd_state.json", field: "raised_blood_glucose_prevalence_pct", unit: "% (survey estimate, adults 18+; 2015, 2019 or 2023)", sourceKey: "nhms_ncd", higherIsWorse: true },
  { id: "raised_bp", label: "Raised blood pressure (undiagnosed + known, NHMS)", file: "nhms_ncd_state.json", field: "raised_blood_pressure_prevalence_pct", unit: "% (survey estimate, adults 18+; 2015, 2019 or 2023)", sourceKey: "nhms_ncd", higherIsWorse: true },
  { id: "raised_cholesterol", label: "Raised blood cholesterol (undiagnosed + known, NHMS)", file: "nhms_ncd_state.json", field: "raised_cholesterol_prevalence_pct", unit: "% (survey estimate, adults 18+; 2015, 2019 or 2023)", sourceKey: "nhms_ncd", higherIsWorse: true },
  { id: "hypercholesterolaemia", label: "Known hypercholesterolaemia prevalence (NHMS)", file: "nhms_ncd_state.json", field: "known_hypercholesterolaemia_prevalence_pct", unit: "% (survey estimate, adults 18+; 2015, 2019 or 2023)", sourceKey: "nhms_ncd", higherIsWorse: true },
  { id: "undiagnosed_diabetes", label: "Undiagnosed diabetes prevalence (NHMS)", file: "nhms_ncd_state.json", field: "undiagnosed_diabetes_prevalence_pct", unit: "% (survey estimate, adults 18+; 2015 or 2023)", sourceKey: "nhms_ncd", higherIsWorse: true },
  { id: "undiagnosed_hypertension", label: "Undiagnosed hypertension prevalence (NHMS)", file: "nhms_ncd_state.json", field: "undiagnosed_hypertension_prevalence_pct", unit: "% (survey estimate, adults 18+; 2015 or 2023)", sourceKey: "nhms_ncd", higherIsWorse: true },
  { id: "undiagnosed_hypercholesterolaemia", label: "Undiagnosed hypercholesterolaemia prevalence (NHMS)", file: "nhms_ncd_state.json", field: "undiagnosed_hypercholesterolaemia_prevalence_pct", unit: "% (survey estimate, adults 18+; 2015 or 2023)", sourceKey: "nhms_ncd", higherIsWorse: true },
  { id: "physical_inactivity", label: "Physical inactivity prevalence (NHMS 2019)", file: "nhms_ncd_state.json", field: "physical_inactivity_prevalence_pct", unit: "% (survey estimate, age 16+)", sourceKey: "nhms_ncd", higherIsWorse: true },
  { id: "physically_active", label: "Physically active prevalence (NHMS 2015)", file: "nhms_ncd_state.json", field: "physically_active_prevalence_pct", unit: "% (survey estimate, age 16+ — inverse framing from 2019's inactivity measure, not the same field)", sourceKey: "nhms_ncd", higherIsWorse: false },
  { id: "current_smoker", label: "Current smoking prevalence (NHMS)", file: "nhms_ncd_state.json", field: "current_smoker_prevalence_pct", unit: "% (survey estimate, age 15+; 2015 or 2019)", sourceKey: "nhms_ncd", higherIsWorse: true },
  { id: "current_drinker", label: "Current alcohol drinking prevalence (NHMS 2019)", file: "nhms_ncd_state.json", field: "current_drinker_prevalence_pct", unit: "% (survey estimate, adults 18+ — several states flagged small-sample)", sourceKey: "nhms_ncd", higherIsWorse: true },
  { id: "underweight", label: "Underweight prevalence (NHMS)", file: "nhms_ncd_state.json", field: "underweight_prevalence_pct", unit: "% (survey estimate, adults 18+; 2015 or 2019)", sourceKey: "nhms_ncd", higherIsWorse: true },
  { id: "overweight", label: "Overweight prevalence, Asian BMI cutoff (NHMS 2019)", file: "nhms_ncd_state.json", field: "overweight_prevalence_pct", unit: "% (survey estimate, adults 18+)", sourceKey: "nhms_ncd", higherIsWorse: true },
  { id: "obesity", label: "Obesity prevalence, Asian BMI cutoff (NHMS 2019)", file: "nhms_ncd_state.json", field: "obesity_prevalence_pct", unit: "% (survey estimate, adults 18+)", sourceKey: "nhms_ncd", higherIsWorse: true },
  { id: "abdominal_obesity", label: "Abdominal obesity prevalence (NHMS)", file: "nhms_ncd_state.json", field: "abdominal_obesity_prevalence_pct", unit: "% (survey estimate, adults 18+; 2015 or 2019)", sourceKey: "nhms_ncd", higherIsWorse: true },
  { id: "adolescent_depression", label: "Adolescent depression prevalence (NHMS 2017, ages 13-17)", file: "nhms_adolescent_mental_health_state.json", field: "depression_prevalence_pct", unit: "% (survey estimate, secondary-school students aged 13-17 — NOT adults)", sourceKey: "nhms_adolescent_mental_health", higherIsWorse: true },
  { id: "adolescent_anxiety", label: "Adolescent anxiety prevalence (NHMS 2017, ages 13-17)", file: "nhms_adolescent_mental_health_state.json", field: "anxiety_prevalence_pct", unit: "% (survey estimate, secondary-school students aged 13-17 — NOT adults)", sourceKey: "nhms_adolescent_mental_health", higherIsWorse: true },
  { id: "adolescent_stress", label: "Adolescent stress prevalence (NHMS 2017, ages 13-17)", file: "nhms_adolescent_mental_health_state.json", field: "stress_prevalence_pct", unit: "% (survey estimate, secondary-school students aged 13-17 — NOT adults)", sourceKey: "nhms_adolescent_mental_health", higherIsWorse: true },
  { id: "tfr_out", label: "Total fertility rate", file: "fertility_state.json", field: "fertility_rate", unit: "births per woman", sourceKey: "fertility", higherIsWorse: false, filter: (r) => r.age_group === "tfr" },
  { id: "stillbirth_out", label: "Stillbirth rate", file: "health_outcomes_state.json", field: "stillbirth_rate_per_1000", unit: "per 1,000 total births", sourceKey: "deaths", higherIsWorse: true },
];

/**
 * Potential determinants — socioeconomic fields, plus healthcare-access
 * fields since availability of care can itself be examined as a
 * determinant of an outcome, not only as an outcome of poverty.
 */
export const DETERMINANT_FIELDS: FieldDef[] = [
  { id: "income", label: "Median household income", file: "socioeconomic_state.json", field: "income_median", unit: "RM/month", sourceKey: "income", higherIsWorse: false },
  { id: "poverty", label: "Absolute poverty rate", file: "socioeconomic_state.json", field: "poverty_absolute", unit: "%", sourceKey: "poverty", higherIsWorse: true },
  { id: "gini", label: "Gini coefficient", file: "socioeconomic_state.json", field: "gini", unit: "index (0-1)", sourceKey: "gini", higherIsWorse: true },
  { id: "staff_det", label: "Healthcare staff availability", file: "healthcare_access_state.json", field: "staff_per_100k", unit: "per 100,000 population", sourceKey: "healthcare_staff", higherIsWorse: false },
  { id: "beds_det", label: "Hospital bed availability", file: "healthcare_access_state.json", field: "beds_per_100k", unit: "per 100,000 population", sourceKey: "hospital_beds", higherIsWorse: false },
  // The following are neutral demographic/civic-participation determinants —
  // higherIsWorse is set to false as a non-judgemental default (there is no
  // "more disadvantaged" direction for e.g. marriage rate), not an equity claim.
  { id: "sanitation_det", label: "Basic sanitation access", file: "sanitation_access_state.json", field: "sanitation_access_pct", unit: "%", sourceKey: "sanitation", higherIsWorse: false },
  { id: "water_det", label: "Basic water access (overall)", file: "water_access_state.json", field: "water_access_pct", unit: "%", sourceKey: "water", higherIsWorse: false, filter: (r) => r.strata === "overall" },
  { id: "water_urban_det", label: "Basic water access (urban)", file: "water_access_state.json", field: "water_access_pct", unit: "%", sourceKey: "water", higherIsWorse: false, filter: (r) => r.strata === "urban" },
  { id: "water_rural_det", label: "Basic water access (rural)", file: "water_access_state.json", field: "water_access_pct", unit: "%", sourceKey: "water", higherIsWorse: false, filter: (r) => r.strata === "rural" },
  { id: "marriage_rate_det", label: "Marriage rate (female population)", file: "marriages_state.json", field: "marriage_rate_per_1000", unit: "per 1,000 population", sourceKey: "marriages", higherIsWorse: false, filter: (r) => r.sex === "female" },
  { id: "marriage_rate_male_det", label: "Marriage rate (male population)", file: "marriages_state.json", field: "marriage_rate_per_1000", unit: "per 1,000 population", sourceKey: "marriages", higherIsWorse: false, filter: (r) => r.sex === "male" },
  { id: "tfr_det", label: "Total fertility rate", file: "fertility_state.json", field: "fertility_rate", unit: "births per woman", sourceKey: "fertility", higherIsWorse: false, filter: (r) => r.age_group === "tfr" },
  // Age-specific fertility rate (ASFR) by state, one determinant per DOSM's
  // 5-year age band — on a different scale from TFR above (births per 1,000
  // women in the band, not births per woman overall), so kept as separate
  // selectable determinants rather than folded into the TFR one.
  { id: "asfr_15_19_det", label: "Fertility rate, age 15-19", file: "fertility_state.json", field: "fertility_rate", unit: "per 1,000 women", sourceKey: "fertility", higherIsWorse: false, filter: (r) => r.age_group === "15-19" },
  { id: "asfr_20_24_det", label: "Fertility rate, age 20-24", file: "fertility_state.json", field: "fertility_rate", unit: "per 1,000 women", sourceKey: "fertility", higherIsWorse: false, filter: (r) => r.age_group === "20-24" },
  { id: "asfr_25_29_det", label: "Fertility rate, age 25-29", file: "fertility_state.json", field: "fertility_rate", unit: "per 1,000 women", sourceKey: "fertility", higherIsWorse: false, filter: (r) => r.age_group === "25-29" },
  { id: "asfr_30_34_det", label: "Fertility rate, age 30-34", file: "fertility_state.json", field: "fertility_rate", unit: "per 1,000 women", sourceKey: "fertility", higherIsWorse: false, filter: (r) => r.age_group === "30-34" },
  { id: "asfr_35_39_det", label: "Fertility rate, age 35-39", file: "fertility_state.json", field: "fertility_rate", unit: "per 1,000 women", sourceKey: "fertility", higherIsWorse: false, filter: (r) => r.age_group === "35-39" },
  { id: "asfr_40_44_det", label: "Fertility rate, age 40-44", file: "fertility_state.json", field: "fertility_rate", unit: "per 1,000 women", sourceKey: "fertility", higherIsWorse: false, filter: (r) => r.age_group === "40-44" },
  { id: "asfr_45_49_det", label: "Fertility rate, age 45-49", file: "fertility_state.json", field: "fertility_rate", unit: "per 1,000 women", sourceKey: "fertility", higherIsWorse: false, filter: (r) => r.age_group === "45-49" },
  { id: "blood_donations_det", label: "Blood donations", file: "health_programmes_state.json", field: "blood_donations_abs", unit: "donations", sourceKey: "health_programmes", higherIsWorse: false },
  { id: "organ_pledges_det", label: "Organ pledges", file: "health_programmes_state.json", field: "organ_pledges_abs", unit: "pledges", sourceKey: "health_programmes", higherIsWorse: false },
  { id: "pekab40_det", label: "PeKa B40 screenings", file: "health_programmes_state.json", field: "pekab40_screenings_abs", unit: "screenings", sourceKey: "health_programmes", higherIsWorse: false },
  // Environment (added 2026-08-17) — state-level only; air pollution, GHG
  // emissions, river basin pollution and electricity flow are national-only
  // in the source and so live as trend context on the Environment page
  // instead of here (see build_environment_national() in transform_data.py).
  { id: "forest_det", label: "Permanent forest reserve area", file: "forest_reserve_state.json", field: "area_hectares", unit: "hectares", sourceKey: "forest_reserve", higherIsWorse: false },
  { id: "water_consumption_domestic_det", label: "Domestic water consumption", file: "water_consumption_state.json", field: "consumption_mld", unit: "MLD (annual mean of monthly rates)", sourceKey: "water_utilities", higherIsWorse: false, filter: (r) => r.sector === "domestic" },
  { id: "water_consumption_nondomestic_det", label: "Non-domestic water consumption", file: "water_consumption_state.json", field: "consumption_mld", unit: "MLD (annual mean of monthly rates)", sourceKey: "water_utilities", higherIsWorse: false, filter: (r) => r.sector === "nondomestic" },
  { id: "water_production_det", label: "Water production", file: "water_production_state.json", field: "production_mld", unit: "MLD (annual mean of monthly rates)", sourceKey: "water_utilities", higherIsWorse: false },
];
