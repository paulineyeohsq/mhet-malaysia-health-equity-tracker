"""
ingest_data.py — Download raw source data for the Malaysia Health Equity
Tracker from data.gov.my / DOSM / MOH open-data endpoints and the official
`dosm-malaysia/data-open` GitHub mirror, into data/raw/<category>/.

This script is designed to be run from an environment with normal internet
access (e.g. a GitHub Actions runner, or a developer's own machine) — it was
authored and validated against the SAME real endpoints used to build the
first version of this dataset (see data/inventory/dataset_inventory.json for
the exact URL used per dataset, and data/validation_reports/ for the
resulting per-file quality reports), but network access inside the sandboxed
session that built this repository's first snapshot was restricted to a
narrow domain allowlist, so many of the CSVs in data/raw/ for that snapshot
were actually pulled via an interactive fetch tool rather than by running
this script end-to-end. Running this script in an unrestricted environment
reproduces the same data directly.

Design principles (matching transform_data.py / validate_data.py):
  - Never silently overwrite a good raw file with a failed/partial download.
    If a fetch fails or returns something implausibly small, the previous
    file on disk is left untouched and a warning is logged.
  - Every run appends a timestamped entry to data/raw/ingest_log.txt so the
    provenance of "when was this file last successfully refreshed" is never
    lost.
  - Three fetch strategies are supported per dataset:
      1. "csv"  - a direct CSV download from storage.dosm.gov.my /
                  storage.data.gov.my (works for most datasets).
      2. "api"  - the data.gov.my JSON API (api.data.gov.my/data-catalogue/?id=...),
                  fetching the WHOLE dataset in one request, used where the raw CSV
                  endpoint has been observed to fail. (It used to loop over a hard-coded
                  list of years, which meant anything published later was never picked up.)
      3. "github" - a direct raw.githubusercontent.com fetch from the official
                  dosm-malaysia/data-open mirror (administrative boundaries and
                  historical census data).
  - Every run writes data/raw/ingest_report.json: per dataset, whether it was refreshed,
    unchanged, failed or refused (a download with >10% fewer rows than the file on disk is
    treated as truncated), its latest data year, and what the publisher itself says about
    how current the dataset is (data_as_of / last_updated / next_update).
  - Exit code 0 = everything fine, 3 = some datasets kept their previous file (see the
    report), 2 = nothing could be fetched.

Run: python3 scripts/ingest_data.py [--only id1,id2,...] [--dry-run]
"""
from __future__ import annotations
import argparse
import csv
import io
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
LOG_PATH = RAW / "ingest_log.txt"

# Minimum plausible byte size for a "real" data file — used as a crude sanity
# check to avoid silently accepting a truncated/error-page response as good
# data. Datasets known to legitimately be small (few hundred bytes) set their
# own min_bytes override below.
DEFAULT_MIN_BYTES = 200

USER_AGENT = "malaysia-health-equity-tracker-ingest/1.0 (+https://data.gov.my)"

