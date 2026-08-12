# Methodology

This is the repo-level, engineering-focused methodology document, intended
for a developer or researcher reproducing or auditing the pipeline. It
covers the same ground as the in-app Methodology page
(`frontend/src/pages/Methodology.tsx`) at greater technical depth, and is
kept consistent with it — if you find a discrepancy between the two, both
should be corrected together.

## 1. Purpose and research question

The Malaysia Health Equity Tracker was built to answer one guiding
question: **where are health inequalities greatest in Malaysia, who is
affected, and how do socioeconomic conditions relate to health outcomes?**
Every figure on the dashboard traces back to a specific, citable dataset
published by a Malaysian government agency (see
[`DATA_SOURCES.md`](DATA_SOURCES.md)). Nothing is simulated, estimated by
the dashboard, or filled in to make a chart look complete — where a number
cannot be derived from source data without an unjustified assumption, the
dashboard shows "No data".

## 2. Pipeline architecture, stage by stage

The pipeline is five standalone, re-runnable Python scripts under
`scripts/`, each doing one job:

```
ingest_data.py  →  validate_data.py  →  build_geo_lookup.py  →  transform_data.py  →  (sync, via update_database.py)
```

### 2.1 `scripts/ingest_data.py` — fetch raw data from source

Downloads raw source files into `data/raw/<category>/` from data.gov.my,
DOSM's storage endpoints, and the official `dosm-malaysia/data-open` GitHub
mirror. Per its module docstring, it was authored and validated against the
same real endpoints used to build this repository's first snapshot, but the
sandboxed session that built that snapshot had network access restricted to
a narrow domain allowlist — so many of the raw CSVs actually shipped in
`data/raw/` for that snapshot were pulled via an interactive fetch tool
rather than this script end-to-end. Running the script in an unrestricted
environment reproduces the same data directly.

