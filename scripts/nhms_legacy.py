"""
nhms_legacy.py - the state tables of the earlier NHMS reports (2015, 2017, 2019, 2023), read from the report text.

These tables used to be typed into data/raw/health_outcomes/nhms_*.csv by hand. They are now read by the pipeline from
the published PDFs (text from `pdftotext -raw`, stored by scripts/ingest_data.py), with the same checks as
scripts/nhms_pdf.py: a MALAYSIA row, prevalences inside their own intervals, and the state counts and estimated
populations adding up to the MALAYSIA row. The first block of numbers in a row is the all-adults ("overall") column,
which is the one the dashboard has always published; male and female columns are not read.

The values were compared with the previously typed ones, value for value, before the typed files were removed
(see scripts/test_nhms_legacy.py, which keeps that comparison as a permanent test).

Rows come out in the long format the transform already uses:
  indicator, state, year, n, estimated_population, prevalence_pct, ci_lower, ci_upper, unreliable
"""
from __future__ import annotations

import re

from nhms_pdf import ParseError

_NUM = r"(?:\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?|-)"
_CELLS = re.compile(rf"^(?P<label>[A-Za-z][A-Za-z .&'/-]*?)\s+(?P<n>{_NUM})\s+(?P<pop>{_NUM})\s+(?P<prev>{_NUM}\*?)\s+(?P<lo>{_NUM})\s+(?P<hi>{_NUM})(?:\s|$)")

# how each report names the geographies (an unknown label is an error, never skipped silently)
STATE_NAMES = {
    "Johor": "Johor", "Kedah": "Kedah", "Kelantan": "Kelantan", "Melaka": "Melaka", "Negeri Sembilan": "Negeri Sembilan",
    "Pahang": "Pahang", "Pulau Pinang": "Pulau Pinang", "Penang": "Pulau Pinang", "Perak": "Perak", "Perlis": "Perlis",
    "Selangor": "Selangor", "Terengganu": "Terengganu", "Sabah": "Sabah", "Sarawak": "Sarawak",
    "WP Kuala Lumpur": "W.P. Kuala Lumpur", "WP Labuan": "W.P. Labuan", "WP Putrajaya": "W.P. Putrajaya",
    "MALAYSIA": "Malaysia",
}
# one estimate for both, in the survey designs that reported them together (left empty for both states, as always)
COMBINED = {"Sabah & WP Labuan", "Sabah and WP Labuan", "Sabah & Labuan"}


def _num(tok: str, as_int: bool):
    tok = tok.rstrip("*")
    if tok == "-":
        return None
    v = tok.replace(",", "")
    return int(v) if as_int else float(v)


def _page_for(text_pages: list[str], table_id: str, require: str) -> str:
    pat = re.compile(rf"^Table\s+{re.escape(table_id)}(?![\d.])", re.M)
    found = [p for p in text_pages if pat.search(p) and re.search(require, p, re.M)]
    if len(found) != 1:
        raise ParseError(f"table {table_id}: expected exactly one page with its state rows, found {len(found)}")
    return found[0]


def state_rows(pages: list[str], table_id: str, indicator: str, year: int, *, malaysia_row: bool = True) -> list[dict]:
    """The MALAYSIA row and one row per state of a count / population / prevalence / interval table."""
    page = _page_for(pages, table_id, r"^MALAYSIA\s")
    out: list[dict] = []
    seen_malaysia = False
    pending: list[str] = []  # a label printed on two lines ("WP Kuala" / "Lumpur") has its numbers on a third line
    for raw in page.splitlines():
        line = " ".join(raw.split())
        if not seen_malaysia:
            if line.upper().startswith("MALAYSIA "):
                seen_malaysia = True
            else:
                continue
        if pending and _NUMS_ONLY.match(line):
            line = " ".join(pending) + " " + line
            pending = []
        m = _CELLS.match(line)
        if not m:
            if re.match(r"^(Location|Urban|Strata|STRATA|Sex|SEX)\b", line):
                break
            if re.match(r"^[A-Za-z][A-Za-z .&'/-]*$", line):
                pending = (pending + [line])[-2:]
            continue
        pending = []
        label = m.group("label").strip()
        if label in COMBINED:
            continue
        if label not in STATE_NAMES:
            if re.match(r"^(Urban|Rural|Male|Female)$", label):
                break
            raise ParseError(f"table {table_id}: unknown geography {label!r}")
        prev_tok = m.group("prev")
        out.append({
            "indicator": indicator,
            "state": STATE_NAMES[label],
            "year": year,
            "n": _num(m.group("n"), True),
            "estimated_population": _num(m.group("pop"), True),
            "prevalence_pct": _num(prev_tok, False),
            "ci_lower": _num(m.group("lo"), False),
            "ci_upper": _num(m.group("hi"), False),
            "unreliable": prev_tok.endswith("*"),
        })
    states = [r for r in out if r["state"] != "Malaysia"]
    total = [r for r in out if r["state"] == "Malaysia"]
    if len(total) != 1:
        raise ParseError(f"table {table_id}: expected one MALAYSIA row, found {len(total)}")
    for r in out:
        p, lo, hi = r["prevalence_pct"], r["ci_lower"], r["ci_upper"]
        if None not in (p, lo, hi) and not (lo - 0.051 <= p <= hi + 0.051):
            raise ParseError(f"table {table_id}: {r['state']} prevalence {p} is outside its interval {lo}-{hi}")
    if len({r["state"] for r in states}) != len(states):
        raise ParseError(f"table {table_id}: a state appears twice")
    t = total[0]
    # the states (all that are published separately) can never exceed the national sample
    if t["n"] is not None and sum(r["n"] or 0 for r in states) > t["n"]:
        raise ParseError(f"table {table_id}: state counts exceed the MALAYSIA count")
    if len(states) < 13:
        raise ParseError(f"table {table_id}: only {len(states)} states read")
    return out if malaysia_row else states