# ---------------------------------------------------------------------------
# Dataset registry — one entry per raw file this pipeline consumes.
# `category` maps to the data/raw/<category>/ subfolder used throughout this
# project. `id` matches the id used in data/inventory/dataset_inventory.json
# so this script and the inventory stay in sync.
# ---------------------------------------------------------------------------
DATASETS = [
    # -- Socioeconomic (HIES: Household Income & Expenditure Survey) --------
    {"id": "hh_income", "category": "socioeconomic", "filename": "hh_income.csv",
     "method": "csv", "url": "https://storage.dosm.gov.my/hies/hh_income.csv"},
    {"id": "hh_income_state", "category": "socioeconomic", "filename": "hh_income_state.csv",
     "method": "csv", "url": "https://storage.dosm.gov.my/hies/hh_income_state.csv"},
    {"id": "hh_income_district", "category": "socioeconomic", "filename": "hh_income_district.csv",
     "method": "csv", "url": "https://storage.dosm.gov.my/hies/hh_income_district.csv"},
    {"id": "hh_poverty", "category": "socioeconomic", "filename": "hh_poverty.csv",
     "method": "csv", "url": "https://storage.dosm.gov.my/hies/hh_poverty.csv"},
    {"id": "hh_poverty_state", "category": "socioeconomic", "filename": "hh_poverty_state.csv",
     "method": "csv", "url": "https://storage.dosm.gov.my/hies/hh_poverty_state.csv"},
    {"id": "hh_poverty_district", "category": "socioeconomic", "filename": "hh_poverty_district.csv",
     "method": "csv", "url": "https://storage.dosm.gov.my/hies/hh_poverty_district.csv"},
    {"id": "hh_inequality", "category": "socioeconomic", "filename": "hh_inequality.csv",
     "method": "csv", "url": "https://storage.dosm.gov.my/hies/hh_inequality.csv"},
    {"id": "hh_inequality_state", "category": "socioeconomic", "filename": "hh_inequality_state.csv",
     "method": "csv", "url": "https://storage.dosm.gov.my/hies/hh_inequality_state.csv"},
    {"id": "hh_inequality_district", "category": "socioeconomic", "filename": "hh_inequality_district.csv",
     "method": "csv", "url": "https://storage.dosm.gov.my/hies/hh_inequality_district.csv"},
    {"id": "hh_access_amenities", "category": "socioeconomic", "filename": "hh_access_amenities.csv",
     "method": "api", "api_id": "hh_access_amenities",
     "note": "Observed to fail as a direct CSV fetch in the original build (binary-data error from the CDN); the JSON API works reliably."},
    {"id": "hies_2019_snapshot", "category": "socioeconomic", "filename": "hies_2019_snapshot.csv",
     "method": "github", "url": "https://raw.githubusercontent.com/dosm-malaysia/data-open/main/datasets/economy/hies_2019.csv"},

    # -- Demography -----------------------------------------------------------
    {"id": "population_state", "category": "demography", "filename": "population_state.csv",
     "method": "csv", "url": "https://storage.dosm.gov.my/population/population_state.csv", "since_year": 2020,
     "note": "DOSM's own file, which runs to 2026. The data.gov.my API copy of this dataset (what this entry used before) stopped at 2023. Only 2020 onward is kept (the file goes back to 1970 with every age/ethnicity combination, ~40 MB)."},
    {"id": "census_district", "category": "demography", "filename": "census_district.csv",
     "method": "github", "url": "https://raw.githubusercontent.com/dosm-malaysia/data-open/main/datasets/census/census_district.csv"},

    # -- Geographic boundaries --------------------------------------------------
    {"id": "administrative_1_state", "category": "geo", "filename": "administrative_1_state.geojson",
     "method": "github", "url": "https://raw.githubusercontent.com/dosm-malaysia/data-open/main/datasets/geodata/administrative_1_state.geojson",
     "min_bytes": 1000},
    {"id": "administrative_2_district", "category": "geo", "filename": "administrative_2_district.geojson",
     "method": "github", "url": "https://raw.githubusercontent.com/dosm-malaysia/data-open/main/datasets/geodata/administrative_2_district.geojson",
     "min_bytes": 1000},

    # -- Healthcare resources ---------------------------------------------------
    {"id": "hospital_beds_national", "category": "healthcare", "filename": "hospital_beds_national.csv",
     "method": "csv", "url": "https://storage.data.gov.my/healthcare/hospital_beds.csv",
     "note": "National time series by bed type. If the direct CSV fails, fall back to method='api' with api_id='hospital_beds' and filter=[('type','all')] etc."},
    {"id": "hospital_beds_2022", "category": "healthcare", "filename": "hospital_beds_2022.csv",
     "method": "api", "api_id": "hospital_beds", "keep": {"type": "all"}, "latest_year_only": True,
     "note": "State + district snapshot of the latest year the publisher has released (2022 at the time of writing; the file name is historical), total beds only. The source also holds earlier years - see docs/DATA_SOURCES.md."},
    {"id": "healthcare_staff", "category": "healthcare", "filename": "healthcare_staff.csv",
     "method": "api", "api_id": "healthcare_staff",
     "note": "Direct CSV fetch observed to fail (binary-data error); JSON API paginated by year works reliably."},

    # -- Health outcomes ----------------------------------------------------------
    {"id": "death_state", "category": "health_outcomes", "filename": "death_state.csv",
     "method": "csv", "url": "https://storage.dosm.gov.my/demography/death_state.csv"},
    {"id": "death_maternal_state", "category": "health_outcomes", "filename": "death_maternal_state.csv",
     "method": "csv", "url": "https://storage.dosm.gov.my/demography/death_maternal_state.csv"},
    {"id": "deaths_early_childhood_state", "category": "health_outcomes", "filename": "deaths_early_childhood_state.csv",
     "method": "api", "api_id": "deaths_early_childhood_state",
     "note": "Direct CSV fetch observed to fail (binary-data error); JSON API paginated by year works reliably."},
    {"id": "birth_state", "category": "health_outcomes", "filename": "birth_state.csv",
     "method": "csv", "url": "https://storage.dosm.gov.my/demography/birth_state.csv"},
    {"id": "infant_immunisation", "category": "health_outcomes", "filename": "infant_immunisation.csv",
     "method": "csv", "url": "https://storage.data.gov.my/healthcare/infant_immunisation.csv"},
    {"id": "nutrition_status_u5_sex", "category": "health_outcomes", "filename": "nutrition_status_u5_sex.csv",
     "method": "csv", "url": "https://storage.data.gov.my/healthcare/nutrition_status_u5_sex.csv"},
    {"id": "std_state", "category": "health_outcomes", "filename": "std_state.csv",
     "method": "api", "api_id": "std_state",
     "note": "Direct CSV fetch observed to fail (binary-data error); JSON API paginated by year works reliably."},
    {"id": "death_sex_ethnic_state", "category": "health_outcomes", "filename": "death_sex_ethnic_state.csv",
     "method": "csv", "url": "https://storage.dosm.gov.my/demography/death_sex_ethnic_state.csv",
     "note": "Deaths by state+sex+ethnicity — confirmed 2026-08-14 this DOES now exist, contradicting this project's earlier documented 'no ethnicity-health dataset exists' finding (see docs/DATA_SOURCES.md)."},
    {"id": "death_district_sex", "category": "health_outcomes", "filename": "death_district_sex.csv",
     "method": "csv", "url": "https://storage.dosm.gov.my/demography/death_district_sex.csv",
     "note": "District-resolution upgrade of death_state (which is state-only)."},
    {"id": "birth_district_sex", "category": "health_outcomes", "filename": "birth_district_sex.csv",
     "method": "csv", "url": "https://storage.dosm.gov.my/demography/birth_district_sex.csv",
     "note": "District-resolution upgrade of birth_state (which is state-only)."},
    {"id": "stillbirth_state", "category": "health_outcomes", "filename": "stillbirth_state.csv",
     "method": "csv", "url": "https://storage.dosm.gov.my/demography/stillbirth_state.csv"},
    {"id": "sdg_03-3-1", "category": "health_outcomes", "filename": "sdg_03-3-1.csv",
     "method": "csv", "url": "https://storage.dosm.gov.my/sdg/sdg_03-3-1.csv",
     "note": "HIV incidence per 1,000 uninfected population — national only, no state breakdown. Complements std_state's crude diagnosed-case counts with a methodologically cleaner incidence metric."},

    # -- Electoral-geography population (no boundary GeoJSON exists for these in DOSM's open mirror; table-only) --
    {"id": "population_parlimen", "category": "demography", "filename": "population_parlimen.csv",
     "method": "csv", "url": "https://storage.dosm.gov.my/population/population_parlimen.csv"},
    {"id": "population_dun", "category": "demography", "filename": "population_dun.csv",
     "method": "csv", "url": "https://storage.dosm.gov.my/population/population_dun.csv"},

    # -- Full district population (2020-2024, sex/age/ethnicity) — supersedes the census_district fallback if this succeeds --
    {"id": "population_district_full", "category": "demography", "filename": "population_district_full.csv",
     "method": "csv", "url": "https://storage.dosm.gov.my/population/population_district.csv",
     "note": "Previously observed to exceed the sandbox's single-request fetch-size limit (see dataset_inventory.json); retrying here since the sandbox/network environment may differ. If this fails, the existing census_district fallback stays in use and this entry's failure is logged, not forced."},

    # -- Income percentile --
    {"id": "hies_malaysia_percentile", "category": "socioeconomic", "filename": "hies_malaysia_percentile.csv",
     "method": "csv", "url": "https://storage.dosm.gov.my/hies/hies_malaysia_percentile.csv"},

    # -- Marriages & fertility --
    {"id": "marriages", "category": "demography", "filename": "marriages.csv",
     "method": "csv", "url": "https://storage.dosm.gov.my/demography/marriages.csv"},
    {"id": "marriages_state", "category": "demography", "filename": "marriages_state.csv",
     "method": "csv", "url": "https://storage.dosm.gov.my/demography/marriages_state.csv"},
    {"id": "fertility_state", "category": "demography", "filename": "fertility_state.csv",
     "method": "csv", "url": "https://storage.dosm.gov.my/demography/fertility_state.csv"},

    # -- Health programme participation (daily grain, state-level; aggregated to annual in transform_data.py) --
    {"id": "blood_donations_state", "category": "health_outcomes", "filename": "blood_donations_state.csv",
     "method": "csv", "url": "https://storage.data.gov.my/healthcare/blood_donations_state.csv",
     "note": "Daily grain. If direct CSV fails/truncates, fall back to method='api' with api_id='blood_donations_state', year-paginated like std_state."},
    {"id": "organ_pledges_state", "category": "health_outcomes", "filename": "organ_pledges_state.csv",
     "method": "csv", "url": "https://storage.data.gov.my/healthcare/organ_pledges_state.csv",
     "note": "Daily grain, data from 2009 onward. Same API fallback note as blood_donations_state applies."},
    {"id": "pekab40_screenings_state", "category": "health_outcomes", "filename": "pekab40_screenings_state.csv",
     "method": "csv", "url": "https://storage.data.gov.my/healthcare/pekab40_screenings_state.csv",
     "note": "Daily grain. Same API fallback note as blood_donations_state applies."},

    # -- COVID-19 (distinct outbreak-analytics domain; daily grain aggregated to annual in transform_data.py) --
    {"id": "covid_cases", "category": "health_outcomes", "filename": "covid_cases.csv",
     "method": "csv", "url": "https://storage.data.gov.my/healthcare/covid_cases.csv",
     "note": "Daily grain, pandemic period. Same API fallback note as blood_donations_state applies."},
    {"id": "covid_cases_age", "category": "health_outcomes", "filename": "covid_cases_age.csv",
     "method": "csv", "url": "https://storage.data.gov.my/healthcare/covid_cases_age.csv"},
    {"id": "covid_deaths_linelist", "category": "health_outcomes", "filename": "covid_deaths_linelist.csv",
     "method": "csv", "url": "https://storage.data.gov.my/healthcare/covid_deaths_linelist.csv",
     "note": "Individual-level line list, not pre-aggregated — highest size/complexity risk of this batch. If this fails, it is logged back to dataset_inventory.json's identified_but_not_yet_ingested with the failure reason rather than forced."},

    # -- National Health Accounts (healthcare financing; national level only) --
    {"id": "mnha", "category": "healthcare", "filename": "mnha.csv",
     "method": "csv", "url": "https://storage.data.gov.my/healthcare/mnha.csv"},
    {"id": "mnha_moh", "category": "healthcare", "filename": "mnha_moh.csv",
     "method": "csv", "url": "https://storage.data.gov.my/healthcare/mnha_moh.csv"},

    # -- Basic amenities (longer state-level annual series, distinct from hh_access_amenities' 2022 district snapshot) --
    {"id": "sanitation_access", "category": "healthcare", "filename": "sanitation_access.csv",
     "method": "csv", "url": "https://storage.data.gov.my/healthcare/sanitation_access.csv"},
    {"id": "water_access", "category": "healthcare", "filename": "water_access.csv",
     "method": "csv", "url": "https://storage.data.gov.my/water/water_access.csv"},
    {"id": "electricity_access", "category": "healthcare", "filename": "electricity_access.csv",
     "method": "csv", "url": "https://storage.data.gov.my/energy/electricity_access.csv",
     "note": "State column here is only 4 utility-operator regions (Malaysia/Semenanjung/Sabah/Sarawak), NOT the usual 16 states — kept structurally separate in transform_data.py rather than force-joined onto the 16-state schema."},

    # -- Nutrition by strata (national, urban/rural, 2019 — counterpart to nutrition_status_u5_sex) --
    {"id": "nutrition_children_strata", "category": "health_outcomes", "filename": "nutrition_status_u5_strata.csv",
     "method": "csv", "url": "https://storage.data.gov.my/healthcare/nutrition_status_u5_strata.csv"},

    # -- Environment (added 2026-08-17, DOSM's "environment" catalogue category) --
    {"id": "forest_reserve", "category": "environment", "filename": "forest_reserve.csv",
     "method": "csv", "url": "https://storage.data.gov.my/environment/forest_reserve.csv"},
    {"id": "forest_reserve_state", "category": "environment", "filename": "forest_reserve_state.csv",
     "method": "csv", "url": "https://storage.data.gov.my/environment/forest_reserve_state.csv",
     "note": "State column also includes a 'Semenanjung Malaysia' (Peninsular) regional aggregate row alongside the 16 real states — excluded from the state panel in transform_data.py, same treatment as the 'Malaysia' national aggregate elsewhere."},
    {"id": "air_pollution", "category": "environment", "filename": "air_pollution.csv",
     "method": "csv", "url": "https://storage.data.gov.my/environment/air_pollution.csv",
     "note": "National monthly pollutant concentrations only — no station or state breakdown in this source."},
    {"id": "ghg_emissions", "category": "environment", "filename": "ghg_emissions.csv",
     "method": "csv", "url": "https://storage.data.gov.my/environment/ghg_emissions.csv",
     "note": "National annual only. 2020-2021 'net'/sectoral rows are blank (provisional, no sectoral breakdown yet) — only 'total' is populated for those two years."},
    {"id": "water_pollution_basin", "category": "environment", "filename": "water_pollution_basin.csv",
     "method": "csv", "url": "https://storage.data.gov.my/environment/water_pollution_basin.csv",
     "note": "River-basin-level monitoring rolled up to a national annual proportion (clean/slightly polluted/polluted) — not state-resolution, since a river basin does not map 1:1 to a state."},
    {"id": "water_consumption", "category": "environment", "filename": "water_consumption.csv",
     "method": "csv", "url": "https://storage.data.gov.my/water/water_consumption.csv",
     "note": "Monthly by state and sector (domestic/nondomestic); aggregated to an annual mean rate (MLD) per state/sector/year in transform_data.py. W.P. Kuala Lumpur and W.P. Putrajaya are absent from the source (served by Selangor's water utility, not billed separately)."},
    {"id": "water_production", "category": "environment", "filename": "water_production.csv",
     "method": "csv", "url": "https://storage.data.gov.my/water/water_production.csv",
     "note": "Monthly by state; aggregated to an annual mean rate (MLD) per state/year in transform_data.py. Same W.P. Kuala Lumpur / W.P. Putrajaya absence as water_consumption."},
    {"id": "electricity_consumption", "category": "environment", "filename": "electricity_consumption.csv",
     "method": "csv", "url": "https://storage.data.gov.my/energy/electricity_consumption.csv",
     "note": "National monthly only, by sector (total/local/local_commercial/local_domestic/exports/losses); summed to an annual total (MKWh) per sector/year in transform_data.py."},
    {"id": "electricity_supply", "category": "environment", "filename": "electricity_supply.csv",
     "method": "csv", "url": "https://storage.data.gov.my/energy/electricity_supply.csv",
     "note": "National monthly only, by sector (total/local/local_public/local_private/imports/distribution); summed to an annual total (MKWh) per sector/year in transform_data.py."},
]

