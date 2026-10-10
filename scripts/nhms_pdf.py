"""
nhms_pdf.py - read published tables out of the NHMS technical reports (PDFs), reproducibly.

The text comes from `pdftotext -raw` (scripts/ingest_data.py stores it under data/raw/health_outcomes/). Raw mode keeps
each table row on one line ("label count estimated_population prevalence ci_lower ci_upper", repeated once per
measure in tables that report several), where the default layout mode scrambles these particular tables; nothing here
works on layout output.

Nothing is typed in by hand and nothing is guessed. Every table must pass these checks or the whole parse raises (so the
pipeline keeps the previous data instead of publishing something doubtful):
  - a MALAYSIA row exists and the table has at least one breakdown;
  - every prevalence lies inside its own 95% confidence interval;
  - within each breakdown (state, location, sex, age group ...) the sample counts never exceed the MALAYSIA count, and
    for the State breakdown (which every respondent has) they add up to it exactly; estimated populations likewise
    (to the report's own rounding), which catches any row that was mis-assigned or lost;
  - for NHMS 2025, every table the report announces as "The prevalence of ..." must have been read.
A cell the report prints as "-" (suppressed because the base is too small) is kept as None, never filled in.
"""
from __future__ import annotations

import re


class ParseError(Exception):
    pass


_NUMTOK = re.compile(r"^(?:\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?|-)$")

# page furniture and column headings that surround the rows; none of it is data
NOISE = re.compile(
    r"^(Sociodemographic.*|\d+|\|?\s*National Health [Aa]nd Morbidity Survey.*|VOLUME II|Volume 2.*|\d+\s+National Health.*|"
    r"Lower Upper|Lower|Upper|95% CI|95% Confidence( Interval)?|Interval|Characteristic|characteristics|Count|Estimated|"
    r"Population|Prevalence|\(%\)|% \(Prevalence\)|Prevalence \(%\)|Estimated Population|Table \d+(\.\d+)*[:.]?\s.*)$"
)


def _cell(tok: str, as_int: bool):
    if tok == "-":
        return None
    return int(tok.replace(",", "")) if as_int else float(tok)


def _split_row(line: str, blocks: int):
    """(label, [block, ...]) if the line ends in `blocks` groups of five numbers, else None."""
    toks = line.split()
    need = 5 * blocks
    if len(toks) < need or not all(_NUMTOK.match(t) for t in toks[-need:]):
        return None
    nums = toks[-need:]
    label = " ".join(toks[:-need])
    values = []
    for b in range(blocks):
        n, pop, prev, lo, hi = nums[5 * b: 5 * b + 5]
        values.append({
            "n": _cell(n, True),
            "estimated_population": _cell(pop, True),
            "prevalence_pct": _cell(prev, False),
            "ci_lower": _cell(lo, False),
            "ci_upper": _cell(hi, False),
        })
    return label, values


def parse_rows(lines: list[str], headers: set[str], blocks: int = 1, start_section: str | None = None, started: bool = False) -> list[dict]:
    """Rows of one table: dicts with section, label and values (one dict per measure block; the first block's fields
    are repeated at the top level for the usual single-measure tables).

    A label printed on two lines ("Never married/ Separated / Divorced /" then "Widowed") has its numbers on the second
    line; text lines that are not a known section header are held and joined onto that label."""
    rows: list[dict] = []
    section: str | None = start_section
    pending: list[str] = []
    known = {h.lower(): h for h in headers}  # headings are printed in varying case ("Household income category" / "...Category")
    for raw in lines:
        line = " ".join(raw.split())
        if not line:
            continue
        parsed = _split_row(line, blocks)
        if not started:
            # nothing before the MALAYSIA row (page heading, column headings, the title) is part of the table
            if parsed and parsed[0].upper() == "MALAYSIA":
                started = True
            else:
                continue
        if parsed is None and NOISE.match(line):
            continue
        if parsed:
            label, values = parsed
            if not label:
                label = " ".join(pending).strip()
                pending = []
                if not label:
                    raise ParseError(f"numbers without a row label: {line!r}")
            else:
                for frag in pending:
                    if frag.lower() in known:
                        section = known[frag.lower()]
                    else:
                        raise ParseError(f"unrecognised text {frag!r} before row {label!r}")
                pending = []
            row = {"section": None if label.upper() == "MALAYSIA" else section, "label": label, "values": values}
            row.update(values[0])
            rows.append(row)
        elif line.lower() in known:
            section = known[line.lower()]
            pending = []
        else:
            pending.append(line)
    return rows


