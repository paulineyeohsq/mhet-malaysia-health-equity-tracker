"""
Checks for scripts/nhms_pdf.py against the report text the pipeline stored (data/raw/health_outcomes/nhms_*_vol2.txt).
Run: python3 -m unittest scripts/test_nhms_pdf.py   (from the repository root; needs no network or PDF tool)
"""
import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import nhms_pdf as P  # noqa: E402

RAW = Path(__file__).resolve().parents[1] / "data" / "raw" / "health_outcomes"
T2011 = (RAW / "nhms_2011_vol2.txt").read_text(encoding="utf-8")
T2025 = (RAW / "nhms_2025_vol2.txt").read_text(encoding="utf-8")


class Rows(unittest.TestCase):
    def test_a_simple_row(self):
        rows = P.parse_rows(["MALAYSIA 867 390,800 9.8 8.82 10.98", "Location", "Urban 369 245,400 8.4 7.17 9.74"], {"Location"})
        self.assertEqual([r["label"] for r in rows], ["MALAYSIA", "Urban"])
        self.assertEqual(rows[1]["section"], "Location")
        self.assertEqual(rows[1]["estimated_population"], 245400)
        self.assertAlmostEqual(rows[1]["ci_upper"], 9.74)

    def test_a_label_that_wraps_onto_two_lines(self):
        rows = P.parse_rows(
            ["MALAYSIA 867 390,800 9.8 8.82 10.98", "Marital status", "Never married/ Separated / Divorced /", "Widowed", "477 203,900 13.7 11.85 15.81"],
            {"Marital status"},
        )
        self.assertEqual(rows[1]["label"], "Never married/ Separated / Divorced / Widowed")
        self.assertEqual(rows[1]["section"], "Marital status")

    def test_a_suppressed_cell_stays_empty(self):
        rows = P.parse_rows(["MALAYSIA 10 100 5.0 4.0 6.0", "Ethnicity", "Other Bumiputera / Others 37 - - - -"], {"Ethnicity"})
        self.assertIsNone(rows[1]["prevalence_pct"])
        self.assertEqual(rows[1]["n"], 37)

    def test_text_nobody_recognises_is_an_error_not_a_guess(self):
        with self.assertRaises(P.ParseError):
            P.parse_rows(["MALAYSIA 10 100 5.0 4.0 6.0", "Mystery heading", "Urban 5 50 5.0 4.0 6.0"], {"Location"})


class Validation(unittest.TestCase):
    def test_counts_that_exceed_the_total_are_refused(self):
        rows = P.parse_rows(["MALAYSIA 100 1,000 5.0 4.0 6.0", "Sex", "Male 60 500 5.0 4.0 6.0", "Female 60 500 5.0 4.0 6.0"], {"Sex"})
        with self.assertRaises(P.ParseError):
            P.validate("t", rows)

    def test_a_prevalence_outside_its_interval_is_refused(self):
        rows = P.parse_rows(["MALAYSIA 100 1,000 5.0 4.0 6.0", "Sex", "Male 60 500 9.0 4.0 6.0"], {"Sex"})
        with self.assertRaises(P.ParseError):
            P.validate("t", rows)

    def test_state_counts_must_add_up_exactly(self):
        rows = P.parse_rows(["MALAYSIA 100 1,000 5.0 4.0 6.0", "State", "Johor 60 500 5.0 4.0 6.0", "Kedah 39 500 5.0 4.0 6.0"], {"State"})
        with self.assertRaises(P.ParseError):
            P.validate("t", rows)