API_BASE = "https://api.data.gov.my/data-catalogue/"  # the trailing slash matters: without it the API answers with an empty body
REPORT_PATH = RAW / "ingest_report.json"
RETRIES = 3
# A refreshed file with this much less data than the one on disk is treated as a truncated download, not as news.
MAX_SHRINK = 0.10


def log(msg: str):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def _http_get(url: str, timeout: int = 90) -> bytes:
    """GET with retries (transient 5xx / timeouts are common on the open-data CDN)."""
    last: Exception | None = None
    for attempt in range(RETRIES):
        try:
            req = Request(url, headers={"User-Agent": USER_AGENT})
            with urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except (URLError, HTTPError, TimeoutError, ConnectionError) as e:
            last = e
            if attempt < RETRIES - 1:
                time.sleep(2 * 3**attempt)  # 2s, 6s
    assert last is not None
    raise last


class IngestError(Exception):
    pass


def _check_not_html(content: bytes, what: str) -> None:
    head = content[:200].lstrip().lower()
    if head.startswith((b"<!doctype", b"<html", b"<?xml")):
        raise IngestError(f"{what} returned an HTML/XML page instead of data")


def _year_of(value) -> int | None:
    m = re.match(r"\s*(\d{4})", str(value)) if value not in (None, "") else None
    return int(m.group(1)) if m else None


