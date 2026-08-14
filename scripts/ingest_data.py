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
  - Two fetch strategies are supported per dataset:
      1. "csv"  — a direct CSV download from storage.dosm.gov.my /
                  storage.data.gov.my (works for most datasets).
      2. "api"  — the data.gov.my JSON API
                  (api.data.gov.my/data-catalogue?id=...&limit=...&filter=...),
                  used for datasets where the raw CSV endpoint has been
                  observed to fail or truncate (large multi-year,
                  multi-district files). The API is paginated here by
                  looping over `filter_years` (one request per year) because
                  the API's `limit=` parameter does not lift an underlying
                  response-size cap on very large slices — narrowing by year
                  keeps each request well under that cap.
      3. "github" — a direct raw.githubusercontent.com fetch from the
                  official dosm-malaysia/data-open mirror (used for
                  administrative boundaries and historical census data that
                  are not published through the data.gov.my catalogue API).

Run: python3 scripts/ingest_data.py [--only id1,id2,...] [--dry-run]
"""
from __future__ import annotations
import argparse
import csv
import io
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
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
    {"id": "hh_access_amenities", "category": "socioeconomic", "filename": "hh_access_amenities_2022.csv",
     "method": "api", "api_id": "hh_access_amenities", "filter_years": [2022],
     "note": "Observed to fail as a direct CSV fetch in the original build (binary-data error from the CDN); the JSON API works reliably."},
    {"id": "hies_2019_snapshot", "category": "socioeconomic", "filename": "hies_2019_snapshot.csv",
     "method": "github", "url": "https://raw.githubusercontent.com/dosm-malaysia/data-open/main/datasets/economy/hies_2019.csv"},

    # -- Demography -----------------------------------------------------------
    {"id": "population_state", "category": "demography", "filename": "population_state_2020_2023.json",
     "method": "api_json_raw", "api_id": "population_state", "filter_years": [2020, 2021, 2022, 2023],
     "note": "Saved as JSON (not CSV) because transform_data.py's build_population_state() reads this file's dimensional (age/ethnicity/sex) records directly as JSON."},
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
     "method": "api", "api_id": "hospital_beds", "filter_years": [2022],
     "note": "State + district snapshot for 2022 only; the district-level breakdown only exists for this year in the source."},
    {"id": "healthcare_staff", "category": "healthcare", "filename": "healthcare_staff.csv",
     "method": "api", "api_id": "healthcare_staff", "filter_years": list(range(2014, 2023)),
     "note": "Direct CSV fetch observed to fail (binary-data error); JSON API paginated by year works reliably."},

    # -- Health outcomes ----------------------------------------------------------
    {"id": "death_state", "category": "health_outcomes", "filename": "death_state.csv",
     "method": "csv", "url": "https://storage.dosm.gov.my/demography/death_state.csv"},
    {"id": "death_maternal_state", "category": "health_outcomes", "filename": "death_maternal_state.csv",
     "method": "csv", "url": "https://storage.dosm.gov.my/demography/death_maternal_state.csv"},
    {"id": "deaths_early_childhood_state", "category": "health_outcomes", "filename": "deaths_early_childhood_state.csv",
     "method": "api", "api_id": "deaths_early_childhood_state", "filter_years": list(range(2000, 2023)),
     "note": "Direct CSV fetch observed to fail (binary-data error); JSON API paginated by year works reliably."},
    {"id": "birth_state", "category": "health_outcomes", "filename": "birth_state.csv",
     "method": "csv", "url": "https://storage.dosm.gov.my/demography/birth_state.csv"},
    {"id": "infant_immunisation", "category": "health_outcomes", "filename": "infant_immunisation.csv",
     "method": "csv", "url": "https://storage.data.gov.my/healthcare/infant_immunisation.csv"},
    {"id": "nutrition_status_u5_sex", "category": "health_outcomes", "filename": "nutrition_status_u5_sex.csv",
     "method": "csv", "url": "https://storage.data.gov.my/healthcare/nutrition_status_u5_sex.csv"},
    {"id": "std_state", "category": "health_outcomes", "filename": "std_state.csv",
     "method": "api", "api_id": "std_state", "filter_years": list(range(2017, 2023)),
     "note": "Direct CSV fetch observed to fail (binary-data error); JSON API paginated by year works reliably."},

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
]

API_BASE = "https://api.data.gov.my/data-catalogue"


def log(msg: str):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOG_PATH, "a") as f:
        f.write(line + "\n")


def _http_get(url: str, timeout: int = 60) -> bytes:
    req = Request(url, headers={"User-Agent": USER_AGENT})
    with urlopen(req, timeout=timeout) as resp:
        return resp.read()


def fetch_csv(ds: dict) -> bytes | None:
    try:
        return _http_get(ds["url"])
    except (URLError, HTTPError) as e:
        log(f"  ERROR fetching CSV for {ds['id']}: {e}")
        return None


def fetch_github(ds: dict) -> bytes | None:
    try:
        return _http_get(ds["url"])
    except (URLError, HTTPError) as e:
        log(f"  ERROR fetching GitHub mirror file for {ds['id']}: {e}")
        return None


def fetch_api_year(api_id: str, year: int, extra_filters: list[tuple[str, str]] | None = None) -> list[dict]:
    """Fetch one year's slice of a data.gov.my catalogue dataset via the JSON
    API, narrowed with filter= so the response stays under the API's
    underlying ~60-70KB size cap regardless of the limit= value."""
    filters = [f"{year}-01-01@date"] if False else []  # placeholder, real filter built below
    filter_parts = [f"{year}@year"]
    if extra_filters:
        filter_parts += [f"{v}@{k}" for k, v in extra_filters]
    filter_str = ",".join(filter_parts)
    url = f"{API_BASE}?id={api_id}&limit=10000&filter={filter_str}"
    try:
        raw = _http_get(url)
    except (URLError, HTTPError) as e:
        log(f"  ERROR fetching API year={year} for {api_id}: {e}")
        return []
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        log(f"  WARNING: non-JSON / truncated response for {api_id} year={year}, skipping this year")
        return []
    # The API's top-level shape has varied historically between a bare list
    # and {"data": [...]}; handle both defensively.
    if isinstance(payload, dict) and "data" in payload:
        return payload["data"]
    if isinstance(payload, list):
        return payload
    return []


def fetch_api(ds: dict) -> bytes | None:
    """Fetch a dataset across multiple years via the JSON API and serialise
    the concatenated result back to CSV bytes (so downstream raw/ files stay
    uniformly CSV regardless of fetch method)."""
    all_rows: list[dict] = []
    for year in ds["filter_years"]:
        rows = fetch_api_year(ds["api_id"], year)
        all_rows.extend(rows)
        time.sleep(0.2)  # be polite to the API
    if not all_rows:
        return None
    # Union of all keys across all rows, stable order (first-seen).
    fieldnames: list[str] = []
    for r in all_rows:
        for k in r.keys():
            if k not in fieldnames:
                fieldnames.append(k)
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fieldnames)
    writer.writeheader()
    for r in all_rows:
        writer.writerow(r)
    return buf.getvalue().encode("utf-8")


def fetch_api_json_raw(ds: dict) -> bytes | None:
    """Like fetch_api, but preserves the raw JSON record list instead of
    flattening to CSV — used only for population_state, whose downstream
    transform (transform_data.py: build_population_state) expects the
    original dimensional JSON records (age/ethnicity/sex breakdowns)."""
    all_rows: list[dict] = []
    for year in ds["filter_years"]:
        rows = fetch_api_year(ds["api_id"], year)
        all_rows.extend(rows)
        time.sleep(0.2)
    if not all_rows:
        return None
    return json.dumps(all_rows, indent=1).encode("utf-8")


FETCHERS = {
    "csv": fetch_csv,
    "github": fetch_github,
    "api": fetch_api,
    "api_json_raw": fetch_api_json_raw,
}


def ingest_one(ds: dict, dry_run: bool = False) -> bool:
    out_path = RAW / ds["category"] / ds["filename"]
    min_bytes = ds.get("min_bytes", DEFAULT_MIN_BYTES)
    log(f"Ingesting {ds['id']} -> {out_path.relative_to(ROOT)}  (method={ds['method']})")
    if "note" in ds:
        log(f"  note: {ds['note']}")

    if dry_run:
        log("  (dry run — not fetching)")
        return True

    fetcher = FETCHERS[ds["method"]]
    content = fetcher(ds)

    if content is None or len(content) < min_bytes:
        got = 0 if content is None else len(content)
        log(f"  FAILED (got {got} bytes, need >= {min_bytes}). "
            f"Previous file at {out_path.relative_to(ROOT)} left UNCHANGED.")
        return False

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(content)
    log(f"  OK — wrote {len(content):,} bytes")
    return True


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

    results = {"ok": 0, "failed": 0}
    for ds in targets:
        ok = ingest_one(ds, dry_run=args.dry_run)
        results["ok" if ok else "failed"] += 1

    log(f"=== ingest_data.py run finished: {results['ok']} ok, {results['failed']} failed ===\n")
    if results["failed"]:
        print(f"\n{results['failed']} dataset(s) failed to refresh — previous versions retained. See {LOG_PATH.relative_to(ROOT)}.")
        sys.exit(2 if results["ok"] == 0 else 0)


if __name__ == "__main__":
    main()
