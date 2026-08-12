# Data Dictionary

Field-by-field reference for every file the frontend reads. All 11 JSON
files live in `data/processed/` and are mirrored verbatim into
`frontend/public/data/` by `scripts/update_database.py`'s sync stage; the
frontend's `useData()` hook fetches them directly at runtime — nothing is
computed server-side. `geo_lookup.csv` is the shared geographic dimension
table used to join every other file to a map location.

All fields were built by `scripts/transform_data.py`. Its universal rule:
**a missing/blank source value is written as JSON `null`, never `0` and
never interpolated.** `0` only appears where the source literally recorded
zero. Null counts below were measured directly against the real files in
`data/processed/` (row counts and examples likewise).

---

## 1. `socioeconomic_national.json`

**Grain:** one row per year, Malaysia national aggregate. **Rows: 22**
(years 1970–2024, non-consecutive — HIES survey years only).
Built by `build_socioeconomic_national()`, joining
`hh_income.csv` + `hh_poverty.csv` + `hh_inequality.csv` on year.

| Field | Type | Unit | Nullability | Example |
|---|---|---|---|---|
| `year` | int | — | never null | `1970` |
| `income_mean` | number | RM/month | never null in this file | `264` |
| `income_median` | number | RM/month | never null in this file | `166` |
| `poverty_absolute` | number | % | null for 1 of 22 years | `49.3` |
| `poverty_hardcore` | number | % | null for 4 of 22 years — hardcore poverty rate not published for all early survey years | `6.9` |
| `poverty_relative` | number | % | null for 8 of 22 years — relative poverty was not published by DOSM before 1995 (per `dataset_inventory.json`'s `hh_poverty` entry) | `19.5` |
| `gini` | number | index, 0–1 | null for 1 of 22 years | `0.513` |

---

## 2. `socioeconomic_state.json`

**Grain:** one row per state per year. **Rows: 322** (16 states × HIES
years, 1970–2024). Built by `build_socioeconomic_state()`, joining
`hh_income_state.csv` + `hh_poverty_state.csv` + `hh_inequality_state.csv`
on (canonical state, year). "Malaysia" aggregate rows in the source files
are dropped here (they live in file 1 above).

| Field | Type | Unit | Nullability | Example |
|---|---|---|---|---|
| `state` | string | — | never null; one of the 16 canonical DOSM state names from `geo_utils.CANONICAL_STATES` | `"Johor"` |
| `year` | int | — | never null | `1970` |
| `income_mean` | number | RM/month | null for 3 of 322 rows | `237` |
| `income_median` | number | RM/month | null for 14 of 322 rows (e.g. not published for every state in every early survey year) | `269` |
| `poverty_absolute` | number | % | null for 14 of 322 rows | `45.7` |
| `poverty_hardcore` | number | % | null for 51 of 322 rows | `3.1` |
| `poverty_relative` | number | % | null for 105 of 322 rows — same pre-1995 non-publication as the national file, compounded by Sabah/Sarawak only reporting from 1979 and the Federal Territories only from 2007 (per `dataset_inventory.json`) | `16.1` |
| `gini` | number | index, 0–1 | null for 33 of 322 rows | `0.439` |

---

## 3. `socioeconomic_district.json`

**Grain:** one row per district per year, for the 3 cross-sectional years
the district-level HIES series covers. **Rows: 480** (172 distinct
state+district pairs × up to 3 years: 2019, 2022, 2024). Built by
`build_socioeconomic_district()`, joining `hh_income_district.csv` +
`hh_poverty_district.csv` + `hh_inequality_district.csv` +
`hh_access_amenities_2022.csv` on (canonical state, canonical district,
year). "All Districts" aggregate rows are dropped (`canonical_district()`
returns `None` for them, which the build function explicitly filters out —
those totals belong in the state-level file, not here).

| Field | Type | Unit | Nullability | Example |
|---|---|---|---|---|
| `state` | string | — | never null | `"Johor"` |
| `district` | string | — | never null | `"Batu Pahat"` |
| `year` | int | — | never null; always one of `2019`, `2022`, `2024` — do not interpolate between them | `2019` |
| `income_mean` | number | RM/month | never null in this file | `7392` |
| `income_median` | number | RM/month | never null in this file | `6504` |
| `poverty_absolute` | number | % | never null in this file | `2.9` |
| `poverty_relative` | number | % | never null in this file | `9` |
| `gini` | number | index, 0–1 | never null in this file | `0.295` |
| `sanitation_pct` | number | % of households | null for 322 of 480 rows — the amenities source (`hh_access_amenities_2022.csv`) was ingested for the **2022 cross-section only** (per `dataset_inventory.json`'s `hh_access_amenities` entry), so 2019 and 2024 rows are always null for this field | `100` |
| `electricity_pct` | number | % of households | null for 323 of 480 rows — same 2022-only reason as `sanitation_pct` | `100` |
| `piped_water_pct` | number | % of households | null for 323 of 480 rows — same 2022-only reason | `100` |

---

## 4. `population_state.json`

**Grain:** one row per state per year per sex. **Rows: 192** (16 states ×
4 years [2020–2023] × 3 sex categories: `male`, `female`, `overall`). Built
by `build_population_state()` from `population_state_2020_2023.json`
(the DOSM intercensal-estimate API slice), filtering to
`age == "overall_age"` and `ethnicity == "overall_ethnicity"` only — the
full source also has 5-year age bands and 7 ethnicity categories, not
ingested in this build (see `dataset_inventory.json`'s `population_state`
entry). This file's `sex == "overall"` rows are also used internally
(as an in-memory lookup, not written to disk separately) as the population
denominator for the `*_per_100k` rate fields in files 6 and 8 below.

| Field | Type | Unit | Nullability | Example |
|---|---|---|---|---|
| `state` | string | — | never null | `"Johor"` |
| `year` | int | — | never null; always 2020–2023 | `2020` |
| `sex` | string | — | never null; one of `"male"`, `"female"`, `"overall"` | `"overall"` |
| `population_thousands` | number | thousands of persons | never null in this file | `4009.7` |

---

## 5. `population_district.json`

**Grain:** one row per district per census year. **Rows: 960** (160
districts × up to 6 census years: 1970, 1980, 1991, 2000, 2010, 2020). Built
by `build_population_district()` from `census_district.csv` (the DOSM
GitHub open-data mirror's historical census table). This series stops at
2020 and does not use the same source as file 4; it is not annual.

| Field | Type | Unit | Nullability | Example |
|---|---|---|---|---|
| `state` | string | — | never null | `"Johor"` |
| `district` | string | — | never null | `"Batu Pahat"` |
| `year` | int | — | never null; one of 1970/1980/1991/2000/2010/2020 | `1970` |
| `population_total` | number | persons | null for 151 of 960 rows | `249596` |
| `sex_male` | number | persons | null for 151 of 960 rows | `122454` |
| `sex_female` | number | persons | null for 151 of 960 rows | `127142` |
| `ethnicity_bumi` | number | persons | null for 151 of 960 rows | `162801` |
| `ethnicity_chinese` | number | persons | null for 151 of 960 rows | `82116` |
| `ethnicity_indian` | number | persons | null for 200 of 960 rows | `4485` |
| `ethnicity_other` | number | persons | null for 154 of 960 rows | `194` |
| `age_0_14` | number | persons | null for 262 of 960 rows — age-band questions were not asked in every census round (per `geo_utils`/census source notes) | `112280` |
| `age_15_64` | number | persons | null for 262 of 960 rows, same reason | `151068` |
| `age_65_above` | number | persons | null for 262 of 960 rows, same reason | `11277` |

All of the `population_total` / sex / ethnicity / age nulls above trace to
the same root cause documented in `dataset_inventory.json`'s
`census_district` entry: *"Many fields blank for pre-1991 census rounds
(not all questions asked every census)."*

---

## 6. `healthcare_access_state.json`

**Grain:** one row per state per year. **Rows: 144** (16 states × years
2014–2022). Built by `build_healthcare_access_state()` from
`healthcare_staff.csv` (staff counts, 2014–2022) joined with
`hospital_beds_2022.csv` (bed counts, 2022 only) and the population lookup
from file 4.

| Field | Type | Unit | Nullability | Example |
|---|---|---|---|---|
| `state` | string | — | never null | `"Johor"` |
| `year` | int | — | never null; 2014–2022 | `2014` |
| `staff_all` | number | count | never null in this file | `11114` |
| `staff_doctor` | number | count | never null in this file | `2720` |
| `staff_dentist` | number | count | never null in this file | `321` |
| `staff_nurse` | number | count | never null in this file | `5980` |
| `staff_nurse_community` | number | count | never null in this file | `2093` |
| `population_used_for_rate` | number | persons (absolute, not thousands) | null for 96 of 144 rows — only populated for years 2020–2023, the range covered by `population_state.json` (file 4); years 2014–2019 have no matching population denominator in this pipeline | `4009700.0` |
| `staff_per_100k` | number | staff per 100,000 population | null for 96 of 144 rows — computed as `staff_all / population_used_for_rate * 100000`, so it is null wherever the denominator is (2014–2019) | `306.6` |
| `hospital_beds` | number | count | null for 128 of 144 rows — populated **only for `year == 2022`**, because `hospital_beds_2022.csv` is a single-year snapshot (per `dataset_inventory.json`'s `hospital_beds` entry: "District-level series only ingested for 2022") | `5433` |
| `beds_per_100k` | number | beds per 100,000 population | null for 128 of 144 rows, same 2022-only reason as `hospital_beds` | `134.9` |

---

## 7. `healthcare_access_national.json`

**Grain:** one row per year, Malaysia national aggregate, combining bed
counts by facility type with staff counts by type. **Rows: 9** (years
2014–2022). Built by `build_healthcare_access_state()`'s national branch
from `hospital_beds_national.csv` (all years, by bed type) and the
`"Malaysia"` rows of `healthcare_staff.csv`.

| Field | Type | Unit | Nullability | Example |
|---|---|---|---|---|
| `year` | int | — | never null; 2014–2022 | `2014` |
| `beds_total` | number | count | null for 1 of 9 years (2014 — the national bed-type series begins in 2015) | `45087` |
| `beds_moh` | number | count (Ministry of Health facilities) | null for 1 of 9 years, same reason | `36447` |
| `beds_non_moh` | number | count (non-MOH facilities) | null for 1 of 9 years, same reason | `3698` |
| `beds_special_institution` | number | count | null for 1 of 9 years, same reason | `4942` |
| `staff_all` | number | count | never null in this file | `121530` |
| `staff_doctor` | number | count | never null in this file | `33275` |
| `staff_dentist` | number | count | never null in this file | `3763` |
| `staff_nurse` | number | count | never null in this file | `59364` |

---

## 8. `healthcare_access_district_2022.json`

**Grain:** one row per district (plus one Malaysia-level rollup row),
**2022 only**. **Rows: 154** (1 national rollup + 153 district rows). Built
by `build_healthcare_access_district_2022()` from `hospital_beds_2022.csv`,
excluding the per-state `"All Districts"` rollup rows (state totals belong
in file 6). Deliberately **does not** compute a beds-per-100,000 rate — see
the `note` field.

| Field | Type | Unit | Nullability | Example |
|---|---|---|---|---|
| `state` | string | — | never null | `"Malaysia"` (national rollup row) or e.g. `"W.P. Putrajaya"` |
| `district` | string or `null` | — | `null` for exactly 1 row — the Malaysia-level rollup row, which has no district | `"Batu Pahat"` |
| `year` | int | — | never null; always `2022` | `2022` |
| `hospital_beds` | number | count | never null in this file | `49985` (national), `637` (W.P. Putrajaya) |
| `note` | string | — | never null; identical fixed text on every row, explaining why no per-capita rate is computed | `"Absolute count only. No 2022 district-level population denominator is available in this pipeline..."` |

---

## 9. `health_outcomes_state.json`

**Grain:** one row per state per year. **Rows: 390** (16 states × years
2000–2024, non-consecutive per source coverage). Built by
`build_health_outcomes_state()`, joining `death_state.csv`,
`death_maternal_state.csv`, `deaths_early_childhood_state.csv`,
`birth_state.csv`, and `std_state.csv` on (canonical state, year). The
`std_*` fields are only added to a row's dict when a matching STD record
exists for that state+year (2017–2022) — they are simply absent (not
present as an explicit `null` key) on rows outside that range, and the
frontend treats a missing key the same as `null`.

| Field | Type | Unit | Nullability | Example |
|---|---|---|---|---|
| `state` | string | — | never null | `"Johor"` |
| `year` | int | — | never null; 2000–2024 | `2000` |
| `crude_death_rate_per_1000` | number | deaths per 1,000 population | never null in this file | `4.4` |
| `deaths_abs` | number | count | never null in this file | `12144` |
| `maternal_deaths_abs` | number | count | never null in this file | `13` |
| `maternal_mortality_rate_per_100k_births` | number | maternal deaths per 100,000 live births | never null in this file | `19.4` |
| `crude_birth_rate_per_1000` | number | live births per 1,000 population | never null in this file | `24.3` |
| `births_abs` | number | count | never null in this file | `67183` |
| `infant_deaths_abs` | number | count | null for 257 of 390 rows | `419` |
| `infant_mortality_rate` | number | deaths per 1,000 live births | null for 257 of 390 rows | `6.2` |
| `neonatal_deaths_abs` | number | count | null for 240 of 390 rows | `239` |
| `neonatal_mortality_rate` | number | deaths per 1,000 live births | null for 240 of 390 rows | `3.6` |
| `perinatal_deaths_abs` | number | count | null for 240 of 390 rows | `193` |
| `perinatal_mortality_rate` | number | deaths per 1,000 live births | null for 240 of 390 rows | `2.9` |
| `toddler_deaths_abs` | number | count | null for 265 of 390 rows | `122` |
| `toddler_mortality_rate` | number | deaths per 1,000 **population** (not live births — a different denominator from the other early-childhood sub-types; see `dataset_inventory.json`'s `deaths_early_childhood_state` limitation note: "do not compare rates across types directly") | `0.5` |
| `under5_deaths_abs` | number | count | null for 240 of 390 rows | `541` |
| `under5_mortality_rate` | number | deaths per 1,000 live births | null for 240 of 390 rows | `8.1` |
| `std_hiv_incidence_per_100k` | number | HIV cases per 100,000 population | present only on the 90 of 390 rows for years 2017–2022 (the STD source's coverage window); absent/null elsewhere | `9.2` |
| `std_aids_incidence_per_100k` | number | AIDS cases per 100,000 population | present only 2017–2022 | `4.72` |
| `std_syphilis_incidence_per_100k` | number | syphilis cases per 100,000 population | present only 2017–2022 | `7.82` |
| `std_gonorrhea_incidence_per_100k` | number | gonorrhea cases per 100,000 population | present only 2017–2022 | `10.72` |

The `infant_deaths_abs`/`neonatal_*`/`perinatal_*`/`toddler_*`/`under5_*`
nulls all share one root cause: `build_health_outcomes_state()` only
populates these fields where a matching `type` record exists in
`deaths_early_childhood_state.csv` for that state+year — not every state
reports every sub-type in every year in the source.

---

## 10. `immunisation_national.json`

**Grain:** one row per year per disease, Malaysia national level only (no
state/district breakdown exists in the source — per
`dataset_inventory.json`'s `infant_immunisation` limitation note). **Rows:
120** (years 2000–2023 × up to 5–6 diseases: measles, DPT, Hepatitis B,
polio, etc.). Built by `build_health_outcomes_national()` from
`infant_immunisation.csv`.

| Field | Type | Unit | Nullability | Example |
|---|---|---|---|---|
| `year` | int | — | never null; 2000–2023 | `2000` |
| `disease` | string | — | never null | `"measles"` |
| `coverage_pct` | number | % (aggregated-count-based, can exceed 100 — see `dataset_inventory.json`: "Coverage can exceed 100% because it is aggregated-count-based, not individual-linked") | null for 8 of 120 rows | `88.4` (can also be e.g. `107.71`, exceeding 100%) |

---

## 11. `nutrition_national.json`

**Grain:** one row per sex × indicator × prevalence-range category,
**2019 only** (a single National Health & Morbidity Survey cross-section —
per `dataset_inventory.json`'s `nutrition_status_u5_sex` entry). National
level only, no state/district breakdown. **Rows: 30**. Built by
`build_health_outcomes_national()` from `nutrition_status_u5_sex.csv`.

| Field | Type | Unit | Nullability | Example |
|---|---|---|---|---|
| `year` | int | — | never null; always `2019` | `2019` |
| `sex` | string | — | never null; one of `"both"`, `"male"`, `"female"` | `"both"` |
| `indicator` | string | — | never null; WHO growth-standard z-score indicator: `"WAZ"` (weight-for-age), `"HAZ"` (height-for-age), `"WHZ"` (weight-for-height) | `"WAZ"` |
| `range` | string | — | never null; the z-score band this row's prevalence covers | `"< -2SD"` |
| `description` | string | — | never null; human-readable label for the range/indicator combination | `"Underweight"` |
| `prevalence_pct` | number | % of children under 5 | never null in this file | `14.1` |

---

## `geo_lookup.csv`

**Grain:** one row per state (district fields blank) plus one row per
district. **Rows: 176** total (16 state rows + 160 district rows). Built by
`scripts/build_geo_lookup.py` from DOSM's official
`administrative_1_state.geojson` and `administrative_2_district.geojson`
boundary files. Latitude/longitude are **real geometric centroids**
computed with `shapely`'s `.centroid` on each polygon — not hand-entered or
looked up from an external gazetteer.

| Column | Type | Nullability | Example |
|---|---|---|---|
| `state_code` | string (numeric code as text) | never blank | `"1"` |
| `state_name` | string | never blank; canonical DOSM state name | `"Johor"` |
| `district_code` | string (numeric code as text) | blank on the 16 state-level rows only | `"1"` (blank on state rows) |
| `district_name` | string | blank on the 16 state-level rows only | `"Batu Pahat"` (blank on state rows) |
| `latitude` | number, 5 decimal places | never blank | `2.03997` (state row) / `1.93137` (district row) |
| `longitude` | number, 5 decimal places | never blank | `103.38775` (state row) / `103.03217` (district row) |

State-level rows (with blank `district_code`/`district_name`) let this one
file serve as the single source of truth for both map resolutions.

---

## Companion pipeline log files (not consumed by the frontend)

- `data/processed/transform_log.txt` — one line per output file written the
  last time `transform_data.py` ran, with its record count.
- `data/processed/update_log.txt` — timestamped stage-by-stage log from the
  last `update_database.py` run (ingest/validate/transform/sync pass or
  fail per stage).