def _latest_year(rows: list[dict]) -> int | None:
    years = [y for r in rows for y in (_year_of(r.get("date", r.get("year"))),) if y is not None]
    return max(years) if years else None


def _rows_of(content: bytes, ds: dict) -> list[dict]:
    """Parse fetched bytes back into row dicts, for counting and the latest-year report. Not for geojson."""
    if ds["filename"].endswith(".json"):
        data = json.loads(content)
        return data if isinstance(data, list) else []
    if ds["filename"].endswith(".geojson"):
        return []
    return list(csv.DictReader(io.StringIO(content.decode("utf-8-sig", "replace"))))


def fetch_csv(ds: dict) -> tuple[bytes, dict | None]:
    content = _http_get(ds["url"])
    _check_not_html(content, "the CSV endpoint")
    since = ds.get("since_year")
    if since:
        # Keep only rows from `since_year` on (a `date` or `year` column), for files whose full history we do not need.
        reader = csv.DictReader(io.StringIO(content.decode("utf-8-sig")))
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=reader.fieldnames, lineterminator="\n")
        writer.writeheader()
        for row in reader:
            y = _year_of(row.get("date", row.get("year")))
            if y is not None and y >= since:
                writer.writerow(row)
        content = buf.getvalue().encode("utf-8")
    return content, None