def validate(table_id: str, rows: list[dict], block: int = 0, pop_tolerance: float = 0.002) -> None:
    """Raise ParseError if the table does not add up. See the module docstring."""
    malaysia = [r for r in rows if r["label"].upper() == "MALAYSIA"]
    if len(malaysia) != 1:
        raise ParseError(f"{table_id}: expected one MALAYSIA row, found {len(malaysia)}")
    total = malaysia[0]["values"][block]
    by_section: dict[str, list[dict]] = {}
    for r in rows:
        v = r["values"][block]
        p, lo, hi = v["prevalence_pct"], v["ci_lower"], v["ci_upper"]
        if p is not None and lo is not None and hi is not None and not (lo - 0.051 <= p <= hi + 0.051):
            raise ParseError(f"{table_id}: {r['label']!r} prevalence {p} is outside its own interval {lo}-{hi}")
        if r["section"] is not None:
            by_section.setdefault(r["section"], []).append(r)
    if not by_section:
        raise ParseError(f"{table_id}: no breakdown rows")
    for sec, items in by_section.items():
        labels = [i["label"] for i in items]
        if len(set(labels)) != len(labels):
            raise ParseError(f"{table_id}/{sec}: a label appears twice")
        ns = [i["values"][block]["n"] for i in items]
        if None in ns or total["n"] is None:
            continue
        s = sum(ns)
        if s > total["n"] or (sec == "State" and s != total["n"]):
            raise ParseError(f"{table_id}/{sec}: counts add up to {s}, MALAYSIA says {total['n']}")
        pops = [i["values"][block]["estimated_population"] for i in items]
        if None not in pops and total["estimated_population"]:
            sp = sum(pops)
            slack = pop_tolerance * total["estimated_population"] + len(items) * 100  # the report rounds to the nearest 100
            # a breakdown may fall short of the total (respondents with the answer missing are in no category), but it
            # can never exceed it; the State breakdown must match
            if sp > total["estimated_population"] + slack or (sec == "State" and abs(sp - total["estimated_population"]) > slack):
                raise ParseError(f"{table_id}/{sec}: populations add up to {sp}, MALAYSIA says {total['estimated_population']}")


# ---------------------------------------------------------------------------- NHMS 2011, Volume II
H2011 = {"State", "Location", "Sex", "Age Group", "Ethnicity", "Marital Status", "Education Level", "Occupation", "Household Income"}
STATE_2011 = {
    "Johor": "Johor", "Kedah": "Kedah", "Kelantan": "Kelantan", "Melaka": "Melaka", "Negeri Sembilan": "Negeri Sembilan",
    "Pahang": "Pahang", "Penang": "Pulau Pinang", "Perak": "Perak", "Perlis": "Perlis", "Selangor": "Selangor",
    "Terengganu": "Terengganu", "Sarawak": "Sarawak", "WP Kuala Lumpur": "W.P. Kuala Lumpur", "WP Putrajaya": "W.P. Putrajaya",
}
# NHMS 2011 reports Sabah and W.P. Labuan as one combined estimate. It is carried under this label so nothing can
# silently assign it to either; the transform leaves both states without a 2011 value (as it already does for 2015).
COMBINED_2011 = "Sabah & WP Labuan"
# indicator id -> table id. Only definitions that match the ones already published for other survey years.
TABLES_2011 = {
    "overall_diabetes": "1.1.1",        # known + undiagnosed diabetes, adults 18+
    "underweight": "2.1.6",             # BMI < 18.5 kg/m2, adults 18+
    "abdominal_obesity": "2.1.9",       # WHO 2000 waist cut-offs, adults 18+
}


def parse_2011(text: str) -> dict[str, dict]:
    """{indicator: {"malaysia": row, "states": {canonical state: row}, "combined_sabah_labuan": row}}"""
    pages = text.split("\f")
    out: dict[str, dict] = {}
    for indicator, table_id in TABLES_2011.items():
        pat = re.compile(rf"^Table {re.escape(table_id)}\s", re.M)
        candidates = [p for p in pages if pat.search(p) and re.search(r"^MALAYSIA\s", p, re.M) and re.search(r"^State\s*$", p, re.M)]
        if len(candidates) != 1:
            raise ParseError(f"NHMS 2011 table {table_id}: expected one page with its State block, found {len(candidates)}")
        rows = parse_rows(candidates[0].splitlines(), H2011)
        # this page carries the top of the table (MALAYSIA, State, then Location ...); keep MALAYSIA and State
        validate(f"NHMS 2011 table {table_id}", [r for r in rows if r["section"] in (None, "State")])
        malaysia = next(r for r in rows if r["label"].upper() == "MALAYSIA")
        states: dict[str, dict] = {}
        combined = None
        for r in rows:
            if r["section"] != "State":
                continue
            if r["label"] == COMBINED_2011:
                combined = r
            elif r["label"] in STATE_2011:
                states[STATE_2011[r["label"]]] = r
            else:
                raise ParseError(f"NHMS 2011 table {table_id}: unknown state label {r['label']!r}")
        if len(states) != 14 or combined is None:
            raise ParseError(f"NHMS 2011 table {table_id}: expected 14 named states plus the Sabah/Labuan row, got {len(states)}")
        out[indicator] = {"malaysia": malaysia, "states": states, "combined_sabah_labuan": combined}
    return out


