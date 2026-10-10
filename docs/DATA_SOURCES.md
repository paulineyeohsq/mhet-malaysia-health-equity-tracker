# Data Sources

This is the human-readable companion to the machine-readable catalogue at
[`data/inventory/dataset_inventory.json`](../data/inventory/dataset_inventory.json).
That file documents every dataset examined during the Phase 1/2 audit of
[data.gov.my](https://data.gov.my/data-catalogue): **<!--count:ingested-->55<!--/count--> datasets with
`status: ingested`** have raw files under `data/raw/` and processed outputs
under `data/processed/` (produced by `scripts/transform_data.py`), plus
**<!--count:reference-->1<!--/count--> dataset ingested for cross-validation only** (`hies_2019_snapshot`, not
loaded into the dashboard). (These counts are rewritten from the inventory by `scripts/update_database.py` on every
successful run.)

`scripts/ingest_data.py` fetches every ingested dataset directly from its real
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
- **Date range:** 2016–2024 · **Geographic resolution:** district · **Update frequency:** ~biennial
- % of households with piped water, sanitary latrines, and electricity, by state and district.
- **Limitations:** Ingested for every year the publisher holds (2016–2024) and joined to the district income/poverty rows for 2019, 2022 and 2024. A few remote Sabah/Sarawak districts (e.g. Kalabakan) have null electricity/piped-water values in the source itself.

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
- **Date range:** Full series 1970–2026; this build keeps 2020–2026 (overall age/ethnicity, by sex) · **Geographic resolution:** state · **Update frequency:** Annual
- DOSM intercensal population estimates by state, sex, age band and ethnicity — used as the denominator for per-100,000 healthcare access rates.
- **Limitations:** Full dataset also has 5-year age bands and 7 ethnicity categories; only "overall age" × "overall ethnicity" × sex is used, and only 2020 onward is kept, because of the raw file's size (about 40 MB with every age/ethnicity combination). Ingested from DOSM's own CSV; the data.gov.my API copy of this dataset stops at 2023.

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

### Public Health Clinics by State and District
- **URL:** https://github.com/MoH-Malaysia/data-resources-public (file `facilities_master.csv`)
- **Source org:** Ministry of Health Malaysia
- **Date range:** one snapshot, as registered on 31 December 2025 (stated in the registry's README) · **Geographic resolution:** state and district · **Update frequency:** not stated
- MOH's registry of public health facilities, one row per facility. The dashboard counts clinics by type (health clinics, rural clinics, community clinics, maternal and child health clinics, dental clinics) and gives a per-100,000 rate using DOSM's population estimate for the same year. Added 2026-10-10.
- **Limitations:** public sector only (private clinics are not in it); it counts facilities, not capacity; a single snapshot; not in the data.gov.my catalogue (a GitHub file). The repository carries no licence file; its README asks for attribution to the Ministry of Health Malaysia.

### NHMS 2025 Volume 2: Older Persons Health Findings
- **URL:** https://iku.nih.gov.my/nhms2025 (report PDF `nhms-2025-volume-2.pdf`, posted September 2026)
- **Source org:** Institute for Public Health, National Institutes of Health, Ministry of Health Malaysia
- **Date range:** 2025 · **Geographic resolution:** national only · **Update frequency:** per survey cycle
- 19 prevalence tables for people aged 60 and over (ageing well, cognition, dementia, depression, daily-living limitations, falls, vision and hearing, activity and sleep, raised blood glucose / pressure / cholesterol overall, known and undiagnosed, sarcopenia, frailty), each by location, sex, age group, ethnicity, marital status, education, occupation and household income. Read from the PDF by `scripts/nhms_pdf.py` (`pdftotext -raw`); each table must add up to its own totals or the update stops. Added 2026-10-10.
- **Limitations:** national only (no state breakdown is published); one survey year; "probable" conditions are screening results. No open licence or reuse terms were found; the NIH site states copyright.

### Life Expectancy at Birth by State, Sex & Ethnicity
- **URL:** https://open.dosm.gov.my/dashboard/life-expectancy
- **Source org:** DOSM (Abridged Life Tables)
- **Date range:** 1957–2025 national; 2025 only for states · **Geographic resolution:** state (latest year) and national · **Update frequency:** Annual (the dashboard names 2026-09-30 as the next release)
- Life expectancy at birth for every state by sex, and a national series by sex and ethnic group. Added 2026-10-09; this replaces the earlier "identified but not ingested" entry for it.
- **How it is fetched:** DOSM publishes this only as a dashboard, with no data-catalogue CSV or API entry. `scripts/ingest_data.py` (method `dosm_dashboard`) reads the JSON the dashboard page renders from and checks its shape strictly. If DOSM restructures the page the fetch fails, the previous file stays, and the weekly workflow raises its normal issue; wrong values are never published. Because it is not a catalogue dataset, the "check for newer data" button cannot compare it with the publisher cheaply; the weekly refresh picks up a new release.
- **Limitations:** State figures are for one year only (no state history, no confidence intervals). Life expectancy is a life-table result, so it is never pooled across Selangor / Kuala Lumpur / Putrajaya. The non-citizen group's figure depends on who is counted in it and should not be read as a health advantage.

---

## Geographic (base layer, used by all domains above)

Boundary data is listed once, under Healthcare Resources above
(`administrative_boundaries`), since that is where it appears in the
inventory JSON — it underpins the choropleth map and `geo_lookup.csv` used
across every page.

---

## Datasets that could not be added

These are no longer listed on the dashboard (its Data Gaps page covers the limitations of the data it has). They are
tracked in [`DATA_BACKLOG.md`](DATA_BACKLOG.md) with the source, why each could not be added under the project's rules
(official source, machine-readable or reliably read by the pipeline, nothing typed in) and how the weekly run watches
for them.

---

## Confirmed unavailable as open data (as of 2026-08-13; two entries updated 2026-10-09)

Unlike the datasets above — which exist and are simply not yet ingested —
these were searched for specifically and **could not be found** in either
[OpenDOSM's catalogue](https://open.dosm.gov.my/data-catalogue) or
[data.gov.my's MOH catalogue](https://data.gov.my/data-catalogue?source=MOH).
Closing these gaps isn't an ingestion task; it needs either a new open
dataset to be published, or a formal data-sharing request to the source
agency.

- **UPDATE 2026-10-09 (partly out of date): state-level NCD/diabetes prevalence.** The NHMS 2019 state-level tables
  have since been extracted and are in the dashboard (`nhms_ncd`); the 2011 report could not be extracted reliably
  and the 2025 older-persons survey has only a national fact sheet (both on the Data Gaps page). District-level
  prevalence is still unavailable. The original note follows.
- **NCD/diabetes prevalence, by state or district.** MOH's open catalogue
  was checked category-by-category (General Health, Healthcare
  Infrastructure, Healthcare Programs, Infectious Diseases, Regulation,
  Healthcare Accounts) — no diabetes, NCD, or chronic-disease-prevalence
  dataset exists there. NHMS (National Health and Morbidity Survey), the
  usual source for this figure, is not published as open microdata or an
  open aggregate table. **Path forward:** a formal data request to MOH's
  NHMS unit, or watch data.gov.my for a future release.
- **UPDATE 2026-10-09 (partly out of date): district-level health outcomes.** District deaths and births by sex
  (2020 onward) are now ingested (`deaths_district_sex`, `births_district_sex`). Morbidity at district level is still
  unavailable. The original note follows.
- **District-level health outcomes** (mortality, morbidity beyond the
  latest-year hospital-beds snapshot already ingested). Not
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