def fetch_github(ds: dict) -> tuple[bytes, dict | None]:
    content = _http_get(ds["url"])
    _check_not_html(content, "the GitHub mirror")
    return content, None


def fetch_api_all(ds: dict) -> tuple[list[dict], dict | None]:
    """The whole dataset in one request, plus the publisher's own freshness metadata (`meta=true`).

    This used to fetch one hard-coded year at a time (`filter=<year>@year`), which silently stopped picking up
    anything published after the listed years - and, with the old URL (no trailing slash), returned nothing at all.
    Optional per-dataset narrowing: `keep` ({column: value} the row must match) and `latest_year_only`."""
    url = f"{API_BASE}?id={ds['api_id']}&limit=1000000&meta=true"
    raw = _http_get(url, timeout=180)
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as e:
        raise IngestError(f"the API answered with something that is not JSON ({e})")
    meta = None
    if isinstance(payload, dict) and "data" in payload:
        meta = payload.get("meta")
        rows = payload["data"]
    elif isinstance(payload, list):
        rows = payload
    else:
        raise IngestError("unrecognised API response shape")
    if meta and meta.get("total") is not None and meta["total"] != len(rows):
        raise IngestError(f"API reported {meta['total']} rows but returned {len(rows)} (truncated response)")
    for column, value in (ds.get("keep") or {}).items():
        rows = [r for r in rows if str(r.get(column)) == str(value)]
    if ds.get("latest_year_only") and rows:
        newest = _latest_year(rows)
        rows = [r for r in rows if _year_of(r.get("date")) == newest]
    return rows, meta


