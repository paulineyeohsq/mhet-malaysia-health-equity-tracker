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
data/processed/update_log.txt with a timestamp and pass/fail per stage. That
file is committed (not git-ignored) on purpose: the monthly workflow's pull
request then shows exactly what its run did, which is what the PR text asks
reviewers to read.

After a successful transform, two small bookkeeping steps keep metadata from
going stale (both before the sync, so the published copy is current):
  - stamp_inventory_refresh(): writes today's date to `last_refreshed` in
    data/inventory/dataset_inventory.json (shown on the Overview/Methodology)
  - stamp_data_years(): writes the latest year of data in each published JSON file
    to `data_files` in the inventory, which the app shows as "data as of" per page.
  - stamp_source_status(): copies what each publisher says about its own dataset
    (data_as_of / last_updated / next_update, collected by ingest_data.py) into `source_status` in
    the inventory, so the app can say "the publisher has not released anything newer" rather than
    looking out of date
  - sync_doc_counts(): rewrites the dataset counts in README.md and
    docs/DATA_SOURCES.md from that same inventory

Unattended use (the scheduled workflow): ingest may exit 3 ("some datasets kept their previous file"),
which is not fatal - the previous file is a valid, older version. After syncing, write_update_summary()
compares the new published files with the previous ones and writes data/processed/update_summary.json:
which files changed, any anomaly (a file lost more than 10% of its rows, its latest year went backwards,
a dataset failed to refresh) and `needs_review`. The workflow publishes straight to main only when
`needs_review` is false; otherwise it opens a pull request for a human instead.

