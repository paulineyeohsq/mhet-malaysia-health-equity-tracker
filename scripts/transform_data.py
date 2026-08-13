"""
transform_data.py — Build the master analytical datasets for the Malaysia
Health Equity Tracker dashboard from the validated raw data in data/raw/.

This is the "cleaning -> standardisation -> geographic harmonisation ->
temporal harmonisation -> master analytical dataset" stage of the pipeline
described in the project README.

Design principles enforced throughout:
  - State/district names are passed through geo_utils.canonical_state /
    canonical_district so every output joins cleanly against
    data/processed/geo_lookup.csv.
  - "Malaysia" aggregate rows are split OUT of state-level files into
    separate *_national.json outputs — they are never treated as a 17th
    state.
  - Missing / blank source values become JSON `null`, never 0 and never a
    silently-invented number. Zero is only ever written when the source
    file actually contains the literal value 0.
  - Every output row carries its own `year` (int) derived from the source
    `date` field so the frontend never has to re-parse dates.
  - No interpolation, no cross-year mixing without an explicit field name
    that says which year each figure came from.

Run: python3 scripts/transform_data.py
"""
from __future__ import annotations
import csv
import json
import sys
from pathlib import Path
from collections import defaultdict

sys.path.insert(0, str(Path(__file__).resolve().parent))
from geo_utils import canonical_state, canonical_district  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "processed"
OUT.mkdir(parents=True, exist_ok=True)

LOG = []


def log(msg):
    LOG.append(msg)
    print(msg)