def fetch_api(ds: dict) -> tuple[bytes, dict | None]:
    """API rows serialised to CSV so downstream raw/ files stay uniformly CSV regardless of fetch method."""
    rows, meta = fetch_api_all(ds)
    if not rows:
        raise IngestError("the API returned no rows")
    fieldnames: list[str] = []
    for r in rows:
        for k in r.keys():
            if k not in fieldnames:
                fieldnames.append(k)
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fieldnames, lineterminator="\n")
    writer.writeheader()
    for r in rows:
        writer.writerow(r)
    return buf.getvalue().encode("utf-8"), meta


def fetch_api_json_raw(ds: dict) -> tuple[bytes, dict | None]:
    """Like fetch_api, but keeps the raw JSON records - used only for population_state, whose transform expects
    the original dimensional records (age/ethnicity/sex)."""
    rows, meta = fetch_api_all(ds)
    if not rows:
        raise IngestError("the API returned no rows")
    return json.dumps(rows, indent=1).encode("utf-8"), meta


FETCHERS = {
    "csv": fetch_csv,
    "github": fetch_github,
    "api": fetch_api,
    "api_json_raw": fetch_api_json_raw,
}


def fetch_source_meta(ds: dict) -> dict | None:
    """Best-effort: what the publisher says about its own dataset (data_as_of / last_updated / next_update).
    Lets the app say "the source has not published anything newer" instead of looking like we are behind."""
    cid = ds.get("api_id") or (Path(urlparse(ds.get("url", "")).path).stem if ds["method"] == "csv" else None)
    if not cid:
        return None
    try:
        payload = json.loads(_http_get(f"{API_BASE}?id={cid}&limit=1&meta=true", timeout=30))
        meta = payload.get("meta") if isinstance(payload, dict) else None
    except Exception:  # noqa: BLE001 - metadata is a nicety, never a reason to fail a refresh
        return None
    if not isinstance(meta, dict):
        return None
    return {k: meta.get(k) for k in ("data_as_of", "last_updated", "next_update", "update_frequency") if meta.get(k) is not None}


