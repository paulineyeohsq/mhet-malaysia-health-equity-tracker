import type { SOURCES } from "./sources";

export interface FieldDef {
  id: string;
  label: string;
  file: "health_outcomes_state.json" | "healthcare_access_state.json" | "socioeconomic_state.json";
  field: string;
  unit: string;
  sourceKey: keyof typeof SOURCES;
  /** true if a higher value reflects greater disadvantage (used for research-question phrasing). */
  higherIsWorse: boolean;
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
];
