"""
update_database.py — Orchestrates a full, safe refresh of the Malaysia
Health Equity Tracker's "database".

This project deliberately uses a static-JSON architecture rather than a live
database (see docs/METHODOLOGY.md and the Methodology page in the frontend
for the reasoning) — the app was built and delivered as a self-contained
static site with no backend, so there is no Postgres/Supabase instance to
migrate against. "Updating the database" therefore means: re-run the ETL
pipeline against freshly ingested raw data and republish the resulting
static JSON files that the frontend reads from `frontend/public/data/`.

This script exists so that filename matches the master project spec (which
asks for scripts/update_database.py regardless of backend architecture) and
so the whole refresh can be triggered as a single command, e.g. from the
GitHub Actions workflow at .github/workflows/update-data.yml.

Pipeline stages, each of which must succeed before the next runs:
  1. ingest_data.py   — refresh data/raw/ from source (skipped with --skip-ingest
                         for local dev, since it requires outbound internet
                         access to data.gov.my/DOSM/GitHub, which the original
                         sandboxed build session did not have unrestricted
                         access to)
  2. validate_data.py — regenerate data/validation_reports/*.md; this project
                         treats validation as advisory (it does not currently
                         hard-fail the pipeline on a validation warning), but
                         every report is logged and kept for review
  3. transform_data.py — rebuild data/processed/*.json from data/raw/
  4. sync step         — copy data/processed/* into frontend/public/data/,
                         the exact set of files the frontend's `useData()`
                         hook fetches at runtime

SAFETY: before overwriting frontend/public/data/, this script snapshots the
existing contents to frontend/public/data/.backup/ (last known good). If any
stage above fails, the sync step is skipped entirely and the previous
frontend/public/data/ contents are left exactly as they were — the live site
never ships a partial/broken update. Every run is logged to
data/processed/update_log.txt with a timestamp and pass/fail per stage.

Run: python3 scripts/update_database.py [--skip-ingest]
"""
from __future__ import annotations
import argparse
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
PROCESSED = ROOT / "data" / "processed"
FRONTEND_DATA = ROOT / "frontend" / "public" / "data"
FRONTEND_DATA_BACKUP = FRONTEND_DATA / ".backup"
LOG_PATH = PROCESSED / "update_log.txt"

# Files that live in data/processed/ and data/inventory/ and must be mirrored
# into frontend/public/data/ for the static site to serve them. Kept as an
# explicit list (rather than "copy everything") so a stray scratch file in
# data/processed/ never accidentally ships to production.
PUBLISHED_FILES = [
    ("data/processed/socioeconomic_national.json", "socioeconomic_national.json"),
    ("data/processed/socioeconomic_state.json", "socioeconomic_state.json"),
    ("data/processed/socioeconomic_district.json", "socioeconomic_district.json"),
    ("data/processed/population_state.json", "population_state.json"),
    ("data/processed/population_district.json", "population_district.json"),
    ("data/processed/healthcare_access_state.json", "healthcare_access_state.json"),
    ("data/processed/healthcare_access_national.json", "healthcare_access_national.json"),
    ("data/processed/healthcare_access_district_2022.json", "healthcare_access_district_2022.json"),
    ("data/processed/health_outcomes_state.json", "health_outcomes_state.json"),
    ("data/processed/immunisation_national.json", "immunisation_national.json"),
    ("data/processed/nutrition_national.json", "nutrition_national.json"),
    ("data/processed/geo_lookup.csv", "geo_lookup.csv"),
    ("data/processed/geo/state.geojson", "geo/state.geojson"),
    ("data/processed/geo/district.geojson", "geo/district.geojson"),
    ("data/inventory/dataset_inventory.json", "dataset_inventory.json"),
    ("data/processed/nhms_ncd_state.json", "nhms_ncd_state.json"),
    ("data/processed/nhms_ncd_national.json", "nhms_ncd_national.json"),
    ("data/processed/nhms_adolescent_mental_health_state.json", "nhms_adolescent_mental_health_state.json"),
    ("data/processed/nhms_adolescent_mental_health_national.json", "nhms_adolescent_mental_health_national.json"),
    ("data/processed/population_parlimen.json", "population_parlimen.json"),
    ("data/processed/population_dun.json", "population_dun.json"),
    ("data/processed/population_district_full.json", "population_district_full.json"),
    ("data/processed/hies_percentile_national.json", "hies_percentile_national.json"),
    ("data/processed/marriages_national.json", "marriages_national.json"),
    ("data/processed/marriages_state.json", "marriages_state.json"),
    ("data/processed/fertility_state.json", "fertility_state.json"),
    ("data/processed/health_programmes_state.json", "health_programmes_state.json"),
    ("data/processed/pekab40_screenings_daily_state.json", "pekab40_screenings_daily_state.json"),
    ("data/processed/covid_state.json", "covid_state.json"),
    ("data/processed/covid_national.json", "covid_national.json"),
    ("data/processed/mnha_national.json", "mnha_national.json"),
    ("data/processed/sanitation_access_state.json", "sanitation_access_state.json"),
    ("data/processed/sanitation_access_national.json", "sanitation_access_national.json"),
    ("data/processed/water_access_state.json", "water_access_state.json"),
    ("data/processed/water_access_national.json", "water_access_national.json"),
    ("data/processed/electricity_access_region.json", "electricity_access_region.json"),
    ("data/processed/nutrition_strata_national.json", "nutrition_strata_national.json"),
    ("data/processed/hiv_incidence_national.json", "hiv_incidence_national.json"),
    ("data/processed/deaths_ethnicity_state.json", "deaths_ethnicity_state.json"),
    ("data/processed/deaths_district_sex.json", "deaths_district_sex.json"),
    ("data/processed/births_district_sex.json", "births_district_sex.json"),
]