def _count_rows(path: Path, ds: dict) -> int | None:
    try:
        return len(_rows_of(path.read_bytes(), ds))
    except Exception:  # noqa: BLE001
        return None


def ingest_one(ds: dict, dry_run: bool = False) -> dict:
    """Refresh one raw file. Returns a result dict (never raises): status is ok / unchanged / failed / refused."""
    out_path = RAW / ds["category"] / ds["filename"]
    min_bytes = ds.get("min_bytes", DEFAULT_MIN_BYTES)
    result: dict = {"id": ds["id"], "file": str(out_path.relative_to(ROOT)).replace("\\", "/"), "method": ds["method"]}
    log(f"Ingesting {ds['id']} -> {result['file']}  (method={ds['method']})")
    if dry_run:
        log("  (dry run - not fetching)")
        return {**result, "status": "dry-run"}

    try:
        content, meta = FETCHERS[ds["method"]](ds)
    except Exception as e:  # noqa: BLE001 - any failure leaves the previous file untouched
        log(f"  FAILED: {e}. Previous file left UNCHANGED.")
        return {**result, "status": "failed", "error": str(e)}

    if len(content) < min_bytes:
        log(f"  FAILED (got {len(content)} bytes, need >= {min_bytes}). Previous file left UNCHANGED.")
        return {**result, "status": "failed", "error": f"only {len(content)} bytes"}

    rows = _rows_of(content, ds)
    result["rows"] = len(rows) if rows else None
    result["latest_year"] = _latest_year(rows) if rows else None

    if out_path.exists():
        if out_path.read_bytes() == content:
            log("  unchanged since last run")
            return {**result, "status": "unchanged", "source": meta or fetch_source_meta(ds)}
        old_rows = _count_rows(out_path, ds)
        if old_rows and rows and len(rows) < old_rows * (1 - MAX_SHRINK) and not ds.get("allow_shrink"):
            msg = f"new file has {len(rows)} rows vs {old_rows} on disk (more than {MAX_SHRINK:.0%} fewer) - looks truncated"
            log(f"  REFUSED: {msg}. Previous file left UNCHANGED.")
            return {**result, "status": "refused", "error": msg}
        result["previous_rows"] = old_rows

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(content)
    log(f"  OK - wrote {len(content):,} bytes ({result['rows']} rows, latest year {result['latest_year']})")
    return {**result, "status": "ok", "source": meta or fetch_source_meta(ds)}