It supports three fetch strategies per dataset (selected via each entry's
`method` field in the script's `DATASETS` registry):

1. **`csv`** — a direct CSV download from `storage.dosm.gov.my` /
   `storage.data.gov.my`; works for most datasets.
2. **`api`** — the data.gov.my JSON API
   (`api.data.gov.my/data-catalogue?id=...&limit=...&filter=...`), used for
   datasets where the direct CSV endpoint is observed to fail or truncate
   (large multi-year, multi-district files). The API is paginated by
   looping over `filter_years` (one request per year) because `limit=`
   alone does not lift an underlying response-size cap on very large
   slices — narrowing by year keeps each request under that cap. There is
   also an `api_json_raw` variant used only for `population_state`, which
   preserves the original dimensional JSON records (age/ethnicity/sex
   breakdowns) instead of flattening to CSV, because
   `transform_data.py`'s `build_population_state()` reads that structure
   directly.
3. **`github`** — a direct `raw.githubusercontent.com` fetch from the
   official `dosm-malaysia/data-open` mirror, used for administrative
   boundaries and historical census data not published through the
   data.gov.my catalogue API.

**Safety design:** the script never silently overwrites a good raw file
with a failed or implausibly small download — each dataset has a
`min_bytes` threshold (default 200 bytes), and a fetch that returns nothing
or too little leaves the previous file on disk untouched, logging a
warning instead. Every run appends a timestamped entry to
`data/raw/ingest_log.txt` so the provenance of "when was this file last
successfully refreshed" is never lost. Run with `--only id1,id2,...` to
refresh a subset, or `--dry-run` to log what would be fetched without
making requests.

### 2.2 `scripts/validate_data.py` — data-quality checks (advisory only)

Produces one Markdown validation report per raw CSV file in
`data/validation_reports/`, plus a `README.md` index (currently 23 raw CSV
files validated). Per its docstring, this script **never modifies or drops
data — it only reports on it**; any actual cleaning happens explicitly and
separately in `transform_data.py`. Checks performed per file:

- Schema / column presence
- Data types (numeric columns actually numeric, with a min/max range and a
  count of non-numeric-but-non-blank values)
- Missingness (blank/null count and percentage per column)
- Duplicate records — both exact full-row duplicates and rows sharing a key
  (e.g. same `state`+`date`+`type`) with different values, the latter being
  a stronger signal of a real data problem
- Plausible-range outlier flags (e.g. a Gini coefficient outside [0, 1], a
  percentage outside [0, 100], an incidence rate outside [0, 500] per
  100,000)
- State/district name standardisation, via `geo_utils.canonical_state()` /
  `canonical_district()` — flags any raw value that doesn't map cleanly to
  one of the 16 canonical DOSM states
- Temporal coverage and gap years within the observed min–max range (most
  DOSM series are irregular survey years, not annual, so gaps are expected
  and explicitly noted as such rather than flagged as errors)

`update_database.py` treats a validation failure as advisory-only — it logs
a warning and continues the pipeline rather than hard-failing, since
validation reports are meant for human review, not gating.

### 2.3 `scripts/build_geo_lookup.py` — geographic dimension table

Builds `data/processed/geo_lookup.csv`, the canonical state+district lookup
table with codes and centroid coordinates, from DOSM's own official
administrative boundary files (`data/raw/geo/administrative_1_state.geojson`
and `administrative_2_district.geojson`, from the `dosm-malaysia/data-open`
GitHub mirror). See section 4 below for how centroids are computed. Also
copies the two boundary GeoJSON files through to
`data/processed/geo/state.geojson` and `district.geojson` for the
frontend's choropleth map.

### 2.4 `scripts/transform_data.py` — build the master analytical datasets

Reads validated raw CSVs/JSON from `data/raw/` and writes the 11 master
analytical JSON files consumed by the frontend into `data/processed/` (see
[`DATA_DICTIONARY.md`](DATA_DICTIONARY.md) for exact field-by-field output).
Design principles stated in its module docstring and enforced throughout:

- Every state/district name is passed through
  `geo_utils.canonical_state()` / `canonical_district()` so every output
  joins cleanly against `geo_lookup.csv`.
- `"Malaysia"` aggregate rows are split **out** of state-level files into
  separate `*_national.json` outputs — never treated as a 17th state.
- Missing/blank source values become JSON `null`, never `0` and never a
  silently invented number; `0` is only ever written when the source file
  genuinely contains the literal value `0`.
- Every output row carries its own `year` (int), parsed from the source's
  `date` field via a shared `year_of()` helper, so the frontend never has
  to re-parse dates.
- No interpolation, no cross-year mixing without an explicit field that
  states which year each figure actually came from (see the
  `healthcare_access_district_2022.json` `note` field in
  [`DATA_DICTIONARY.md`](DATA_DICTIONARY.md#8-healthcare_access_district_2022json)
  for a concrete example of this rule being enforced by *omitting* a
  computed rate rather than mixing denominator years).

Each of the 9 builder functions in this script (`build_socioeconomic_national`,
`build_socioeconomic_state`, `build_socioeconomic_district`,
`build_population_state`, `build_population_district`,
`build_healthcare_access_state`, `build_healthcare_access_district_2022`,
`build_health_outcomes_state`, `build_health_outcomes_national`) reads one
or more raw CSVs, indexes them by a join key (state, or state+district, or
state+district+year), and writes exactly one (or in the case of the
healthcare-access and health-outcomes-national builders, two) JSON output
file(s). The script logs each write (path + record count) to
`data/processed/transform_log.txt`.

### 2.5 Sync stage — `scripts/update_database.py`

This project deliberately uses a **static-JSON architecture** rather than a
live database (see section 3 below), so "updating the database" means:
re-run the ETL pipeline against freshly ingested raw data and republish the
resulting static JSON files that the frontend reads from
`frontend/public/data/`. `update_database.py` orchestrates this as a single
command, matching the filename expected by the project's original spec
regardless of the static-site architecture actually shipped. Pipeline
stages, each of which must succeed before the next runs:

1. **`ingest_data.py`** — refresh `data/raw/` from source (skipped with
   `--skip-ingest`, since it requires outbound internet access which the
   original sandboxed build session did not have unrestricted access to).
2. **`validate_data.py`** — regenerate `data/validation_reports/*.md`
   (advisory-only, as above).
3. **`transform_data.py`** — rebuild `data/processed/*.json` from
   `data/raw/`.
4. **Sync** — copy an explicit list of 15 published files (the 11 JSON
   files, `geo_lookup.csv`, the two boundary GeoJSON files, and
   `dataset_inventory.json`) from `data/processed/` and `data/inventory/`
   into `frontend/public/data/` — the exact set the frontend's `useData()`
   hook fetches at runtime. The list is explicit (not "copy everything")
   specifically so a stray scratch file in `data/processed/` can never
   accidentally ship to production.

**Safety:** before overwriting `frontend/public/data/`, the script
snapshots the existing contents to `frontend/public/data/.backup/`. If
ingest or transform fails, the run aborts immediately and
`frontend/public/data/` is left completely untouched. If the sync stage
itself fails (e.g. an expected output file is missing after transform), the
script explicitly restores the pre-run backup. In all failure modes, the
live site never ships a partial or broken update. Every run is logged with
a UTC timestamp and pass/fail per stage to `data/processed/update_log.txt`.

## 3. Why a static-JSON architecture, not a live database

Consistent with `backend/README.md` and `database/README.md`: this is a
**self-contained static application**. The Python ETL pipeline produces
versioned static JSON files, mirrored into `frontend/public/data/`, and the
React frontend reads those files directly via `fetch()` — there is no API
server, no live database connection, and no server-side request handling
anywhere in the deployed app. This was a deliberate choice, made because
the environment this project was first built and delivered in had no
provisioned database or hosting credentials to connect to. Rather than
scaffold a backend that could never be exercised end-to-end in that
environment, the project instead prioritises:

- **Reproducibility** — the entire "backend" is a handful of auditable
  Python scripts anyone can run locally or in CI.
- **Deployability** — the built app is static HTML/CSS/JS plus static JSON,
  deployable to any static host with zero server configuration.
- **A simple trust boundary** — every number the frontend shows can be
  traced to a specific static JSON file, which can be traced to a specific
  government CSV, with no live server-side transformation that could
  silently diverge from the audited pipeline.

If a live backend is added later, `database/README.md` sketches a proposed
table-per-processed-file schema (e.g. `socioeconomic_state`,
`population_district`, `healthcare_access_national`, ...) that the same
`transform_data.py` output would seed directly, with `geo_lookup.csv`'s
`state_code`/`district_code` as the natural join keys — the "sync" stage in
`update_database.py` is the natural seam where a future version would
`INSERT`/`COPY` into a real database instead of copying JSON files.

## 4. Geographic harmonisation

Different data.gov.my / DOSM datasets spell state and district names
inconsistently. `scripts/geo_utils.py` defines **one canonical spelling per
geography**, matching the official DOSM administrative boundary files, and
every transform passes state/district fields through it before writing
output.

**State aliases** (`STATE_ALIASES` dict, real examples from the module):
`"penang"` / `"p.pinang"` → `"Pulau Pinang"`; `"wp kuala lumpur"` /
`"kuala lumpur"` / `"wilayah persekutuan kuala lumpur"` →
`"W.P. Kuala Lumpur"`; similarly for Labuan and Putrajaya. The 16 canonical
states are the 13 states plus the three Federal Territories (Kuala Lumpur,
Labuan, Putrajaya), listed in `CANONICAL_STATES` and matched exactly
against the `state` property in `administrative_1_state.geojson`.
`"malaysia"` is preserved as a special sentinel for national-level
aggregate rows (never treated as a 17th state — see section 2.4).

**District aliases** (`DISTRICT_ALIASES`, a `(state, alt-name-lowercased) →
canonical name` dict built from cases actually observed while joining raw
datasets, real examples): `("Johor", "kulai")` → `"Kulaijaya"`; `("Perak",
"kinta (ipoh)")` → `"Kinta"`; `("Perak", "larut & matang (taiping)")` →
`"Larut dan Matang"`; `("Sarawak", "meradong")` → `"Maradong"`; `("Sabah",
"kota penyu")` → `"Kuala Penyu"`. The literal sentinel values `"All"` /
`"All Districts"` map to `None`, signalling a state-level aggregate row
rather than a real district — `transform_data.py` filters these out of the
district-grain files.

Per the module's own docstring: **no values are invented here** — this
module only standardises the spelling of names that already appear,
verbatim, in the source data; it is an explicit alias table, not a
fuzzy-matching heuristic.

**Centroid computation:** `scripts/build_geo_lookup.py` loads
`administrative_1_state.geojson` and `administrative_2_district.geojson`
and computes the geometric centroid of every polygon using
`shapely.geometry.shape(feature["geometry"]).centroid`, rounding to 5
decimal places. These lat/lon values — used for map labelling and point
placement — are therefore genuinely derived from official government
boundary geometry, not approximated or looked up from an external
gazetteer.

## 5. Missing-data policy

One non-negotiable rule is enforced end to end (`transform_data.py`'s
`num()` helper): **a missing or blank source value is always written as
JSON `null`**, and the frontend always renders `null` as "No data" — never
as `0`, and never filled in by interpolation or estimation. A literal `0`
is only ever written when the source file itself contains the value `0`.

Concrete, real examples found while inspecting the processed JSON
(cross-referenced against [`DATA_DICTIONARY.md`](DATA_DICTIONARY.md)):

1. **`socioeconomic_district.json`: `sanitation_pct` / `electricity_pct` /
   `piped_water_pct`.** Null for ~322–323 of 480 rows. The amenities source
   (`hh_access_amenities_2022.csv`) was ingested for the 2022 cross-section
   only, even though the underlying dataset spans 2016–2024, so every 2019
   and 2024 district row is null for these three fields rather than
   estimated from 2022 or any other year.
2. **`healthcare_access_state.json`: `hospital_beds` / `beds_per_100k`.**
   Null for 128 of 144 rows. `hospital_beds_2022.csv` is a single-year
   snapshot, so these fields are populated only where `year == 2022`; years
   2014–2021 are null, not carried forward or backfilled.
3. **`healthcare_access_district_2022.json`.** This file deliberately
   contains **no per-capita rate field at all** — only the absolute
   `hospital_beds` count — because no 2022 district-level population
   denominator exists anywhere in this pipeline (the live 2020–2024
   district population series is one of the identified-but-not-ingested
   datasets). Computing a rate against the 2020 census denominator instead
   would silently mix a 2022 numerator with a 2020 denominator; the
   pipeline's `note` field on every row states this explicitly rather than
   compute a misleading number.
4. **`population_district.json`: age-band fields.** Null for 262 of 960
   rows, because not every census round asked the same age-breakdown
   question — pre-1991 census rounds in particular have many blank fields
   in the source `census_district.csv` itself.

## 6. Inequality-measure methodology (Inequality Analytics page)

`frontend/src/pages/InequalityAnalytics.tsx` implements five distinct
measures, each with an explicit methodology note rendered next to it in the
UI:

1. **Absolute difference and relative ratio between the best and worst
   state** — e.g. "the gap between the highest- and lowest-poverty state is
   N percentage points" or "State A's rate is X× State B's". These are
   assumption-free comparisons of the numbers as reported.
2. **Rate ratio & rate difference across additional outcomes** — the same
   absolute-difference/ratio calculation applied to outcomes other than the
   user's current selection, for quick comparison across indicators.
3. **Slope Index of Inequality (SII) and Relative Index of Inequality
   (RII)** — implemented in `computeSII()`. States are ranked by their DOSM
   absolute poverty rate and assigned a relative rank between 0 (most
   disadvantaged / highest poverty) and 1 (least disadvantaged / lowest
   poverty) across all states with data, computed as a fractional rank
   among up to 16 states. A **population-weighted linear regression** of
   the selected health outcome against that relative rank is then fit
   (using the states' actual population as regression weights, per the
   `extra="Ranking variable: DOSM absolute poverty rate by state; weights:
   DOSM state population"` annotation in the component). **SII** is the
   regression slope — the modelled absolute gap in the outcome between the
   least- and most-disadvantaged end of the poverty distribution. **RII**
   is the ratio of the predicted outcome at rank 1 to the predicted outcome
   at rank 0 (`(intercept + slope) / intercept`), and is only defined when
   the intercept is non-zero.
4. **Concentration Index** — implemented in `computeConcentration()`, using
   the same poverty-based ranking as SII/RII but requiring a real
   published absolute-count field for the selected outcome (e.g. maternal
   deaths, total deaths, healthcare staff headcount, hospital beds — see
   the `countLabel` values in the component's indicator config), not a
   rate. States are ordered from most to least disadvantaged, and the
   concentration curve plots cumulative population share (x-axis) against
   cumulative share of the outcome's absolute count (y-axis) as states are
   added in that order. The index itself is computed directly from this
   curve using the standard trapezoidal-area formula
   `CI = 1 − Σ(Xᵢ−Xᵢ₋₁)(Yᵢ+Yᵢ₋₁)`, ranging from −1 to +1. This uses real
   published absolute counts and real population weights, not a
   rate-based approximation.

The page explicitly **omits** SII/RII/Concentration Index for an
indicator/year combination when the underlying data doesn't support it
(e.g. no matching absolute-count field, or too few states with non-null
values), showing a stated reason (`InsufficientData` component) instead of
approximating. Both SII/RII and the Concentration Index are ecological,
state-level measures across at most 16 units — the UI itself flags results
as "indicative rather than precise" for this reason.

## 7. Correlation-not-causation disclaimer policy

Every correlation, regression line, Pearson r, Spearman ρ, or r² value
shown anywhere on the dashboard — including the Socioeconomic Inequality
page's socioeconomic-vs-health-outcome scatterplot — describes a
**cross-sectional, ecological statistical association only**. "Ecological"
means the unit of analysis is a state (or district) in a single year, not
an individual person: a positive association between state-level poverty
and a state-level mortality rate says states with higher poverty tend to
also have higher mortality that year — it says nothing about any
individual resident, and it is not adjusted for confounders (urbanisation,
age structure, healthcare capacity, reporting practices) that could
plausibly drive both variables at once. No result on the dashboard should
be read, cited, or reported as causal. Wherever a page displays a
correlation statistic, it carries this caveat directly next to the chart.

## 8. Why there is no composite Health Equity Index

The dashboard does not compute or display a single composite "equity
score" combining income, poverty, healthcare access, and health outcomes
into one number per state/district — a decision stated explicitly in the
Overview page's Key Findings section (`frontend/src/pages/Overview.tsx`):
*"This overview intentionally does not present a single composite 'equity
score' — see Inequality Analytics for why, and what is measured instead."*

The reasoning (elaborated on the in-app Methodology page): a defensible
composite index requires a justified choice of which domains to include, a
normalisation method, an explicit and justified weighting scheme across
domains, and a sensitivity analysis showing the ranking doesn't just
reflect arbitrary weight choices. None of those choices can be made
neutrally from the data alone — each embeds a value judgement about which
dimension of inequity matters more, and a wrong or unstated weighting can
quietly reverse a jurisdiction's ranking. Rather than present one number
that looks authoritative while resting on an unjustifiable weighting, the
dashboard presents each domain's indicators separately — income, poverty,
Gini, amenities access, healthcare capacity, mortality, and morbidity —
alongside the explicit inequality measures in section 6, letting a reader
see which specific dimension drives a state or district's standing rather
than obscuring it behind a composite.

## 9. Known limitations

- **Irregular survey years.** HIES — the source of all income, poverty and
  Gini figures — is not run annually; district-level income, poverty and
  Gini are only available for three cross-sectional years (2019, 2022,
  2024). These years are never interpolated between.
- **Single-snapshot-year datasets.** District-level hospital beds and
  district-level basic amenities access were both ingested for 2022 only,
  due to sandboxed-environment data-fetch constraints encountered during
  this build, even though longer series exist upstream at data.gov.my.
- **No ethnicity–health linkage.** Ethnicity composition data is available
  only at the district level, from historical census tables
  (`population_district.json`), with no matching health-outcome dataset
  broken down by ethnicity anywhere in the sources used. No
  ethnicity-disaggregated health or socioeconomic analysis is presented
  anywhere on the dashboard — the Population Equity page shows ethnicity
  composition as a standalone population-structure view only.
- **STD incidence: 2017–2022 only**, and reported/diagnosed cases likely
  understate true incidence — especially for HIV/AIDS — because of
  differences in testing access across states, which is itself a proxy for
  the inequities the dashboard is trying to surface rather than a clean
  independent measure.
- **Immunisation and nutrition: national level only.** No state/district
  breakdown is published by MOH in the sources used, so these indicators
  cannot appear on any geographic map.
- **Public-sector-only healthcare workforce.** Healthcare staff counts
  exclude private-sector doctors and nurses, a significant share of
  capacity in urban areas.
- **Poverty-line methodology changes over time.** DOSM revised its Poverty
  Line Income methodology around 2019; pre- and post-2019 absolute poverty
  rates are not fully comparable, and the dashboard does not adjust for
  this break in the trend line.
- **Sandbox network/data-volume constraints during the original build.**
  Several datasets — the full live 2020–2024 district population series,
  the full disaggregated (age/ethnicity) state population series, and
  several early-childhood/STD/healthcare-staff series that reliably return
  binary-data errors as direct CSV downloads — required the `api` fetch
  strategy or were deferred entirely (see
  [`DATA_SOURCES.md`](DATA_SOURCES.md#identified-but-not-yet-ingested-out-of-scope-for-this-build)
  for the full list with per-dataset reasons). `scripts/ingest_data.py`
  documents exactly which fetch strategy each dataset needs so a re-run in
  an unrestricted environment can pull the full data.

## 10. How to reproduce the pipeline end-to-end

```bash
# 1. Place any updated raw source files under data/raw/, or fetch fresh ones:
python3 scripts/ingest_data.py                 # requires outbound internet access

# 2. Validate the raw data (advisory; review reports under data/validation_reports/):
python3 scripts/validate_data.py

# 3. (Re)build the geography lookup table and centroids:
python3 scripts/build_geo_lookup.py

# 4. Rebuild every master analytical JSON file under data/processed/:
python3 scripts/transform_data.py

# 5. Sync data/processed/ + data/inventory/ into frontend/public/data/,
#    then rebuild the frontend:
cd frontend && npm run build
```

Or, run the whole pipeline (steps 1–4, plus the sync into
`frontend/public/data/`) as a single orchestrated, fail-safe command via
`scripts/update_database.py`:

```bash
python3 scripts/update_database.py                # full refresh (needs internet access)
python3 scripts/update_database.py --skip-ingest   # rebuild from existing data/raw/, no network needed
```

A scheduled workflow at `.github/workflows/update-data.yml` exists to run
this same sequence on a recurring schedule as DOSM and MOH publish new
survey years, intended to open a pull request with the regenerated data
files for review before they are merged and deployed.
