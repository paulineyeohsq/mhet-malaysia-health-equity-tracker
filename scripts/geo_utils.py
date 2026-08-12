"""
geo_utils.py — Shared geographic name-standardisation utilities for the
Malaysia Health Equity Tracker ETL pipeline.

Different data.gov.my / DOSM datasets spell state and district names
inconsistently (e.g. "Penang" vs "Pulau Pinang", "P.Pinang" vs
"Pulau Pinang", "WP Kuala Lumpur" vs "W.P. Kuala Lumpur",
"Kulai" vs "Kulaijaya"). This module defines ONE canonical spelling per
geography (matching the official DOSM administrative boundary files
shipped in data/raw/geo/) and provides a `canonical_state()` /
`canonical_district()` function used by every transform script so that
all processed tables can be joined on identical keys.

No values are invented here — this module only standardises spelling of
names that already appear, verbatim, in the source data.
"""
from __future__ import annotations
import re

# Canonical state names (must match administrative_1_state.geojson `state` property)
CANONICAL_STATES = [
    "Johor", "Kedah", "Kelantan", "Melaka", "Negeri Sembilan", "Pahang",
    "Perak", "Perlis", "Pulau Pinang", "Sabah", "Sarawak", "Selangor",
    "Terengganu", "W.P. Kuala Lumpur", "W.P. Labuan", "W.P. Putrajaya",
]

# Known alternate spellings -> canonical spelling
STATE_ALIASES = {
    "malaysia": "Malaysia",  # special sentinel for national-level rows
    "wp kuala lumpur": "W.P. Kuala Lumpur",
    "w.p kuala lumpur": "W.P. Kuala Lumpur",
    "kuala lumpur": "W.P. Kuala Lumpur",
    "wilayah persekutuan kuala lumpur": "W.P. Kuala Lumpur",
    "wp labuan": "W.P. Labuan",
    "labuan": "W.P. Labuan",
    "wilayah persekutuan labuan": "W.P. Labuan",
    "wp putrajaya": "W.P. Putrajaya",
    "putrajaya": "W.P. Putrajaya",
    "wilayah persekutuan putrajaya": "W.P. Putrajaya",
    "penang": "Pulau Pinang",
    "p.pinang": "Pulau Pinang",
    "pulau pinang": "Pulau Pinang",
    "negeri sembilan": "Negeri Sembilan",
    "n.sembilan": "Negeri Sembilan",
}

# District aliases: (state, alt-name-lowercased) -> canonical district name,
# built from cases actually observed while joining the raw datasets in this
# pipeline (hospital_beds / hh_access_amenities district labels differ
# slightly from the DOSM administrative_2_district.geojson labels).
DISTRICT_ALIASES = {
    ("Johor", "kulai"): "Kulaijaya",
    ("Johor", "ledang"): "Tangkak",
    ("Perak", "batang padang (tapah)"): "Batang Padang",
    ("Perak", "kinta (ipoh)"): "Kinta",
    ("Perak", "larut & matang (taiping)"): "Larut dan Matang",
    ("Perak", "manjung (sitiawan)"): "Manjung",
    ("Pulau Pinang", "seberang perai utara (butterworth)"): "Seberang Perai Utara",
    ("Pulau Pinang", "timur laut (georgetown)"): "Timur Laut",
    ("Selangor", "gombak (rawang)"): "Gombak",
    ("Selangor", "hulu langat (bangi)"): "Hulu Langat",
    ("Selangor", "petaling (subang jaya)"): "Petaling",
    ("Sarawak", "meradong"): "Maradong",
    ("Sabah", "kota penyu"): "Kuala Penyu",
    ("Sabah", "tongad"): "Tongod",
}


def canonical_state(raw: str | None) -> str | None:
    if raw is None:
        return None
    s = raw.strip()
    if not s:
        return None
    key = re.sub(r"\s+", " ", s).strip().lower()
    if key in STATE_ALIASES:
        return STATE_ALIASES[key]
    # already canonical?
    for c in CANONICAL_STATES:
        if c.lower() == key:
            return c
    if key == "malaysia":
        return "Malaysia"
    return s  # unrecognised — return as-is, flagged by validate_data.py


def canonical_district(state: str | None, raw: str | None) -> str | None:
    if raw is None:
        return None
    s = raw.strip()
    if not s:
        return None
    if s in ("All", "All Districts"):
        return None  # sentinel for state-level aggregate row, not a real district
    st = canonical_state(state) or ""
    key = re.sub(r"\s+", " ", s).strip().lower()
    if (st, key) in DISTRICT_ALIASES:
        return DISTRICT_ALIASES[(st, key)]
    return s
