/**
 * Plain-language definitions for jargon used across the dashboard's charts,
 * KPI tiles and headings. Wording is kept consistent with (and shorter than)
 * the full explanations on the Methodology page, section 6/7 — this is a
 * quick-reference layer for someone hovering a term mid-chart, not a
 * replacement for that page. Each definition also anchors to a matching
 * <dt id="glossary-{id}"> entry on Methodology.tsx#m-glossary.
 */
export interface GlossaryEntry {
  id: string;
  term: string;
  definition: string;
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  ratio: {
    id: "ratio",
    term: "Ratio (×)",
    definition:
      "The highest state's value divided by the lowest state's value. A 3× ratio means the highest state's rate is three times the lowest state's rate. It is not adjusted for population size, age structure or any other factor.",
  },
  rii: {
    id: "rii",
    term: "RII (Relative Index of Inequality)",
    definition:
      "A regression-based summary of a health gap across the full range of a socioeconomic ranking (e.g. income), not just the two extreme states. More statistically informative than a simple ratio, but only shown where the underlying data meets minimum sample-size and coverage assumptions.",
  },
  sii: {
    id: "sii",
    term: "SII (Slope Index of Inequality)",
    definition:
      "The absolute-scale counterpart to RII: the modelled difference in a health outcome between the very top and very bottom of a socioeconomic ranking, based on a population-weighted regression across all states, not just the two extremes.",
  },
  "concentration-index": {
    id: "concentration-index",
    term: "Concentration Index",
    definition:
      "A single number summarising how unevenly a health outcome is distributed across a socioeconomic ranking (e.g. income). Zero means no association with rank; further from zero means the outcome is more concentrated among higher- or lower-ranked states.",
  },
  "age-standardised": {
    id: "age-standardised",
    term: "Age-standardised",
    definition:
      "Adjusted so states with older or younger populations can be compared fairly. Age-standardised and crude (unadjusted) figures for the same indicator are not directly comparable to each other, and this dashboard never blends the two.",
  },
  "crude-prevalence": {
    id: "crude-prevalence",
    term: "Crude prevalence",
    definition:
      "The raw, unadjusted share of a population with a condition, with no correction for age structure. Two states with the same crude prevalence can have very different underlying risk if their populations differ in age.",
  },
  gini: {
    id: "gini",
    term: "Gini coefficient",
    definition:
      "A standard measure of income inequality within a population, from 0 (everyone has equal income) to 1 (one person has all the income). Sourced directly from DOSM's Household Income and Expenditure Survey.",
  },
  "poverty-absolute": {
    id: "poverty-absolute",
    term: "Absolute poverty rate",
    definition:
      "Share of households below Malaysia's official Poverty Line Income (PLI) — a fixed cost-of-basic-needs threshold. Not the same as relative poverty, and not fully comparable before/after DOSM's 2019 PLI methodology revision.",
  },
  "poverty-relative": {
    id: "poverty-relative",
    term: "Relative poverty rate",
    definition:
      "Share of households below 50% of the national median household income — a threshold that moves with the overall income distribution, unlike the fixed absolute poverty line.",
  },
  nhms: {
    id: "nhms",
    term: "NHMS",
    definition:
      "National Health and Morbidity Survey — Malaysia's periodic household health survey (run by MOH's Institute for Public Health), the source for self-reported and measured conditions like diabetes, hypertension and mental-health indicators shown on this dashboard.",
  },
  dosm: {
    id: "dosm",
    term: "DOSM",
    definition: "Department of Statistics Malaysia — the source of income, poverty, population and census data on this dashboard.",
  },
  ecological: {
    id: "ecological",
    term: "Ecological association",
    definition:
      "A statistical relationship measured at the level of a group (a state or district in a given year), not an individual. It says states with a higher value of X also tend to have a higher value of Y — it says nothing about any individual resident, and is not a causal claim.",
  },
  "small-count": {
    id: "small-count",
    term: "Small-count caution",
    definition:
      "This rate is built on fewer than 10 recorded events. Rates from small counts swing sharply from year to year or state to state and should be read as noisy, not as a precise estimate.",
  },
};

export type GlossaryTermId = keyof typeof GLOSSARY;