class Nhms2011(unittest.TestCase):
    def setUp(self):
        self.t = P.parse_2011(T2011)

    def test_the_report_totals(self):
        # Malaysia-level figures as printed in the report's own tables
        self.assertEqual((self.t["overall_diabetes"]["malaysia"]["n"], self.t["overall_diabetes"]["malaysia"]["prevalence_pct"]), (3202, 15.2))
        self.assertEqual(self.t["underweight"]["malaysia"]["prevalence_pct"], 8.3)
        self.assertEqual(self.t["abdominal_obesity"]["malaysia"]["prevalence_pct"], 45.4)

    def test_every_state_is_there_and_sabah_and_labuan_are_not_split(self):
        for ind, tbl in self.t.items():
            self.assertEqual(len(tbl["states"]), 14, ind)
            self.assertNotIn("Sabah", tbl["states"])
            self.assertNotIn("W.P. Labuan", tbl["states"])
            self.assertIsNotNone(tbl["combined_sabah_labuan"]["prevalence_pct"])
        self.assertEqual(self.t["overall_diabetes"]["states"]["Johor"]["prevalence_pct"], 13.4)

    def test_values_match_what_the_report_says_in_its_own_text(self):
        # "highest prevalence in Perlis at 24.8% (95%CI: 20.9 - 29.3), followed by Kedah at 22.5% (18.2 - 27.4) and
        # Negeri Sembilan at 22.0% (18.2 - 26.4); lowest Sabah & W.P. Labuan at 9.0% (7.2 - 11.3) and W.P. Putrajaya
        # at 8.8% (6.4 - 12.0)"; overall 15.2% (14.3 - 16.1). The prose is in the same stored text:
        self.assertIn("highest prevalence in Perlis at 24.8%", " ".join(T2011.split()))
        d = self.t["overall_diabetes"]
        def triple(r):
            return (r["prevalence_pct"], r["ci_lower"], r["ci_upper"])
        self.assertEqual(triple(d["states"]["Perlis"]), (24.8, 20.9, 29.3))
        self.assertEqual(triple(d["states"]["Kedah"]), (22.5, 18.2, 27.4))
        self.assertEqual(triple(d["states"]["Negeri Sembilan"]), (22.0, 18.2, 26.4))
        self.assertEqual(triple(d["combined_sabah_labuan"]), (9.0, 7.2, 11.3))
        self.assertEqual(triple(d["states"]["W.P. Putrajaya"]), (8.8, 6.4, 12.0))
        self.assertEqual(triple(d["malaysia"]), (15.2, 14.3, 16.1))

    def test_a_reorganised_report_is_refused(self):
        with self.assertRaises(P.ParseError):
            P.parse_2011(T2011.replace("Table 1.1.1", "Table 9.9.9"))


class Nhms2025(unittest.TestCase):
    def setUp(self):
        self.t = P.parse_2025(T2025)

    def test_all_announced_prevalence_tables_are_read(self):
        ids = [t["table"] for t in self.t]
        self.assertGreaterEqual(len(ids), 19)
        announced = set(re.findall(r"^Table (\d+(?:\.\d+)*): The prevalence of", T2025, re.M))
        self.assertEqual(announced - set(ids), set())

    def test_known_values(self):
        by_id = {t["table"]: t for t in self.t}
        dementia = by_id["5.1"]
        total = next(r for r in dementia["rows"] if r["label"] == "MALAYSIA")
        self.assertEqual((total["n"], total["estimated_population"], total["prevalence_pct"]), (867, 390800, 9.8))
        rural = next(r for r in dementia["rows"] if r["label"] == "Rural")
        self.assertEqual((rural["section"], rural["prevalence_pct"], rural["ci_lower"], rural["ci_upper"]), ("Location", 14.0, 12.25, 16.01))

    def test_multi_measure_tables_keep_each_measure(self):
        t = next(t for t in self.t if t["table"] == "12.1")
        self.assertEqual(len(t["measures"]), 3)
        total = next(r for r in t["rows"] if r["label"] == "MALAYSIA")
        self.assertEqual(len(total["values"]), 3)
        self.assertNotEqual(total["values"][0]["prevalence_pct"], total["values"][1]["prevalence_pct"])

    def test_a_heading_that_changed_is_refused(self):
        with self.assertRaises(P.ParseError):
            P.parse_2025(T2025.replace("Known Diabetes", "Diagnosed Diabetes").replace("known diabetes", "diagnosed diabetes"))


if __name__ == "__main__":
    unittest.main()
