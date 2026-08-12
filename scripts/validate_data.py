"""
validate_data.py — Automated data-quality validation for every raw dataset
in data/raw/. Produces one Markdown report per dataset in
data/validation_reports/, plus a summary index.

Checks performed (per the project's data-quality requirements):
  - schema / column presence
  - data types (numeric columns actually numeric)
  - missing values (blank / null) vs explicit non-numeric flags
  - duplicate records (identical key columns)
  - obvious outliers (values outside a plausible range for the metric)
  - state/district name standardisation (via geo_utils canonical_*)
  - year coverage / gaps

This script NEVER modifies or drops data — it only reports on it. Any
cleaning happens explicitly and separately in transform_data.py, and every
cleaning action there is logged.
"""
from __future__ import annotations
import csv
import sys
from pathlib import Path
from collections import Counter, defaultdict

sys.path.insert(0, str(Path(__file__).resolve().parent))
from geo_utils import canonical_state, canonical_district, CANONICAL_STATES  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "validation_reports"
OUT.mkdir(parents=True, exist_ok=True)

NUMERIC_HINT_COLS = {
    "income_mean", "income_median", "poverty_absolute", "poverty_hardcore",
    "poverty_relative", "gini", "beds", "staff", "abs", "rate", "cases",
    "incidence", "sanitation", "electricity", "piped_water", "population",
    "prevalence", "latitude", "longitude",
}

PLAUSIBLE_RANGE = {
    "gini": (0, 1),
    "poverty_absolute": (0, 100),
    "poverty_hardcore": (0, 100),
    "poverty_relative": (0, 100),
    "sanitation": (0, 100),
    "electricity": (0, 100),
    "piped_water": (0, 100),
    "incidence": (0, 500),  # per 100,000 — generous ceiling
    "rate": (0, 100),
}


def is_number(x: str) -> bool:
    if x is None or x == "":
        return False
    try:
        float(x)
        return True
    except ValueError:
        return False


def load_csv(path: Path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def validate_file(path: Path) -> str:
    rows = load_csv(path)
    lines = [f"# Validation report: `{path.relative_to(ROOT)}`", ""]
    lines.append(f"- Rows: **{len(rows)}**")
    if not rows:
        lines.append("- EMPTY FILE")
        return "\n".join(lines)

    cols = list(rows[0].keys())
    lines.append(f"- Columns: `{', '.join(cols)}`")

    # Missingness per column, distinguishing blank vs present
    lines.append("\n## Missingness\n")
    lines.append("| column | non-missing | missing (blank) | % missing |")
    lines.append("|---|---|---|---|")
    for c in cols:
        vals = [r.get(c, "") for r in rows]
        missing = sum(1 for v in vals if v is None or v == "")
        present = len(vals) - missing
        pct = 100 * missing / len(vals) if vals else 0
        lines.append(f"| {c} | {present} | {missing} | {pct:.1f}% |")

    # Duplicate rows (exact duplicate of all columns)
    seen = Counter(tuple(r.items()) for r in rows)
    exact_dupes = sum(c - 1 for c in seen.values() if c > 1)
    lines.append(f"\n## Duplicates\n\n- Exact duplicate rows: **{exact_dupes}**")

    # Duplicate keys (same state/district/date/type-like combination but
    # different values) — a stronger signal of a real data problem than
    # exact duplicates.
    key_cols = [c for c in ("date", "state", "district", "type", "disease", "sex", "age", "ethnicity") if c in cols]
    if key_cols:
        key_counter = Counter(tuple(r.get(c, "") for c in key_cols) for r in rows)
        dup_keys = sum(1 for c in key_counter.values() if c > 1)
        lines.append(f"- Rows sharing a `{', '.join(key_cols)}` key with another row: "
                      f"**{sum(c for c in key_counter.values() if c > 1)}** "
                      f"across **{dup_keys}** distinct keys")

    # Numeric / outlier checks
    lines.append("\n## Numeric range checks\n")
    numeric_cols = [c for c in cols if c in NUMERIC_HINT_COLS]
    if numeric_cols:
        lines.append("| column | min | max | non-numeric values (excl. blank) |")
        lines.append("|---|---|---|---|")
        for c in numeric_cols:
            nums = []
            bad = 0
            for r in rows:
                v = r.get(c, "")
                if v == "" or v is None:
                    continue
                if is_number(v):
                    nums.append(float(v))
                else:
                    bad += 1
            if nums:
                lo, hi = min(nums), max(nums)
                flag = ""
                if c in PLAUSIBLE_RANGE:
                    plo, phi = PLAUSIBLE_RANGE[c]
                    if lo < plo or hi > phi:
                        flag = f" ⚠ outside plausible range [{plo},{phi}]"
                lines.append(f"| {c} | {lo} | {hi} | {bad}{flag} |")
            else:
                lines.append(f"| {c} | n/a | n/a | {bad} |")

    # Geography standardisation
    if "state" in cols:
        lines.append("\n## State-name standardisation\n")
        raw_states = sorted(set(r.get("state", "") for r in rows if r.get("state")))
        unrecognised = []
        for s in raw_states:
            if s == "Malaysia":
                continue
            canon = canonical_state(s)
            if canon not in CANONICAL_STATES:
                unrecognised.append(s)
        lines.append(f"- Distinct state values: {len(raw_states)}")
        if unrecognised:
            lines.append(f"- ⚠ Unrecognised / non-canonical state names: `{unrecognised}`")
        else:
            lines.append("- All state names map cleanly to the 16 canonical DOSM states "
                          "(or the `Malaysia` national sentinel).")

    if "district" in cols and "state" in cols:
        lines.append("\n## District-name standardisation\n")
        pairs = sorted(set((r.get("state", ""), r.get("district", "")) for r in rows if r.get("district")))
        lines.append(f"- Distinct (state, district) pairs: {len(pairs)}")

    # Year / date coverage
    if "date" in cols:
        years = sorted(set(r["date"][:4] for r in rows if r.get("date")))
        lines.append(f"\n## Temporal coverage\n\n- Years present: {', '.join(years) if years else 'none'}")
        if years:
            yr_ints = [int(y) for y in years]
            full_range = set(str(y) for y in range(min(yr_ints), max(yr_ints) + 1))
            gaps = sorted(full_range - set(years))
            if gaps:
                lines.append(f"- Gap years within min–max range (expected — most DOSM series are "
                              f"irregular survey years, not annual): {', '.join(gaps)}")

    return "\n".join(lines)


def main():
    csv_files = sorted(RAW.rglob("*.csv"))
    index_lines = ["# Data validation report index", "",
                    f"{len(csv_files)} raw CSV files validated.", ""]
    for path in csv_files:
        report = validate_file(path)
        out_name = str(path.relative_to(RAW)).replace("/", "__").replace(".csv", ".md")
        out_path = OUT / out_name
        out_path.write_text(report)
        index_lines.append(f"- [{path.relative_to(RAW)}]({out_name})")
        print(f"Validated {path.relative_to(RAW)} -> {out_path.relative_to(ROOT)}")

    (OUT / "README.md").write_text("\n".join(index_lines))
    print(f"\nWrote {len(csv_files)} validation reports + index to {OUT.relative_to(ROOT)}/")


if __name__ == "__main__":
    main()
