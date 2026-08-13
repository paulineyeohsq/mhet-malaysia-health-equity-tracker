/**
 * Rule-based lookup: observed condition -> illustrative technology
 * categories. Deliberately a plain table, never inferred or generated —
 * this is what makes "never AI-first" true by construction here. The
 * mapping goes HEALTH NEED -> POSSIBLE TECHNOLOGY, never the reverse.
 * Every entry is labeled illustrative, not a recommendation or endorsement
 * of any specific vendor or solution.
 */

export interface TechOpportunity {
  category: string;
  description: string;
}

export interface TechMappingRule {
  condition: string;
  opportunities: TechOpportunity[];
}

const RULES: TechMappingRule[] = [
  {
    condition: "Low healthcare staff or hospital-bed availability (per 100,000 population)",
    opportunities: [
      { category: "Telehealth", description: "Remote consultation to extend limited clinical workforce reach." },
      { category: "Healthcare accessibility tools", description: "Transport/referral coordination for underserved areas." },
      { category: "Mobile health applications", description: "Mobile screening or outreach clinics for low-infrastructure areas." },
    ],
  },
  {
    condition: "High maternal or infant/under-5 mortality rate",
    opportunities: [
      { category: "Remote monitoring", description: "Antenatal/postnatal remote monitoring tools." },
      { category: "Health education", description: "Maternal and child health education delivery." },
      { category: "Screening tools", description: "Point-of-care screening for high-risk pregnancies." },
    ],
  },
  {
    condition: "High crude death rate or chronic-disease-relevant outcome",
    opportunities: [
      { category: "Remote monitoring", description: "Wearable/remote monitoring for chronic condition follow-up." },
      { category: "Digital adherence support", description: "Medication/appointment adherence tools." },
      { category: "Clinical decision support", description: "Risk-stratification tools to prioritise limited clinical capacity." },
    ],
  },
  {
    condition: "High HIV/STD incidence",
    opportunities: [
      { category: "Screening tools", description: "Point-of-care or self-testing screening technology." },
      { category: "Health education", description: "Targeted digital health education and outreach." },
      { category: "Telehealth", description: "Confidential remote consultation and referral pathways." },
    ],
  },
  {
    condition: "High socioeconomic disadvantage (poverty rate) alongside a health-access gap",
    opportunities: [
      { category: "Resource allocation tools", description: "Data tools to support equitable resource distribution decisions." },
      { category: "Mobile health applications", description: "Low-cost/offline-capable tools for low-connectivity, low-income areas." },
    ],
  },
  {
    condition: "District-level data not available for this outcome",
    opportunities: [
      { category: "AI-assisted analysis", description: "Only where a genuine data-quality/measurement gap is the identified need — analysis tools to make better use of whatever local data exists, not a substitute for collecting it." },
    ],
  },
];

/**
 * Given real flags derived from the user's current selection (not inferred
 * — the caller decides which conditions are true from real computed
 * values), return the matching rows. No condition is invented; if nothing
 * matches, an empty array is returned rather than a generic fallback.
 */
export function matchTechOpportunities(flags: {
  lowHealthcareAccess?: boolean;
  highMaternalOrChildMortality?: boolean;
  highDeathRateOrChronicBurden?: boolean;
  highStdIncidence?: boolean;
  highPovertyWithAccessGap?: boolean;
  districtDataUnavailable?: boolean;
}): TechMappingRule[] {
  const matched: TechMappingRule[] = [];
  if (flags.lowHealthcareAccess) matched.push(RULES[0]);
  if (flags.highMaternalOrChildMortality) matched.push(RULES[1]);
  if (flags.highDeathRateOrChronicBurden) matched.push(RULES[2]);
  if (flags.highStdIncidence) matched.push(RULES[3]);
  if (flags.highPovertyWithAccessGap) matched.push(RULES[4]);
  if (flags.districtDataUnavailable) matched.push(RULES[5]);
  return matched;
}