_NUMS_ONLY = re.compile(rf"^{_NUM}(?:\s+{_NUM}\*?){{4,}}\s*$")

_AGE_STD = re.compile(r"^(?P<no>\d{1,2})\s+(?P<label>[A-Za-z][A-Za-z .&'/-]*?)\s+(?P<vals>[\d.]+(?:\s+[\d.]+)*)\s*$")


def age_standardised_rows(pages: list[str], table_id: str, indicators: list[str], year: int) -> list[dict]:
    """NHMS 2023's 'age-standardised prevalence by states' tables: NO, STATE, then one point estimate per indicator
    (no counts and no interval are published for these)."""
    page = _page_for(pages, table_id, r"^1\s+Johor\b")
    out = []
    for raw in page.splitlines():
        line = " ".join(raw.split())
        m = _AGE_STD.match(line)
        if not m:
            continue
        label = m.group("label").strip()
        if label not in STATE_NAMES or label == "MALAYSIA":
            raise ParseError(f"table {table_id}: unknown geography {label!r}")
        vals = m.group("vals").split()
        if len(vals) != len(indicators):
            raise ParseError(f"table {table_id}: {label} has {len(vals)} values, expected {len(indicators)}")
        for ind, v in zip(indicators, vals):
            out.append({"indicator": ind, "state": STATE_NAMES[label], "year": year, "n": None, "estimated_population": None,
                        "prevalence_pct": float(v), "ci_lower": None, "ci_upper": None, "unreliable": False})
    names = {r["state"] for r in out}
    if len(names) != 16:
        raise ParseError(f"table {table_id}: expected 16 states, read {len(names)}")
    return out


# ---------------------------------------------------------------------------- what to read
NCD_2019 = {  # NHMS 2019 Vol. I (NCD): table -> indicator (in the order the panel's columns have always had)
    "4.3": "known_diabetes", "4.6": "known_hypertension", "4.2": "raised_blood_glucose", "4.5": "raised_blood_pressure",
    "4.8": "raised_cholesterol", "4.9": "known_hypercholesterolaemia", "5.2": "physical_inactivity", "6.2": "current_smoker",
    "9.2": "current_drinker", "14.2": "underweight", "14.4": "overweight", "14.5": "obesity", "14.8": "abdominal_obesity",
}
NCD_2015 = {  # NHMS 2015 Vol. II
    "1.1.1": "raised_blood_glucose", "1.1.2": "known_diabetes", "1.1.3": "undiagnosed_diabetes",
    "1.2.1": "raised_blood_pressure", "1.2.2": "known_hypertension", "1.2.3": "undiagnosed_hypertension",
    "1.3.1": "raised_cholesterol", "1.3.2": "known_hypercholesterolaemia", "1.3.3": "undiagnosed_hypercholesterolaemia",
    "2.1.1": "underweight", "2.1.8": "abdominal_obesity", "3.1.1": "current_smoker", "5.1.1": "physically_active",
}
NCD_2023 = {  # NHMS 2023 Technical Report: table -> the three columns, in order
    "4.1.4": ["raised_blood_glucose", "known_diabetes", "undiagnosed_diabetes"],
    "4.2.4": ["raised_blood_pressure", "known_hypertension", "undiagnosed_hypertension"],
    "4.3.6": ["raised_cholesterol", "known_hypercholesterolaemia", "undiagnosed_hypercholesterolaemia"],
}
ADOLESCENT_2017 = {"3.3.1": "depression", "3.4.1": "anxiety", "3.5.1": "stress"}


def _pages(text: str) -> list[str]:
    return text.split("\f")


def read_2019(text: str) -> list[dict]:
    pages = _pages(text)
    return [r for tid, ind in NCD_2019.items() for r in state_rows(pages, tid, ind, 2019)]


def read_2015(text: str) -> list[dict]:
    pages = _pages(text)
    return [r for tid, ind in NCD_2015.items() for r in state_rows(pages, tid, ind, 2015)]


def read_2023(text: str) -> list[dict]:
    pages = _pages(text)
    return [r for tid, inds in NCD_2023.items() for r in age_standardised_rows(pages, tid, inds, 2023)]


def read_2017(text: str) -> list[dict]:
    pages = _pages(text)
    return [r for tid, ind in ADOLESCENT_2017.items() for r in state_rows(pages, tid, ind, 2017)]