Run: python3 scripts/update_database.py [--skip-ingest]
"""
from __future__ import annotations
import argparse
import json
import re
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
INVENTORY_PATH = ROOT / "data" / "inventory" / "dataset_inventory.json"
DOC_COUNT_FILES = [ROOT / "README.md", ROOT / "docs" / "DATA_SOURCES.md"]

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
    ("data/processed/population_parlimen_latest.json", "population_parlimen_latest.json"),
    ("data/processed/population_dun_latest.json", "population_dun_latest.json"),
    ("data/processed/population_district_full.json", "population_district_full.json"),
    ("data/processed/hies_percentile_national.json", "hies_percentile_national.json"),
    ("data/processed/marriages_national.json", "marriages_national.json"),
    ("data/processed/marriages_state.json", "marriages_state.json"),
    ("data/processed/fertility_state.json", "fertility_state.json"),
    ("data/processed/health_programmes_state.json", "health_programmes_state.json"),
    ("data/processed/pekab40_screenings_daily_state.json", "pekab40_screenings_daily_state.json"),
    ("data/processed/pekab40_screenings_weekly_state.json", "pekab40_screenings_weekly_state.json"),
    ("data/processed/covid_state.json", "covid_state.json"),
    ("data/processed/covid_national.json", "covid_national.json"),
    ("data/processed/mnha_national.json", "mnha_national.json"),
    ("data/processed/sanitation_access_state.json", "sanitation_access_state.json"),
    ("data/processed/sanitation_access_national.json", "sanitation_access_national.json"),
    ("data/processed/water_access_state.json", "water_access_state.json"),
    ("data/processed/water_access_national.json", "water_access_national.json"),
    ("data/processed/electricity_access_region.json", "electricity_access_region.json"),
    ("data/processed/nutrition_strata_national.json", "nutrition_strata_national.json"),
    ("data/processed/air_pollution_national.json", "air_pollution_national.json"),
    ("data/processed/electricity_consumption_national.json", "electricity_consumption_national.json"),
    ("data/processed/electricity_supply_national.json", "electricity_supply_national.json"),
    ("data/processed/forest_reserve_national.json", "forest_reserve_national.json"),
    ("data/processed/forest_reserve_state.json", "forest_reserve_state.json"),
    ("data/processed/ghg_emissions_national.json", "ghg_emissions_national.json"),
    ("data/processed/water_consumption_state.json", "water_consumption_state.json"),
    ("data/processed/water_pollution_basin_national.json", "water_pollution_basin_national.json"),
    ("data/processed/water_production_state.json", "water_production_state.json"),
    ("data/processed/hiv_incidence_national.json", "hiv_incidence_national.json"),
    ("data/processed/deaths_ethnicity_state.json", "deaths_ethnicity_state.json"),
    ("data/processed/deaths_district_sex.json", "deaths_district_sex.json"),
    ("data/processed/births_district_sex.json", "births_district_sex.json"),
    ("data/processed/life_expectancy_state.json", "life_expectancy_state.json"),
    ("data/processed/life_expectancy_national.json", "life_expectancy_national.json"),
]


def log(msg: str):
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    line = f"[{ts}] {msg}"
    print(line)
    PROCESSED.mkdir(parents=True, exist_ok=True)
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def run_stage(name: str, cmd: list[str], ok_codes: tuple[int, ...] = (0,)) -> bool:
    log(f"--- stage: {name} ---")
    log(f"  running: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    if result.stdout:
        log(f"  stdout (tail): {result.stdout[-2000:]}")
    if result.returncode in ok_codes and result.returncode != 0:
        log(f"  OK with warnings (exit code {result.returncode}): see data/raw/ingest_report.json")
        return True
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


def _read_exact(path: Path) -> str:
    """Read text WITHOUT newline translation, so a later write puts back the
    file's own line endings (Path.read_text/write_text would convert LF files
    to CRLF on Windows and turn a one-line edit into a whole-file diff)."""
    with open(path, encoding="utf-8", newline="") as f:
        return f.read()


def _write_exact(path: Path, text: str) -> None:
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(text)


def inventory_counts(inventory_path: Path = INVENTORY_PATH) -> dict[str, int]:
    """Dataset counts, computed the same way the frontend does (lib/inventoryMap.ts
    inventoryCounts): ingested = status "ingested"; reference-only = status
    "ingested_reference_only"; not ingested = everything in the separate
    identified_but_not_yet_ingested list PLUS any dataset entry whose own status
    is "identified_not_ingested" (none at present)."""
    inv = json.loads(_read_exact(inventory_path))
    datasets = inv["datasets"]
    return {
        "ingested": sum(1 for d in datasets if d.get("status") == "ingested"),
        "reference": sum(1 for d in datasets if d.get("status") == "ingested_reference_only"),
        "notingested": len(inv.get("identified_but_not_yet_ingested", []))
        + sum(1 for d in datasets if d.get("status") == "identified_not_ingested"),
    }


def stamp_inventory_refresh(today: str | None = None, inventory_path: Path = INVENTORY_PATH) -> str:
    """Set `last_refreshed` (a date) in the inventory, right after `generated`.

    `generated` is when the catalogue itself was authored; `last_refreshed` is
    when the pipeline last successfully rebuilt the data from source, which is
    the date users actually care about. Done with a targeted text edit rather
    than load/dump so the rest of the file's formatting (and the git diff) is
    untouched."""
    today = today or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    text = _read_exact(inventory_path)
    nl = "\r\n" if "\r\n" in text else "\n"
    if re.search(r'"last_refreshed":\s*"[^"]*"', text):
        text = re.sub(r'("last_refreshed":\s*")[^"]*(")', rf"\g<1>{today}\g<2>", text, count=1)
    else:
        text, n = re.subn(r'("generated":\s*"[^"]*",?)', rf'\1{nl}  "last_refreshed": "{today}",', text, count=1)
        assert n == 1, "could not find the `generated` field to stamp after"
    json.loads(text)  # refuse to write anything that is not valid JSON
    _write_exact(inventory_path, text)
    return today


def latest_data_year(path: Path) -> int | None:
    """Latest year that has at least one real numeric value in a processed JSON file (None if undeterminable).

    Rows are keyed by `year`, or by a `date` string starting with the year (daily/monthly files). A row whose
    only content is the year (no number at all) does not count, so an empty future-year placeholder never
    advances "data as of"."""
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        return None
    best: int | None = None
    for row in data:
        if not isinstance(row, dict):
            continue
        year = row.get("year")
        if year is None and row.get("date"):
            m = re.match(r"(\d{4})", str(row["date"]))
            year = int(m.group(1)) if m else None
        try:
            year = int(year)
        except (TypeError, ValueError):
            continue
        if any(isinstance(v, (int, float)) and not isinstance(v, bool) for k, v in row.items() if k != "year"):
            best = year if best is None else max(best, year)
    return best


def stamp_data_years(
    processed_dir: Path = PROCESSED, inventory_path: Path = INVENTORY_PATH, published=None
) -> dict[str, int]:
    """Write `data_files` ({published file name: latest data year}) into the inventory, after `last_refreshed`.

    The free-text `date_range` fields in the inventory are hand-written and can lag the data (death_state says
    2000-2022 while the file runs to 2024), so the app's "data as of" line uses these computed years instead.
    Targeted text edit, like stamp_inventory_refresh, so the rest of the file's formatting is untouched."""
    published = PUBLISHED_FILES if published is None else published
    years: dict[str, int] = {}
    for src_rel, dest_rel in published:
        if not dest_rel.endswith(".json") or dest_rel.startswith("geo/") or dest_rel == "dataset_inventory.json":
            continue
        src = ROOT / src_rel
        if processed_dir != PROCESSED:
            src = processed_dir / Path(src_rel).name
        if not src.exists():
            continue
        y = latest_data_year(src)
        if y is not None:
            years[dest_rel] = y
    years = dict(sorted(years.items()))
    text = _read_exact(inventory_path)
    nl = "\r\n" if "\r\n" in text else "\n"
    block = '"data_files": {' + nl + ",".join(f'{nl}    "{k}": {v}' for k, v in years.items()) + nl + "  },"
    if re.search(r'"data_files":\s*\{[^{}]*\},?', text):
        text = re.sub(r'"data_files":\s*\{[^{}]*\},?', lambda m: block, text, count=1)
    else:
        text, n = re.subn(r'("last_refreshed":\s*"[^"]*",?)', lambda m: m.group(1) + nl + "  " + block, text, count=1)
        assert n == 1, "could not find the `last_refreshed` field to stamp after"
    json.loads(text)  # refuse to write anything that is not valid JSON
    _write_exact(inventory_path, text)
    return years