def write_report(results: list[dict]) -> None:
    """data/raw/ingest_report.json - what happened to every dataset in this run (merged with earlier runs for any
    dataset not part of this one, so `--only` runs do not erase the rest)."""
    previous: dict[str, dict] = {}
    if REPORT_PATH.exists():
        try:
            previous = {r["id"]: r for r in json.loads(REPORT_PATH.read_text(encoding="utf-8")).get("results", [])}
        except Exception:  # noqa: BLE001
            previous = {}
    for r in results:
        previous[r["id"]] = {**r, "checked_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    merged = [previous[d["id"]] for d in DATASETS if d["id"] in previous]
    summary = {s: sum(1 for r in merged if r["status"] == s) for s in ("ok", "unchanged", "failed", "refused")}
    REPORT_PATH.write_text(
        json.dumps({"run_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "summary": summary, "results": merged}, indent=1) + "\n",
        encoding="utf-8",
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", help="Comma-separated list of dataset ids to ingest (default: all)")
    parser.add_argument("--dry-run", action="store_true", help="Log what would be fetched without making requests")
    args = parser.parse_args()

    RAW.mkdir(parents=True, exist_ok=True)
    log("=== ingest_data.py run started ===")

    only = set(args.only.split(",")) if args.only else None
    targets = [d for d in DATASETS if only is None or d["id"] in only]
    if not targets:
        log(f"No datasets matched --only={args.only!r}")
        sys.exit(1)

    results = []
    for ds in targets:
        results.append(ingest_one(ds, dry_run=args.dry_run))
        time.sleep(0.2)  # be polite to the open-data CDN

    if not args.dry_run:
        write_report(results)
    counts = {s: sum(1 for r in results if r["status"] == s) for s in ("ok", "unchanged", "failed", "refused")}
    log(f"=== ingest_data.py run finished: {counts} ===\n")
    bad = counts["failed"] + counts["refused"]
    if bad:
        names = ", ".join(r["id"] for r in results if r["status"] in ("failed", "refused"))
        print(f"\n{bad} dataset(s) did not refresh - previous versions retained: {names}. See {REPORT_PATH.relative_to(ROOT)}.")
        # 2 = nothing worked (abort the pipeline); 3 = partial (the pipeline continues, the workflow raises an issue)
        sys.exit(2 if counts["ok"] + counts["unchanged"] == 0 else 3)


if __name__ == "__main__":
    main()
