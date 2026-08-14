# Data Sources

This is the human-readable companion to the machine-readable catalogue at
[`data/inventory/dataset_inventory.json`](../data/inventory/dataset_inventory.json).
That file documents every dataset examined during the Phase 1/2 audit of
[data.gov.my](https://data.gov.my/data-catalogue): **24 datasets with
`status: ingested`** have raw files under `data/raw/` and processed outputs
under `data/processed/` (produced by `scripts/transform_data.py`), plus
**1 dataset ingested for cross-validation only** (`hies_2019_snapshot`, not
loaded into the dashboard), and **9 datasets identified and schema-verified
but not yet ingested** into this build.

`scripts/ingest_data.py` can fetch every ingested dataset (and could be
extended to fetch the not-yet-ingested ones) directly from its real
endpoint, listed below, when run in an environment with normal outbound
internet access.

---

## Socioeconomic (Department of Statistics Malaysia — HIES)

All from the Household Income and Expenditure Survey (HIES), an irregular
(not annual) DOSM survey.

### Household Income (Malaysia)
- **URL:** https://data.gov.my/data-catalogue/hh_income
- **Source org:** DOSM
- **Date range:** 1970–2024 · **Geographic resolution:** national · **Update frequency:** Irregular (HIES survey years); last updated 2025-12-31
- Mean and median monthly gross household income, Malaysia.
- **Limitations:** 1970–1974 Peninsular Malaysia only; Sabah/Sarawak from 1976; citizens only from 1989. Survey years are irregular, not annual.

### Household Income by State
- **URL:** https://data.gov.my/data-catalogue/hh_income_state
- **Source org:** DOSM
- **Date range:** 1970–2024 (state coverage begins 1976 for Sabah/Sarawak) · **Geographic resolution:** state · **Update frequency:** Irregular (HIES years)
- Mean/median household income by state.
- **Limitations:** Same survey-year irregularity as the national series.

### Household Income by District
- **URL:** https://data.gov.my/data-catalogue/hh_income_district
- **Source org:** DOSM
- **Date range:** 2019, 2022, 2024 only · **Geographic resolution:** district (160 districts) · **Update frequency:** Irregular
- Mean/median household income by administrative district — the highest-resolution income indicator available.
- **Limitations:** Only 3 cross-sectional years, not a continuous series; do not interpolate between them.

### Poverty Rate (Malaysia)
- **URL:** https://data.gov.my/data-catalogue/hh_poverty
- **Source org:** DOSM
- **Date range:** 1970–2024 · **Geographic resolution:** national · **Update frequency:** Irregular
- Absolute, hardcore and relative poverty rates, national.
- **Limitations:** Definitions of the Poverty Line Income have been revised over time by DOSM; pre/post-2019 PLI methodology differs — treat pre- and post-2019 absolute poverty rates as not fully comparable.

### Poverty Rate by State
- **URL:** https://data.gov.my/data-catalogue/hh_poverty_state
- **Source org:** DOSM
- **Date range:** 1970–2024 · **Geographic resolution:** state · **Update frequency:** Irregular
- Poverty rates by state.
- **Limitations:** Same PLI methodology caveat as the national poverty dataset.

### Poverty Rate by District
- **URL:** https://data.gov.my/data-catalogue/hh_poverty_district
- **Source org:** DOSM
- **Date range:** 2019, 2022, 2024 · **Geographic resolution:** district · **Update frequency:** Irregular
- Absolute & relative poverty rate by district — highest-resolution poverty indicator available.
- **Limitations:** Cross-sectional years only; hardcore poverty not published at district level.

### Gini Coefficient (Malaysia)
- **URL:** https://data.gov.my/data-catalogue/hh_inequality
- **Source org:** DOSM
- **Date range:** 1970–2024 · **Geographic resolution:** national · **Update frequency:** Irregular
- National Gini coefficient of gross household income.
- **Limitations:** Based on gross income before tax/transfers.

### Gini Coefficient by State
- **URL:** https://data.gov.my/data-catalogue/hh_inequality_state
- **Source org:** DOSM
- **Date range:** 1974–2024 · **Geographic resolution:** state · **Update frequency:** Irregular
- Gini coefficient by state.
- **Limitations:** Gross income basis (Sabah/Sarawak from 1979; Federal Territories from 2007).

### Gini Coefficient by District
- **URL:** https://data.gov.my/data-catalogue/hh_inequality_district
- **Source org:** DOSM
- **Date range:** 2019, 2022, 2024 · **Geographic resolution:** district · **Update frequency:** Irregular
- Gini coefficient by district.
- **Limitations:** Cross-sectional years only.

### Access to Basic Amenities by State & District
- **URL:** https://data.gov.my/data-catalogue/hh_access_amenities
- **Source org:** DOSM (from HIES)
- **Date range:** 2022 ingested (dataset covers 2016–2024) · **Geographic resolution:** district · **Update frequency:** ~biennial
- % of households with piped water, sanitary latrines, and electricity, by state and district.
- **Limitations:** Only the 2022 cross-section was ingested in this build; 2016/2018/2020/2024 exist upstream and can be pulled by re-running `ingest_data.py`. A few remote Sabah/Sarawak districts (e.g. Kalabakan) have null electricity/piped-water values in the source itself.

### HIES 2019 State Snapshot (DOSM GitHub mirror) — *cross-validation reference only*
- **URL:** https://github.com/dosm-malaysia/data-open/tree/main/datasets/economy
- **Source org:** DOSM (official GitHub open-data mirror)
- **Date range:** 2019 · **Geographic resolution:** state · **Update frequency:** static
- Income, expenditure, gini and poverty rate by state, 2019, from DOSM's own published GitHub mirror.
- **Status:** `ingested_reference_only` — used only to sanity-check the API-sourced state-level income/poverty/gini figures for 2019; not loaded into the dashboard directly.
- **Limitations:** Single year, state-level only.

---

## Demography / Population

### Population Table: States
- **URL:** https://data.gov.my/data-catalogue/population_state
- **Source org:** DOSM
- **Date range:** Full series 1970–2026; this build ingested 2020–2023 (overall age/ethnicity, by sex) · **Geographic resolution:** state · **Update frequency:** Annual
- DOSM intercensal population estimates by state, sex, age band and ethnicity — used as the denominator for per-100,000 healthcare access rates.
- **Limitations:** Full dataset also has 5-year age bands and 7 ethnicity categories; only "overall age" × "overall ethnicity" × sex was ingested in this build due to the raw file's size.

### Census District Table (DOSM data-open GitHub mirror)
- **URL:** https://github.com/dosm-malaysia/data-open/tree/main/datasets/census
- **Source org:** DOSM (official GitHub open-data mirror)
- **Date range:** 1970–2020 · **Geographic resolution:** district · **Update frequency:** per census cycle
- Historical census population by district, sex, ethnicity and broad age band, decennial + intercensal.
- **Limitations:** Only census years (1970, 1980, 1991, 2000, 2010, 2020) plus a few intercensal points — not annual. Stops at 2020. Many fields blank for pre-1991 census rounds (not all questions asked every census).

---

## Healthcare Resources

### Hospital Beds by State and Hospital Type
- **URL:** https://data.gov.my/data-catalogue/hospital_beds
- **Source org:** Ministry of Health Malaysia
- **Date range:** National/state series 2015–2022 ingested in full; district-level ingested for 2022 only · **Geographic resolution:** district · **Update frequency:** Annual
- Public + non-MOH hospital bed counts, national/state/district, by facility type.
- **Limitations:** District-level series only ingested for 2022 (most recent year) in this build; full 2015–2022 district panel can be pulled by re-running `ingest_data.py` in an unrestricted network environment.

### Healthcare Staff by State and Staff Type
- **URL:** https://data.gov.my/data-catalogue/healthcare_staff
- **Source org:** Ministry of Health Malaysia
- **Date range:** 2014–2022 · **Geographic resolution:** state · **Update frequency:** Annual
- Public-sector healthcare workforce (doctors, dentists, nurses, community nurses), national + state.
- **Limitations:** Public sector only — excludes private-sector doctors/nurses, which are a significant share of urban healthcare capacity.

### DOSM Administrative Boundaries (state & district GeoJSON)
- **URL:** https://github.com/dosm-malaysia/data-open/tree/main/datasets/geodata
- **Source org:** DOSM (official GitHub open-data mirror)
- **Date range:** current boundaries · **Geographic resolution:** state, district · **Update frequency:** static
- Official DOSM state and district administrative boundary polygons — used for the interactive choropleth map and to compute centroid coordinates for the geo lookup table.
- **Limitations:** Boundaries reflect the file's publication date; not guaranteed to match the very latest gazette changes.

---

## Health Outcomes

### Annual Deaths by State
- **URL:** https://data.gov.my/data-catalogue/deaths_state
- **Source org:** National Registration Department / DOSM
- **Date range:** 2000–2022 · **Geographic resolution:** state · **Update frequency:** Annual
- Crude death counts and rate by state of usual residence.
- **Limitations:** State = deceased's usual residence, not place of death.

### Annual Maternal Deaths by State
- **URL:** https://data.gov.my/data-catalogue/deaths_maternal_state
- **Source org:** National Registration Department / DOSM
- **Date range:** 2000–2022 · **Geographic resolution:** state · **Update frequency:** Annual
- Maternal death counts and rate per 100,000 live births, by state.
- **Limitations:** Small annual counts per state → rates are volatile year-to-year for smaller states; treat single-year state comparisons cautiously.

### Annual Early Childhood Deaths by State
- **URL:** https://data.gov.my/data-catalogue/deaths_early_childhood_state
- **Source org:** National Registration Department / DOSM
- **Date range:** 2000–2022 · **Geographic resolution:** state · **Update frequency:** Annual
- Perinatal, neonatal, infant, toddler and total under-5 death counts/rates, by state.
- **Limitations:** Rate denominator differs by sub-type (per-1,000-live-births for infant/neonatal/perinatal; per-1,000-population for toddler) — do not compare rates across types directly.

### Annual Live Births by State
- **URL:** https://data.gov.my/data-catalogue/births_annual_state
- **Source org:** National Registration Department / DOSM
- **Date range:** 2000–2022 · **Geographic resolution:** state · **Update frequency:** Annual
- Live birth counts and crude birth rate by state — the denominator for maternal/infant mortality rates.
- **Limitations:** State = mother's usual residence, not place of birth.

### Infant Immunisation Coverage
- **URL:** https://data.gov.my/data-catalogue/infant_immunisation
- **Source org:** Ministry of Health Malaysia
- **Date range:** 2000–2023 · **Geographic resolution:** national · **Update frequency:** Annual
- Annual coverage rate for measles/MMR, DPT, Hepatitis B, polio.
- **Limitations:** National level only — no state/district breakdown available from data.gov.my. Coverage can exceed 100% because it is aggregated-count-based, not individual-linked.

### Nutritional Status of Children Under 5 by Sex
- **URL:** https://data.gov.my/data-catalogue/nutrition_children_sex
- **Source org:** Ministry of Health Malaysia (National Health & Morbidity Survey)
- **Date range:** 2019 only · **Geographic resolution:** national · **Update frequency:** per NHMS cycle (irregular)
- WHO-standard WAZ/HAZ/WHZ distribution (underweight/stunting/wasting/overweight prevalence) for under-5 children.
- **Limitations:** Single cross-sectional year (2019); no state/district or ethnicity breakdown from this source.

### Sexually Transmitted Diseases by State
- **URL:** https://data.gov.my/data-catalogue/std_state
- **Source org:** Ministry of Health Malaysia
- **Date range:** 2017–2022 · **Geographic resolution:** state · **Update frequency:** Annual
- Case counts and incidence (per 100,000) for HIV, AIDS, syphilis, gonorrhea, chancroid, by state.
- **Limitations:** Reported/diagnosed cases only — true incidence, especially for HIV/AIDS, is understated due to under-testing; comparisons across states may partly reflect differences in testing access rather than true incidence.

### HIV Incidence per 1,000 Uninfected Population (SDG 3.3.1)
- **URL:** https://open.dosm.gov.my/data-catalogue/sdg_03-3-1
- **Source org:** Ministry of Health Malaysia
- **Date range:** 2016–2022 · **Geographic resolution:** national · **Update frequency:** Annual
- New HIV infections per 1,000 uninfected population, by sex — a methodologically cleaner metric than std_state's crude diagnosed-case counts (added 2026-08-14, after a coverage re-audit found it live on OpenDOSM).
- **Limitations:** National only, no state or district breakdown. Complements but does not replace std_state.

### Annual Stillbirths by State
- **URL:** https://open.dosm.gov.my/data-catalogue/stillbirths_state
- **Source org:** National Registration Department / DOSM
- **Date range:** 2000–2024 · **Geographic resolution:** state · **Update frequency:** Annual
- Stillbirth counts and rate (per 1,000 total births) by state — a genuinely new indicator this project didn't previously track (added 2026-08-14).
- **Limitations:** None specific beyond the standard state-of-usual-residence caveat shared with the other vital-statistics tables above.

### Annual Deaths by State, Sex & Ethnicity
- **URL:** https://open.dosm.gov.my/data-catalogue/deaths_sex_ethnic_state
- **Source org:** National Registration Department / DOSM
- **Date range:** 2000–2024 · **Geographic resolution:** state · **Update frequency:** Annual
- Death counts by state, sex, and ethnicity (Malay, other Bumiputera, Chinese, Indian, other citizen, non-citizen, plus DOSM's own "overall" cross-check total). Added 2026-08-14 — see the "Confirmed unavailable" section below for why this supersedes an earlier, now-outdated finding that no such dataset existed.
- **Limitations:** Absolute counts only, no published per-ethnicity-group death rate — this project has no state-level population-by-ethnicity dataset to compute one against (only the district-level population tables have an ethnicity breakdown). Shown in the dashboard as raw counts with an explicit non-rate caveat, not as a per-capita comparison. The "overall" ethnicity value is DOSM's own cross-check total, not a distinct group.

### Annual Deaths by District & Sex
- **URL:** https://open.dosm.gov.my/data-catalogue/deaths_district_sex
- **Source org:** National Registration Department / DOSM
- **Date range:** 2020–2024 · **Geographic resolution:** district · **Update frequency:** Annual
- District-resolution upgrade of "Annual Deaths by State" above (added 2026-08-14) — death counts and rate by district and sex.
- **Limitations:** Shorter time range (2020–2024) than the state-level series (2000–2022) — a resolution upgrade, not a full historical replacement.

### Annual Live Births by District & Sex
- **URL:** https://open.dosm.gov.my/data-catalogue/births_district_sex
- **Source org:** National Registration Department / DOSM
- **Date range:** 2020–2024 · **Geographic resolution:** district · **Update frequency:** Annual
- District-resolution upgrade of "Annual Live Births by State" above (added 2026-08-14) — live birth counts and rate by district and sex.
- **Limitations:** Shorter time range (2020–2024) than the state-level series — a resolution upgrade, not a full historical replacement.

---

## Geographic (base layer, used by all domains above)

Boundary data is listed once, under Healthcare Resources above
(`administrative_boundaries`), since that is where it appears in the
inventory JSON — it underpins the choropleth map and `geo_lookup.csv` used
across every page.

---

## Identified but not yet ingested (out of scope for this build)

These datasets were confirmed to exist — URL and schema verified — but were
deliberately not pulled into this build. This is a scope decision, not a
data gap discovered by accident; `scripts/ingest_data.py` can fetch them
directly once run in an environment with normal, unrestricted internet
access.

| Dataset | Reason not ingested |
|---|---|
| **Population by Parliamentary Constituency** (`population_parlimen`) | Different geography (electoral, not administrative) — out of scope for this state/district-focused build. |
| **Population by State Legislative Assembly** (`population_dun`) | Same as above. |
| **Household Income by Percentile** (`hies_malaysia_percentile`) | Would enable a concentration-index calculation using true micro-level percentile data, but requires percentile-level micro-aggregates not yet pulled. |
| **Marriage & fertility datasets** (`marriages` / `marriages_state` / `fertility_state`) | Lower direct relevance to health equity; deferred for a future iteration. |
| **Health programme participation datasets** (`blood_donations_state` / `organ_pledges_state` / `pekab40_screenings_state`) | Daily-grain datasets requiring heavier aggregation; deferred. |
| **COVID-19 datasets** (`covid_cases` / `covid_cases_age` / `covid_deaths_linelist`) | Deferred — a distinct outbreak-analytics use case rather than chronic health-equity monitoring; can be added as a new domain without redesigning the schema. |
| **National Health Accounts / health expenditure** (`mnha` / `mnha_moh`) | Valuable for a future "healthcare financing equity" domain; deferred. |
| **Standalone amenities time series** (state-level long series: `sanitation_access` / `electricity_access` / `water_access`) | The district-level 2022 `hh_access_amenities` snapshot was prioritised instead since it matches the geographic resolution of the income/poverty/gini district series; these longer state-level series remain available for a future time-series amenities view. |
| **Full district population by sex/age/ethnicity, 2020–2024** (`population_district`, live series) | Raw file exceeded the sandbox's single-request fetch-size limit during this build; the historical `census_district` series (1970–2020) was used instead. Re-running `scripts/ingest_data.py` from an unrestricted network environment will pull this in full. |
| **Nutritional Status of Children Under 5 by Strata** (`nutrition_children_strata`) — confirmed to exist at `https://data.gov.my/data-catalogue/nutrition_children_strata` (MOH, urban/rural breakdown, 2019, national level) | The real urban/rural counterpart to the already-ingested `nutrition_children_sex`. Not yet ingested — would follow the exact same `transform_data.py` pattern already used for the sex-disaggregated version. This is the **only** genuine urban/rural-stratified dataset found anywhere in DOSM's or MOH's open catalogues as of 2026-08-13 (OpenDOSM's population tables are sex/age/ethnicity only, with no strata dimension; MOH's catalogue was checked category-by-category and this is the sole urban/rural entry). |

See [`docs/METHODOLOGY.md`](METHODOLOGY.md) for more on the sandbox
network/data-volume constraints referenced above.

---

## Confirmed unavailable as open data (as of 2026-08-13)

Unlike the datasets above — which exist and are simply not yet ingested —
these were searched for specifically and **could not be found** in either
[OpenDOSM's catalogue](https://open.dosm.gov.my/data-catalogue) or
[data.gov.my's MOH catalogue](https://data.gov.my/data-catalogue?source=MOH).
Closing these gaps isn't an ingestion task; it needs either a new open
dataset to be published, or a formal data-sharing request to the source
agency.

- **NCD/diabetes prevalence, by state or district.** MOH's open catalogue
  was checked category-by-category (General Health, Healthcare
  Infrastructure, Healthcare Programs, Infectious Diseases, Regulation,
  Healthcare Accounts) — no diabetes, NCD, or chronic-disease-prevalence
  dataset exists there. NHMS (National Health and Morbidity Survey), the
  usual source for this figure, is not published as open microdata or an
  open aggregate table. **Path forward:** a formal data request to MOH's
  NHMS unit, or watch data.gov.my for a future release.
- **District-level health outcomes** (mortality, morbidity beyond the
  2022-only hospital-beds/amenities snapshots already ingested). Not
  published at district resolution anywhere in MOH's or DOSM's open
  catalogues — almost certainly suppressed for small-area privacy/
  disclosure-risk reasons. **Path forward:** a formal MOH data-sharing
  request, likely requiring an ethics/IRB approval given small-cell risk.
- ~~**Ethnicity-linked health outcomes.** No dataset in either catalogue
  ever cross-tabulates ethnicity with a health/mortality/morbidity figure.~~
  **UPDATE 2026-08-14: this finding was wrong and has been corrected.**
  DOSM has since published `deaths_sex_ethnic_state` (deaths by state,
  sex, and ethnicity) — confirmed live at
  https://open.dosm.gov.my/data-catalogue/deaths_sex_ethnic_state and
  ingested into this project (see "Annual Deaths by State, Sex & Ethnicity"
  above). Whether this is a genuinely new DOSM publication or was
  simply missed during the original catalogue check is unclear; either
  way, don't treat this specific "confirmed unavailable" entry as
  reliable going forward — re-check the live catalogue before repeating
  the claim. A per-ethnicity-group *rate* (not just raw counts) still
  isn't available, since no state-level population-by-ethnicity dataset
  exists to normalise against — that narrower gap remains open.
- **Confidence intervals / margins of error** on any published aggregate
  figure. DOSM/MOH publish point estimates only in their open tables; survey
  design-effect/variance data isn't part of the open release. **Path
  forward:** would require access to HIES/NHMS microdata directly from
  DOSM/MOH (a data-access agreement, not an open download).