def _stamp_block(text: str, key: str, obj: dict, after_key: str) -> str:
    """Insert or replace a top-level `"key": {...},` block (one entry per line, values are flat) in the
    inventory text, directly after `after_key`, without re-serialising the rest of the file."""
    nl = "\r\n" if "\r\n" in text else "\n"
    lines = [f'    {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}' for k, v in obj.items()]
    block = f'"{key}": {{' + nl + ("," + nl).join(lines) + nl + "  },"
    pattern = rf'"{key}":\s*\{{(?:[^{{}}]|\{{[^{{}}]*\}})*\}},?'
    if re.search(pattern, text):
        return re.sub(pattern, lambda m: block, text, count=1)
    new, n = re.subn(rf'("{after_key}":\s*(?:"[^"]*"|\{{(?:[^{{}}]|\{{[^{{}}]*\}})*\}}),?)', lambda m: m.group(1) + nl + "  " + block, text, count=1)
    assert n == 1, f"could not find `{after_key}` to stamp `{key}` after"
    return new


def stamp_source_status(report_path: Path = ROOT / "data" / "raw" / "ingest_report.json", inventory_path: Path = INVENTORY_PATH) -> int:
    """Write `source_status` ({dataset id: what the publisher says}) into the inventory from the ingest report."""
    if not report_path.exists():
        return 0
    report = json.loads(report_path.read_text(encoding="utf-8"))
    status: dict[str, dict] = {}
    for r in report.get("results", []):
        src = r.get("source")
        if src:
            status[r["id"]] = src
    if not status:
        return 0
    text = _stamp_block(_read_exact(inventory_path), "source_status", dict(sorted(status.items())), "data_files")
    json.loads(text)  # refuse to write anything that is not valid JSON
    _write_exact(inventory_path, text)
    return len(status)


SUMMARY_PATH = PROCESSED / "update_summary.json"
MAX_ROW_LOSS = 0.10  # a published file with >10% fewer rows than before is an anomaly


def _row_count(path: Path) -> int | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return len(data) if isinstance(data, list) else None
    except Exception:  # noqa: BLE001
        return None