def log(msg: str):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    line = f"[{ts}] {msg}"
    print(line)
    PROCESSED.mkdir(parents=True, exist_ok=True)
    with open(LOG_PATH, "a") as f:
        f.write(line + "\n")


def run_stage(name: str, cmd: list[str]) -> bool:
    log(f"--- stage: {name} ---")
    log(f"  running: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    if result.stdout:
        log(f"  stdout (tail): {result.stdout[-2000:]}")
    if result.returncode != 0:
        log(f"  FAILED (exit code {result.returncode})")
        if result.stderr:
            log(f"  stderr (tail): {result.stderr[-2000:]}")
        return False
    log(f"  OK")
    return True


def backup_frontend_data():
    if FRONTEND_DATA_BACKUP.exists():
        shutil.rmtree(FRONTEND_DATA_BACKUP)
    FRONTEND_DATA_BACKUP.mkdir(parents=True, exist_ok=True)
    for src_rel, dest_rel in PUBLISHED_FILES:
        src = FRONTEND_DATA / dest_rel
        if src.exists():
            dest = FRONTEND_DATA_BACKUP / dest_rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dest)
    log(f"Backed up current frontend/public/data/ contents to {FRONTEND_DATA_BACKUP.relative_to(ROOT)}")


def restore_frontend_data():
    for src_rel, dest_rel in PUBLISHED_FILES:
        backup = FRONTEND_DATA_BACKUP / dest_rel
        dest = FRONTEND_DATA / dest_rel
        if backup.exists():
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(backup, dest)
    log("Restored frontend/public/data/ from backup — previous valid version retained.")


def sync_to_frontend() -> bool:
    log("--- stage: sync to frontend/public/data ---")
    missing = []
    for src_rel, dest_rel in PUBLISHED_FILES:
        src = ROOT / src_rel
        if not src.exists():
            missing.append(src_rel)
    if missing:
        log(f"  FAILED — expected output files missing after transform: {missing}")
        return False

    for src_rel, dest_rel in PUBLISHED_FILES:
        src = ROOT / src_rel
        dest = FRONTEND_DATA / dest_rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
    log(f"  OK — synced {len(PUBLISHED_FILES)} files into {FRONTEND_DATA.relative_to(ROOT)}")
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--skip-ingest", action="store_true",
                         help="Skip the ingest_data.py stage (use existing data/raw/ as-is)")
    args = parser.parse_args()

    log("=== update_database.py run started ===")
    backup_frontend_data()

    if not args.skip_ingest:
        if not run_stage("ingest_data.py", [sys.executable, str(SCRIPTS / "ingest_data.py")]):
            log("ABORTED after ingest failure. frontend/public/data/ left unchanged.")
            sys.exit(1)
    else:
        log("--skip-ingest set: using existing data/raw/ contents without refreshing from source")

    if not run_stage("validate_data.py", [sys.executable, str(SCRIPTS / "validate_data.py")]):
        log("WARNING: validation reporting failed to run, but this is advisory-only — continuing.")

    if not run_stage("transform_data.py", [sys.executable, str(SCRIPTS / "transform_data.py")]):
        log("ABORTED after transform failure. frontend/public/data/ left unchanged (previous valid version retained).")
        sys.exit(1)

    if not sync_to_frontend():
        log("ABORTED after sync failure. Restoring previous valid frontend/public/data/ contents.")
        restore_frontend_data()
        sys.exit(1)

    log("=== update_database.py run finished successfully ===\n")


if __name__ == "__main__":
    main()