def read_csv(path: Path):
    with open(path, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def num(v):
    """Parse a numeric string, returning None (not 0) for blank/missing."""
    if v is None or v == "":
        return None
    try:
        f = float(v)
        # keep integers as ints where exact, nicer JSON
        return int(f) if f.is_integer() else f
    except (ValueError, TypeError):
        return None


def year_of(date_str):
    if not date_str:
        return None
    return int(date_str[:4])


def write_json(name, obj):
    path = OUT / name
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(obj, f, indent=None, separators=(",", ":"))
    log(f"Wrote {path.relative_to(ROOT)}  ({len(obj) if isinstance(obj, list) else 'object'} records)")


# ---------------------------------------------------------------------------
# 1. Socioeconomic — national trend
# ---------------------------------------------------------------------------
def build_socioeconomic_national():
    income = {year_of(r["date"]): r for r in read_csv(RAW / "socioeconomic" / "hh_income.csv")}
    poverty = {year_of(r["date"]): r for r in read_csv(RAW / "socioeconomic" / "hh_poverty.csv")}
    gini = {year_of(r["date"]): r for r in read_csv(RAW / "socioeconomic" / "hh_inequality.csv")}
    years = sorted(set(income) | set(poverty) | set(gini))
    out = []
    for y in years:
        i, p, g = income.get(y, {}), poverty.get(y, {}), gini.get(y, {})
        out.append({
            "year": y,
            "income_mean": num(i.get("income_mean")),
            "income_median": num(i.get("income_median")),
            "poverty_absolute": num(p.get("poverty_absolute")),
            "poverty_hardcore": num(p.get("poverty_hardcore")),
            "poverty_relative": num(p.get("poverty_relative")),
            "gini": num(g.get("gini")),
        })
    write_json("socioeconomic_national.json", out)
    return out


# ---------------------------------------------------------------------------
# 2. Socioeconomic — state panel
# ---------------------------------------------------------------------------
def build_socioeconomic_state():
    income = read_csv(RAW / "socioeconomic" / "hh_income_state.csv")
    poverty = read_csv(RAW / "socioeconomic" / "hh_poverty_state.csv")
    gini = read_csv(RAW / "socioeconomic" / "hh_inequality_state.csv")

    def index_by(rows):
        d = {}
        for r in rows:
            st = canonical_state(r["state"])
            if st == "Malaysia":
                continue
            d[(st, year_of(r["date"]))] = r
        return d

    inc_idx, pov_idx, gini_idx = index_by(income), index_by(poverty), index_by(gini)
    keys = sorted(set(inc_idx) | set(pov_idx) | set(gini_idx))
    out = []
    for st, yr in keys:
        i, p, g = inc_idx.get((st, yr), {}), pov_idx.get((st, yr), {}), gini_idx.get((st, yr), {})
        out.append({
            "state": st, "year": yr,
            "income_mean": num(i.get("income_mean")),
            "income_median": num(i.get("income_median")),
            "poverty_absolute": num(p.get("poverty_absolute")),
            "poverty_hardcore": num(p.get("poverty_hardcore")),
            "poverty_relative": num(p.get("poverty_relative")),
            "gini": num(g.get("gini")),
        })
    write_json("socioeconomic_state.json", out)
    return out


# ---------------------------------------------------------------------------
# 3. Socioeconomic — district panel (income, poverty, gini, amenities)
# ---------------------------------------------------------------------------
def build_socioeconomic_district():
    income = read_csv(RAW / "socioeconomic" / "hh_income_district.csv")
    poverty = read_csv(RAW / "socioeconomic" / "hh_poverty_district.csv")
    gini = read_csv(RAW / "socioeconomic" / "hh_inequality_district.csv")
    amenities = read_csv(RAW / "socioeconomic" / "hh_access_amenities_2022.csv")

    def index_by(rows):
        d = {}
        for r in rows:
            st = canonical_state(r["state"])
            di = canonical_district(st, r.get("district"))
            if di is None:
                continue  # "All Districts" aggregate row -> belongs in state panel, not here
            d[(st, di, year_of(r["date"]))] = r
        return d

    inc_idx, pov_idx, gini_idx = index_by(income), index_by(poverty), index_by(gini)
    amen_idx = {}
    for r in amenities:
        st = canonical_state(r["state"])
        di = canonical_district(st, r.get("district"))
        if di is None:
            continue
        amen_idx[(st, di, year_of(r["date"]))] = r

    keys = sorted(set(inc_idx) | set(pov_idx) | set(gini_idx))
    out = []
    for st, di, yr in keys:
        i = inc_idx.get((st, di, yr), {})
        p = pov_idx.get((st, di, yr), {})
        g = gini_idx.get((st, di, yr), {})
        a = amen_idx.get((st, di, yr), {})  # amenities only populated for yr==2022
        out.append({
            "state": st, "district": di, "year": yr,
            "income_mean": num(i.get("income_mean")),
            "income_median": num(i.get("income_median")),
            "poverty_absolute": num(p.get("poverty_absolute")),
            "poverty_relative": num(p.get("poverty_relative")),
            "gini": num(g.get("gini")),
            "sanitation_pct": num(a.get("sanitation")),
            "electricity_pct": num(a.get("electricity")),
            "piped_water_pct": num(a.get("piped_water")),
        })
    write_json("socioeconomic_district.json", out)
    return out


# ---------------------------------------------------------------------------
# 4. Population — state panel (2020-2023, DOSM intercensal estimates)
# ---------------------------------------------------------------------------
def build_population_state():
    data = json.loads((RAW / "demography" / "population_state_2020_2023.json").read_text())
    out = []
    for r in data:
        if r.get("age") != "overall_age" or r.get("ethnicity") != "overall_ethnicity":
            continue
        st = canonical_state(r["state"])
        out.append({
            "state": st,
            "year": year_of(r["date"]),
            "sex": r["sex"].replace("overall_sex", "overall"),
            "population_thousands": r["population"],
        })
    write_json("population_state.json", out)

    # Convenience lookup: {(state, year): population} in ABSOLUTE persons,
    # sex == overall only, used for per-100,000 rate calculations elsewhere
    # in this script.
    lookup = {}
    for r in out:
        if r["sex"] == "overall":
            lookup[(r["state"], r["year"])] = r["population_thousands"] * 1000
    return out, lookup


# ---------------------------------------------------------------------------
# 5. Population — district panel from DOSM census (1970-2020)
# ---------------------------------------------------------------------------
def build_population_district():
    rows = read_csv(RAW / "demography" / "census_district.csv")
    out = []
    for r in rows:
        st = canonical_state(r["state"])
        di = canonical_district(st, r.get("district"))
        yr = num(r.get("year"))
        if yr is None:
            continue
        out.append({
            "state": st, "district": di, "year": int(yr),
            "population_total": num(r.get("population_total")),
            "sex_male": num(r.get("sex_male")),
            "sex_female": num(r.get("sex_female")),
            "ethnicity_bumi": num(r.get("ethnicity_bumi")),
            "ethnicity_chinese": num(r.get("ethnicity_chinese")),
            "ethnicity_indian": num(r.get("ethnicity_indian")),
            "ethnicity_other": num(r.get("ethnicity_other")),
            "age_0_14": num(r.get("age_0_14")),
            "age_15_64": num(r.get("age_15_64")),
            "age_65_above": num(r.get("age_65_above")),
        })
    write_json("population_district.json", out)
    return out


# ---------------------------------------------------------------------------
# 6. Healthcare access — state panel (staff, beds) + per-100,000 rates
# ---------------------------------------------------------------------------
def build_healthcare_access_state(pop_lookup):
    staff = read_csv(RAW / "healthcare" / "healthcare_staff.csv")
    beds_national = read_csv(RAW / "healthcare" / "hospital_beds_national.csv")
    beds_2022 = read_csv(RAW / "healthcare" / "hospital_beds_2022.csv")

    # staff: date, state, type, staff  (state includes "Malaysia")
    staff_by_key = defaultdict(dict)
    for r in staff:
        st = canonical_state(r["state"])
        yr = year_of(r["date"])
        staff_by_key[(st, yr)][r["type"]] = num(r["staff"])

    # beds_2022: date, state, district, type, beds — state rows have
    # district == "All Districts"; keep only those + type == "all" for the
    # state panel (per-type breakdown lives in hospital_beds_national.json
    # for the Malaysia-level series).
    beds_by_state_2022 = {}
    for r in beds_2022:
        if r["district"] != "All Districts":
            continue
        st = canonical_state(r["state"])
        beds_by_state_2022[st] = num(r["beds"])

    out = []
    for (st, yr), types in sorted(staff_by_key.items()):
        if st == "Malaysia":
            continue
        row = {
            "state": st, "year": yr,
            "staff_all": types.get("all"),
            "staff_doctor": types.get("doctor"),
            "staff_dentist": types.get("dentist"),
            "staff_nurse": types.get("nurse"),
            "staff_nurse_community": types.get("nurse_community"),
        }
        pop = pop_lookup.get((st, yr))
        row["population_used_for_rate"] = pop
        if pop and row["staff_all"] is not None:
            row["staff_per_100k"] = round(row["staff_all"] / pop * 100000, 1)
        else:
            row["staff_per_100k"] = None
        if yr == 2022 and st in beds_by_state_2022:
            row["hospital_beds"] = beds_by_state_2022[st]
            if pop:
                row["beds_per_100k"] = round(beds_by_state_2022[st] / pop * 100000, 1)
            else:
                row["beds_per_100k"] = None
        else:
            row["hospital_beds"] = None
            row["beds_per_100k"] = None
        out.append(row)
    write_json("healthcare_access_state.json", out)

    # National series (beds by type + total staff), Malaysia only
    national = []
    beds_nat_by_year = defaultdict(dict)
    for r in beds_national:
        if canonical_state(r["state"]) != "Malaysia":
            continue
        beds_nat_by_year[year_of(r["date"])][r["type"]] = num(r["beds"])
    staff_nat_by_year = {yr: types for (st, yr), types in staff_by_key.items() if st == "Malaysia"}
    years = sorted(set(beds_nat_by_year) | set(staff_nat_by_year))
    for yr in years:
        b = beds_nat_by_year.get(yr, {})
        s = staff_nat_by_year.get(yr, {})
        national.append({
            "year": yr,
            "beds_total": b.get("all"),
            "beds_moh": b.get("hospital_moh"),
            "beds_non_moh": b.get("hospital_non_moh"),
            "beds_special_institution": b.get("special_medical_institution"),
            "staff_all": s.get("all"),
            "staff_doctor": s.get("doctor"),
            "staff_dentist": s.get("dentist"),
            "staff_nurse": s.get("nurse"),
        })
    write_json("healthcare_access_national.json", national)
    return out


# ---------------------------------------------------------------------------
# 7. Healthcare access — district snapshot, 2022 (beds + amenities, NO
#    per-capita rate: no district-level 2022 population denominator exists
#    in this pipeline's data, so we report absolute counts only rather than
#    mix a 2020 census denominator with a 2022 numerator silently.)
# ---------------------------------------------------------------------------
def build_healthcare_access_district_2022():
    beds = read_csv(RAW / "healthcare" / "hospital_beds_2022.csv")
    out = []
    for r in beds:
        if r["district"] == "All Districts":
            continue
        st = canonical_state(r["state"])
        di = canonical_district(st, r["district"])
        out.append({
            "state": st, "district": di, "year": 2022,
            "hospital_beds": num(r["beds"]),
            "note": "Absolute count only. No 2022 district-level population "
                    "denominator is available in this pipeline, so a "
                    "beds-per-100,000 rate is deliberately NOT computed here "
                    "to avoid mixing a 2020 census denominator with a 2022 "
                    "numerator. See METHODOLOGY.md.",
        })
    write_json("healthcare_access_district_2022.json", out)
    return out


# ---------------------------------------------------------------------------
# 8. Health outcomes — state panel (mortality, births, STDs)
# ---------------------------------------------------------------------------
def build_health_outcomes_state(pop_lookup):
    death = read_csv(RAW / "health_outcomes" / "death_state.csv")
    death_mat = read_csv(RAW / "health_outcomes" / "death_maternal_state.csv")
    death_ec = read_csv(RAW / "health_outcomes" / "deaths_early_childhood_state.csv")
    birth = read_csv(RAW / "health_outcomes" / "birth_state.csv")
    std = read_csv(RAW / "health_outcomes" / "std_state.csv")

    def idx_simple(rows):
        d = {}
        for r in rows:
            st = canonical_state(r["state"])
            if st == "Malaysia":
                continue
            d[(st, year_of(r["date"]))] = {"abs": num(r.get("abs")), "rate": num(r.get("rate"))}
        return d

    death_idx = idx_simple(death)
    mat_idx = idx_simple(death_mat)
    birth_idx = idx_simple(birth)

    ec_idx = defaultdict(dict)  # (state, year) -> {type: {abs, rate}}
    for r in death_ec:
        st = canonical_state(r["state"])
        if st == "Malaysia":
            continue
        ec_idx[(st, year_of(r["date"]))][r["type"]] = {"abs": num(r.get("abs")), "rate": num(r.get("rate"))}

    std_idx = defaultdict(dict)  # (state, year) -> {disease: {cases, incidence}}
    for r in std:
        st = canonical_state(r["state"])
        if st == "Malaysia":
            continue
        std_idx[(st, year_of(r["date"]))][r["disease"]] = {
            "cases": num(r.get("cases")), "incidence_per_100k": num(r.get("incidence")),
        }

    keys = sorted(set(death_idx) | set(mat_idx) | set(birth_idx) | set(ec_idx) | set(std_idx))
    out = []
    for st, yr in keys:
        ec = ec_idx.get((st, yr), {})
        row = {
            "state": st, "year": yr,
            "crude_death_rate_per_1000": death_idx.get((st, yr), {}).get("rate"),
            "deaths_abs": death_idx.get((st, yr), {}).get("abs"),
            "maternal_deaths_abs": mat_idx.get((st, yr), {}).get("abs"),
            "maternal_mortality_rate_per_100k_births": mat_idx.get((st, yr), {}).get("rate"),
            "crude_birth_rate_per_1000": birth_idx.get((st, yr), {}).get("rate"),
            "births_abs": birth_idx.get((st, yr), {}).get("abs"),
            "infant_deaths_abs": ec.get("infant", {}).get("abs"),
            "infant_mortality_rate": ec.get("infant", {}).get("rate"),
            "neonatal_deaths_abs": ec.get("neonatal", {}).get("abs"),
            "neonatal_mortality_rate": ec.get("neonatal", {}).get("rate"),
            "perinatal_deaths_abs": ec.get("perinatal", {}).get("abs"),
            "perinatal_mortality_rate": ec.get("perinatal", {}).get("rate"),
            "toddler_deaths_abs": ec.get("toddler", {}).get("abs"),
            "toddler_mortality_rate": ec.get("toddler", {}).get("rate"),
            "under5_deaths_abs": ec.get("total", {}).get("abs"),
            "under5_mortality_rate": ec.get("total", {}).get("rate"),
        }
        std_row = std_idx.get((st, yr))
        if std_row:
            row["std_hiv_incidence_per_100k"] = std_row.get("hiv", {}).get("incidence_per_100k")
            row["std_aids_incidence_per_100k"] = std_row.get("aids", {}).get("incidence_per_100k")
            row["std_syphilis_incidence_per_100k"] = std_row.get("syphillis", {}).get("incidence_per_100k")
            row["std_gonorrhea_incidence_per_100k"] = std_row.get("gonorrhea", {}).get("incidence_per_100k")
        out.append(row)
    write_json("health_outcomes_state.json", out)
    return out


# ---------------------------------------------------------------------------
# 9. Health outcomes — national (immunisation, nutrition)
# ---------------------------------------------------------------------------
def build_health_outcomes_national():
    immun = read_csv(RAW / "health_outcomes" / "infant_immunisation.csv")
    nutrition = read_csv(RAW / "health_outcomes" / "nutrition_status_u5_sex.csv")

    immun_by_year = defaultdict(dict)
    for r in immun:
        immun_by_year[year_of(r["date"])][r["disease"]] = num(r.get("coverage")) if "coverage" in r else num(list(r.values())[-1])
    # infant_immunisation.csv columns unknown at write time beyond date/disease -> normalise below
    immun_out = []
    for r in immun:
        immun_out.append({
            "year": year_of(r["date"]),
            "disease": r.get("disease"),
            "coverage_pct": num(r.get("coverage") or r.get("rate") or r.get("value")),
        })
    write_json("immunisation_national.json", [r for r in immun_out if r["disease"]])

    nutrition_out = []
    for r in nutrition:
        nutrition_out.append({
            "year": year_of(r.get("date")),
            "sex": r.get("sex"),
            "indicator": r.get("indicator"),
            "range": r.get("range") or r.get("class"),
            "description": r.get("description"),
            "prevalence_pct": num(r.get("prevalence")),
        })
    write_json("nutrition_national.json", nutrition_out)
    return immun_out, nutrition_out


# ---------------------------------------------------------------------------
# 10. NHMS 2019 NCD prevalence — state level (diabetes, hypertension)
#
# Unlike every other raw file in this pipeline, these two CSVs were NOT
# fetched from a data.gov.my/DOSM endpoint — data.gov.my does not publish
# NHMS survey results as open/structured data. They were manually
# transcribed from the "overall" (both-sex) columns of Table 4.3 (diabetes,
# p.36) and Table 4.6 (hypertension, p.48) of the official NHMS 2019
# technical report:
#   Institute for Public Health (IPH), National Institutes of Health,
#   Ministry of Health Malaysia. 2020. National Health and Morbidity Survey
#   (NHMS) 2019: Vol. I: NCDs - Non-Communicable Diseases: Risk Factors and
#   other Health Problems. ISBN e978-967-18159-2-2.
#   https://iku.nih.gov.my/images/IKU/Document/REPORT/NHMS2019/Report_NHMS2019-NCD.pdf
# The male/female-split columns in the source PDF were NOT transcribed —
# the report's two-column table layout could not be extracted reliably
# enough to trust those figures, so only the "overall" column (which
# extracted cleanly and was cross-checked against the report's own
# MALAYSIA-level subtotal) is used here. These are weighted survey
# estimates with 95% confidence intervals (complex sampling design), not
# administrative registry counts like the rest of this file's inputs —
# ci_lower/ci_upper are carried through for exactly that reason.
# ---------------------------------------------------------------------------
#
# Extended (second pass, same session): 11 more indicators manually
# transcribed from the same report's "overall"-column tables, following the
# identical verification method (cross-checked against the report's own
# MALAYSIA subtotal row; male/female-split columns never transcribed):
#   Table 4.2  raised_blood_glucose        p.32   Table 9.2   current_drinker         p.149
#   Table 4.5  raised_blood_pressure       p.44   Table 14.2  underweight             p.187
#   Table 4.8  raised_cholesterol          p.56   Table 14.4  overweight              p.189
#   Table 4.9  known_hypercholesterolaemia p.60   Table 14.5  obesity                 p.192
#   Table 5.2  physical_inactivity         p.72   Table 14.8  abdominal_obesity       p.201
#   Table 6.2  current_smoker              p.88
# Where the source report itself flags a state estimate with "*" (small
# sample size / high relative standard error), that is carried through as
# unreliable_estimate=1 in the raw CSV and as an "_unreliable" boolean here
# — never silently dropped or presented with the same confidence as the
# rest. "Overweight"/"obesity" use the WHO Asian (Malaysian CPG) BMI cutoffs
# published as the source table's first pair of columns, not the WHO
# international cutoffs also published alongside them.
#
# Third pass (same session): NHMS 2023 Technical Report ("Non-Communicable
# Diseases and Healthcare Demand") adds a second time point for 6 of the
# above indicators plus 3 new "undiagnosed_*" indicators, from its own
# dedicated "age-standardised prevalence by states" tables:
#   Table 4.1.4 diabetes (p.42), Table 4.2.4 hypertension (p.49),
#   Table 4.3.6 hypercholesterolaemia (p.59)
#   https://iku.nih.gov.my/images/nhms2023/report-nhms-2023.pdf
# Extracted with `pdftotext -raw` (NOT -layout, which garbles these specific
# tables) and cross-checked line-by-line against every highest/lowest
# figure the report states in its own prose — all matched exactly.
# IMPORTANT METHODOLOGICAL CAVEAT: these 2023 figures are AGE-STANDARDISED
# state estimates, not directly comparable to the 2019 figures above (which
# are crude/unstandardised, matching the table style used in that year's
# report). Treat a 2019-vs-2023 trend on the same field as suggestive, not
# a precise comparison. These particular 2023 tables also do not publish
# sample size, population estimate, or 95% CI columns (point estimates
# only) or a Malaysia-level row — hence the blank n/estimated_population/
# ci_lower/ci_upper cells in the raw CSV, carried through as null here
# rather than fabricated. Overweight/obesity, physical inactivity, smoking,
# drinking, and BMI/nutrition indicators were NOT found with an equivalent
# clean by-state table in the 2023 report and are not included for 2023.
#
# Fourth pass (same session): NHMS 2015 (Vol. II: Non-Communicable Disease,
# Risk Factors & Other Health Problems, NMRR-14-1064-21877) adds a THIRD
# time point for diabetes/hypertension/hypercholesterolaemia (crude
# prevalence this time, same basis as 2019 — comparable to 2019, NOT
# directly comparable to 2023's age-standardised figures), plus
# underweight, abdominal obesity (WHO 2000), current smoking, and a new
# "physically_active" indicator (this survey measured active, not
# inactive — the inverse framing was NOT algebraically inverted into
# physical_inactivity, since that would be a derived rather than a
# transcribed figure; it is its own field).
#   https://iku.nih.gov.my/images/IKU/Document/REPORT/nhmsreport2015vol2.pdf
# Extracted with `pdftotext -raw`, cross-checked against the report's own
# MALAYSIA subtotal for every table, and (for physically_active) against
# its own narrative "highest was Kelantan/Pahang" sentence — matched.
# THREE things NOT included from 2015, on purpose:
#   1. Overweight and obesity (Tables 2.1.2–2.1.4): those pages did not
#      extract as text in EITHER pdftotext mode (all other pages of the
#      same chapter did) — almost certainly image-rendered in this PDF.
#      Not guessed at.
#   2. Current drinker (Table 4.1.2, 18+): this table has no "State"
#      breakdown in the 2015 report at all (goes straight from the
#      Malaysia row to Urban/Rural) — the indicator was simply not
#      disaggregated by state that survey cycle.
#   3. Sabah and W.P. Labuan: the 2015 survey design reports these two as
#      ONE combined "Sabah & WP Labuan" figure for every indicator, not
#      two separate ones. Splitting that combined estimate across two
#      states would be fabrication, so both are left null for 2015 rather
#      than assigning the combined number to either (or both).
# NHMS 2011 (Vol. II) was also attempted but abandoned: table titles were
# frequently detached from their data by page-break artifacts in this
# particular PDF, and the one table checked against the report's own
# stated confidence interval showed a small but real mismatch (12.1–13.6
# extracted vs. 12.2–13.5 stated) — a level of extraction risk this
# pipeline is not willing to accept without a more reliable source. 2011
# is not included; NHMS 1996/2006 were not part of the same "diabetes:
# 11.2% (2011) -> 13.4% (2015) -> 18.3% (2019)" comparable NCD survey
# series per the 2019 report's own trend framing and were not attempted.
# ---------------------------------------------------------------------------
def load_indicator_rows(path, indicator_col=None, fixed_indicator=None):
    """Shared by build_nhms_ncd() and build_nhms_adolescent_mental_health():
    yields (indicator, state, year, value_dict) from a long-format NHMS raw
    CSV (state,date,indicator,n,estimated_population,prevalence_pct,
    ci_lower,ci_upper[,unreliable_estimate])."""
    for r in read_csv(path):
        st = canonical_state(r["state"])
        yr = year_of(r["date"])
        ind = r[indicator_col] if indicator_col else fixed_indicator
        yield ind, st, yr, {
            "n": num(r.get("n")),
            "estimated_population": num(r.get("estimated_population")),
            "prevalence_pct": num(r.get("prevalence_pct")),
            "ci_lower": num(r.get("ci_lower")),
            "ci_upper": num(r.get("ci_upper")),
            "unreliable": (num(r.get("unreliable_estimate")) == 1) if "unreliable_estimate" in r else None,
        }


def build_nhms_ncd():
    SOURCES = [
        (RAW / "health_outcomes" / "nhms_diabetes_state_2019.csv", None, "known_diabetes"),
        (RAW / "health_outcomes" / "nhms_hypertension_state_2019.csv", None, "known_hypertension"),
        (RAW / "health_outcomes" / "nhms_metabolic_state_2019.csv", "indicator", None),
        (RAW / "health_outcomes" / "nhms_lifestyle_state_2019.csv", "indicator", None),
        (RAW / "health_outcomes" / "nhms_nutrition_bmi_state_2019.csv", "indicator", None),
        (RAW / "health_outcomes" / "nhms_metabolic_state_2023.csv", "indicator", None),
        (RAW / "health_outcomes" / "nhms_metabolic_state_2015.csv", "indicator", None),
        (RAW / "health_outcomes" / "nhms_nutrition_lifestyle_state_2015.csv", "indicator", None),
    ]

    combined = defaultdict(dict)  # indicator -> (state, year) -> {...}
    for path, indicator_col, fixed_indicator in SOURCES:
        for ind, st, yr, v in load_indicator_rows(path, indicator_col, fixed_indicator):
            combined[ind][(st, yr)] = v

    all_state_years = set()
    for by_key in combined.values():
        all_state_years |= set(by_key.keys())

    def row_for(st, yr):
        row = {"state": st, "year": yr}
        for prefix, by_key in combined.items():
            v = by_key.get((st, yr), {})
            row[f"{prefix}_prevalence_pct"] = v.get("prevalence_pct")
            row[f"{prefix}_ci_lower"] = v.get("ci_lower")
            row[f"{prefix}_ci_upper"] = v.get("ci_upper")
            row[f"{prefix}_n"] = v.get("n")
            if v.get("unreliable") is not None:
                row[f"{prefix}_unreliable"] = v.get("unreliable")
        return row

    state_years = sorted(sy for sy in all_state_years if sy[0] != "Malaysia")
    state_out = [row_for(st, yr) for st, yr in state_years]
    write_json("nhms_ncd_state.json", state_out)

    national_years = sorted(yr for (st, yr) in all_state_years if st == "Malaysia")
    national_out = [row_for("Malaysia", yr) for yr in national_years]
    write_json("nhms_ncd_national.json", national_out)
    return state_out, national_out


# ---------------------------------------------------------------------------
# 11. NHMS 2017 Adolescent Mental Health (DASS-21) — state level
#
# Fifth pass (same session), fixing a gap flagged from the very first
# ask in this thread: mental health data was requested but never located
# in DOSM's open catalogue (confirmed absent there). It DOES exist as a
# manually-transcribed NHMS PDF table, same as the NCD risk factors above
# — but from a DIFFERENT report and a DIFFERENT population, kept in its
# own file rather than merged into nhms_ncd_state.json for exactly that
# reason:
#   Institute for Public Health (IPH) 2017. National Health and Morbidity
#   Survey 2017 (NHMS 2017): Adolescent Mental Health (DASS-21).
#   ISBN: 978-983-2387-38-1.
#   https://iku.nih.gov.my/images/IKU/Document/REPORT/NHMS2017/MHSReportNHMS2017.pdf
# CRITICAL POPULATION CAVEAT: this survey covers SECONDARY-SCHOOL-GOING
# ADOLESCENTS AGED 13-17 — not adults, and not the general population.
# It is not comparable to, and must never be presented alongside, the
# adult NCD indicators in nhms_ncd_state.json without that distinction
# being explicit. depression/anxiety/stress prevalence come from
# Tables 3.3.1/3.4.1/3.5.1 ("Prevalence of X by socio-demography"),
# extracted with `pdftotext -raw` and cross-checked against the report's
# own narrative ("highest in Selangor at 22.6%" for depression, "highest
# in Sabah at 46.8%" for anxiety, "highest in Selangor at 12.5%" for
# stress) — all three matched exactly. Full 16 states + national, with
# 95% CI and unweighted sample count, no missing states this survey.
# ---------------------------------------------------------------------------
def build_nhms_adolescent_mental_health():
    rows = list(load_indicator_rows(
        RAW / "health_outcomes" / "nhms_adolescent_mental_health_state_2017.csv", "indicator", None
    ))
    combined = defaultdict(dict)
    for ind, st, yr, v in rows:
        combined[ind][(st, yr)] = v

    all_state_years = set()
    for by_key in combined.values():
        all_state_years |= set(by_key.keys())

    def row_for(st, yr):
        row = {"state": st, "year": yr}
        for prefix, by_key in combined.items():
            v = by_key.get((st, yr), {})
            row[f"{prefix}_prevalence_pct"] = v.get("prevalence_pct")
            row[f"{prefix}_ci_lower"] = v.get("ci_lower")
            row[f"{prefix}_ci_upper"] = v.get("ci_upper")
            row[f"{prefix}_n"] = v.get("n")
        return row

    state_years = sorted(sy for sy in all_state_years if sy[0] != "Malaysia")
    state_out = [row_for(st, yr) for st, yr in state_years]
    write_json("nhms_adolescent_mental_health_state.json", state_out)

    national_years = sorted(yr for (st, yr) in all_state_years if st == "Malaysia")
    national_out = [row_for("Malaysia", yr) for yr in national_years]
    write_json("nhms_adolescent_mental_health_national.json", national_out)
    return state_out, national_out


def main():
    build_socioeconomic_national()
    build_socioeconomic_state()
    build_socioeconomic_district()
    _, pop_lookup = build_population_state()
    build_population_district()
    build_healthcare_access_state(pop_lookup)
    build_healthcare_access_district_2022()
    build_health_outcomes_state(pop_lookup)
    build_health_outcomes_national()
    build_nhms_ncd()
    build_nhms_adolescent_mental_health()

    log_path = OUT / "transform_log.txt"
    log_path.write_text("\n".join(LOG))
    print(f"\nDone. Transform log written to {log_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