# ---------------------------------------------------------------------------- NHMS 2025, Volume 2 (older persons)
H2025 = {
    "Location", "Sex", "Age group", "Ethnicity", "Marital status", "Education level", "Occupation",
    "Household income category", "Household income quintile", "Household income", "Living arrangement",
    "Employment status", "Residential status",
}
TABLE_TITLE_2025 = re.compile(r"^Table (\d+(?:\.\d+)*):\s*(.*)$")
PREVALENCE_TITLE = re.compile(r"^The prevalence of\b")
# Tables that report several measures side by side (blocks of count / population / prevalence / interval). The measure
# names are checked against the column heading printed in the report.
MULTI_2025: dict[str, list[tuple[str, str]]] = {
    "12.1": [("raised blood glucose (overall)", "raised blood glucose"), ("known diabetes", "known diabetes"), ("undiagnosed diabetes", "undiagnosed diabetes")],
    "12.2": [("raised blood pressure (overall)", "raised blood pressure"), ("known hypertension", "known hypertension"), ("undiagnosed hypertension", "undiagnosed hypertens")],
    "12.3": [("raised total cholesterol (overall)", "raised total cholesterol"), ("known hypercholesterolaemia", "known hypercholesterolaemia"), ("undiagnosed hypercholesterolaemia", "undiagnos")],
    "14.1": [("pre-frail", "pre-frail"), ("frail", "frail")],
}


def _title_of(segment: list[str]) -> tuple[str, str]:
    m = TABLE_TITLE_2025.match(" ".join(segment[0].split()))
    assert m
    table_id, title = m.group(1), m.group(2)
    j = 1
    while j < len(segment) and not re.match(r"\s*(Sociodemographic|Characteristic|Estimated|Count|Overall|Sedentary|Pre-Frail)", segment[j]):
        title += " " + segment[j].strip()
        j += 1
    return table_id, " ".join(title.split())


def parse_2025(text: str) -> list[dict]:
    """The prevalence tables of NHMS 2025 Volume 2, as
    [{"table": "5.1", "title": ..., "measures": [name, ...], "rows": [...]}].

    Only tables titled "The prevalence of ..." are taken. A page can hold the end of one table and the start of the
    next, and a table can run on over the page; both are handled. Each table must validate or the parse raises, and
    every announced prevalence table must have been read."""
    segments: list[tuple[str | None, list[str]]] = []  # (table id, or None for a continuation; lines)
    announced: set[str] = set()
    for page in text.split("\f"):
        lines = page.splitlines()
        starts = [i for i, l in enumerate(lines) if TABLE_TITLE_2025.match(" ".join(l.split()))]
        if not starts:
            segments.append((None, lines))
            continue
        if starts[0] > 0:
            segments.append((None, lines[: starts[0]]))
        for a, b in zip(starts, starts[1:] + [len(lines)]):
            segments.append((TABLE_TITLE_2025.match(" ".join(lines[a].split())).group(1), lines[a:b]))

    tables: dict[str, dict] = {}
    order: list[str] = []
    current: str | None = None
    for tid, seg in segments:
        if tid is not None:
            table_id, title = _title_of(seg)
            is_prev = bool(PREVALENCE_TITLE.match(title))
            body = "\n".join(seg)
            if is_prev:
                announced.add(table_id)
            current = None
            if not is_prev or table_id in tables or not re.search(r"^MALAYSIA\s", body, re.M):
                continue
            names = [n for n, _ in MULTI_2025.get(table_id, [("prevalence", "")])]
            if table_id in MULTI_2025:
                header = " ".join(" ".join(seg[:30]).split()).lower()
                for _, key in MULTI_2025[table_id]:
                    if key not in header:
                        raise ParseError(f"NHMS 2025 table {table_id}: column heading no longer mentions {key!r}")
            rows = parse_rows(seg[1:], H2025, blocks=len(names))
            if not rows:
                continue  # announced, but its rows could not be read: reported as missing below
            tables[table_id] = {"table": table_id, "title": title, "measures": names, "rows": rows}
            order.append(table_id)
            current = table_id
        elif current is not None:
            t = tables[current]
            more = parse_rows(seg, H2025, blocks=len(t["measures"]), start_section=t["rows"][-1]["section"], started=True)
            t["rows"].extend(more)
    missing = sorted(announced - set(order))
    if missing:
        raise ParseError(f"NHMS 2025: prevalence tables announced but not readable: {missing}")
    if len(order) < 12:
        raise ParseError(f"NHMS 2025: only {len(order)} prevalence tables found (expected at least 12); the report layout may have changed")
    for table_id in order:
        t = tables[table_id]
        for b in range(len(t["measures"])):
            validate(f"NHMS 2025 table {table_id} ({t['measures'][b]})", t["rows"], block=b)
    return [tables[t] for t in order]
