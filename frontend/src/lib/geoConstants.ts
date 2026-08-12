export const MALAYSIA_STATES = [
  "Johor", "Kedah", "Kelantan", "Melaka", "Negeri Sembilan", "Pahang",
  "Perak", "Perlis", "Pulau Pinang", "Sabah", "Sarawak", "Selangor",
  "Terengganu", "W.P. Kuala Lumpur", "W.P. Labuan", "W.P. Putrajaya",
];

/** Regional grouping used only for the Overview page's equity-gap tiles — a
 * dashboard-defined geographic split, not an official DOSM statistical category. */
export const EAST_MALAYSIA_STATES = ["Sabah", "Sarawak", "W.P. Labuan"];
export const PENINSULAR_STATES = MALAYSIA_STATES.filter((s) => !EAST_MALAYSIA_STATES.includes(s));