def write_update_summary() -> dict:
    """Compare the freshly built published files with the previous ones (the .backup snapshot taken at the start
    of the run) and write data/processed/update_summary.json. `needs_review` is true when anything looks wrong,
    which makes the unattended workflow open a pull request instead of publishing."""
    changed, anomalies = [], []
    for _src_rel, dest_rel in PUBLISHED_FILES:
        new_path, old_path = FRONTEND_DATA / dest_rel, FRONTEND_DATA_BACKUP / dest_rel
        if not new_path.exists():
            anomalies.append(f"{dest_rel}: missing after the refresh")
            continue
        if not old_path.exists():
            changed.append({"file": dest_rel, "note": "new file"})
            continue
        if new_path.read_bytes() == old_path.read_bytes():
            continue
        entry: dict = {"file": dest_rel}
        if dest_rel.endswith(".json") and dest_rel != "dataset_inventory.json" and not dest_rel.startswith("geo/"):
            before_rows, after_rows = _row_count(old_path), _row_count(new_path)
            before_year, after_year = latest_data_year(old_path), latest_data_year(new_path)
            entry.update(rows_before=before_rows, rows_after=after_rows, latest_year_before=before_year, latest_year_after=after_year)
            if before_rows and after_rows is not None and after_rows < before_rows * (1 - MAX_ROW_LOSS):
                anomalies.append(f"{dest_rel}: rows fell from {before_rows} to {after_rows}")
            if before_year and after_year and after_year < before_year:
                anomalies.append(f"{dest_rel}: latest data year went backwards ({before_year} to {after_year})")
        changed.append(entry)

    report_path = ROOT / "data" / "raw" / "ingest_report.json"
    not_refreshed: list[str] = []
    if report_path.exists():
        for r in json.loads(report_path.read_text(encoding="utf-8")).get("results", []):
            if r.get("status") in ("failed", "refused"):
                not_refreshed.append(f"{r['id']}: {r.get('error', r['status'])}")
    anomalies += [f"not refreshed - {x}" for x in not_refreshed]

    summary = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "changed_files": changed,
        "anomalies": anomalies,
        "needs_review": bool(anomalies),
    }
    SUMMARY_PATH.write_text(json.dumps(summary, indent=1) + "\n", encoding="utf-8")
    log(f"Update summary: {len(changed)} file(s) changed, {len(anomalies)} anomaly(ies), needs_review={summary['needs_review']}")
    for a in anomalies:
        log(f"  anomaly: {a}")
    return summary


COUNT_MARKER = re.compile(r"(<!--count:(ingested|reference|notingested)-->)[^<]*(<!--/count-->)")


def sync_doc_counts(files: list[Path] = DOC_COUNT_FILES, inventory_path: Path = INVENTORY_PATH) -> dict[str, int]:
    """Rewrite every `<!--count:KEY-->N<!--/count-->` span in the docs from the inventory."""
    counts = inventory_counts(inventory_path)
    for f in files:
        text = _read_exact(f)
        new = COUNT_MARKER.sub(lambda m: f"{m.group(1)}{counts[m.group(2)]}{m.group(3)}", text)
        if new != text:
            _write_exact(f, new)
    return counts


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
        # exit 3 = some datasets kept their previous (older but valid) file; only "nothing fetched" aborts.
        if not run_stage("ingest_data.py", [sys.executable, str(SCRIPTS / "ingest_data.py")], ok_codes=(0, 3)):
            log("ABORTED after ingest failure. frontend/public/data/ left unchanged.")
            sys.exit(1)
    else:
        log("--skip-ingest set: using existing data/raw/ contents without refreshing from source")

    if not run_stage("validate_data.py", [sys.executable, str(SCRIPTS / "validate_data.py")]):
        log("WARNING: validation reporting failed to run, but this is advisory-only — continuing.")

    if not run_stage("transform_data.py", [sys.executable, str(SCRIPTS / "transform_data.py")]):
        log("ABORTED after transform failure. frontend/public/data/ left unchanged (previous valid version retained).")
        sys.exit(1)

    try:
        log(f"Stamped dataset_inventory.json last_refreshed = {stamp_inventory_refresh()}")
        log(f"Stamped dataset_inventory.json data_files for {len(stamp_data_years())} files")
        log(f"Stamped dataset_inventory.json source_status for {stamp_source_status()} datasets")
        log(f"Synced dataset counts into README/docs: {sync_doc_counts()}")
    except Exception as e:  # bookkeeping must never block publishing refreshed data
        log(f"WARNING: metadata bookkeeping failed ({e!r}) - continuing without it.")

    if not sync_to_frontend():
        log("ABORTED after sync failure. Restoring previous valid frontend/public/data/ contents.")
        restore_frontend_data()
        sys.exit(1)

    try:
        write_update_summary()
    except Exception as e:  # noqa: BLE001 - the summary is advisory for the workflow, never a reason to undo a good refresh
        log(f"WARNING: could not write update_summary.json ({e!r})")

    log("=== update_database.py run finished successfully ===\n")


if __name__ == "__main__":
    main()
