"""
The NHMS 2015, 2017, 2019 and 2023 state tables are read from the stored report text (scripts/nhms_legacy.py). They used to
be typed in by hand. This test keeps the proof that nothing changed when that was replaced: every extracted value equals
the value that was typed (the fixture), for every row and field.

Run: python3 -m unittest scripts/test_nhms_legacy.py   (from the repository root; no network or PDF tool needed)
"""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import nhms_legacy as L  # noqa: E402
import nhms_pdf as P  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "health_outcomes"
FIXTURE = json.loads((Path(__file__).resolve().parent / "fixtures" / "nhms_hand_transcribed_until_2026-10-10.json").read_text(encoding="utf-8"))["rows"]


def read(name):
    return (RAW / name).read_text(encoding="utf-8")


EXTRACTED = (
    L.read_2019(read("nhms_2019_ncd.txt"))
    + L.read_2015(read("nhms_2015_vol2.txt"))
    + L.read_2023(read("nhms_2023_report.txt"))
    + L.read_2017(read("nhms_2017_adolescent.txt"))
)
BY_KEY = {(r["indicator"], r["state"], r["year"]): r for r in EXTRACTED}
FIELDS = ("n", "estimated_population", "prevalence_pct", "ci_lower", "ci_upper")


class SameAsTheTypedValues(unittest.TestCase):
    def test_every_typed_row_was_extracted(self):
        missing = [(r["indicator"], r["state"], r["year"]) for r in FIXTURE if (r["indicator"], r["state"], r["year"]) not in BY_KEY]
        self.assertEqual(missing, [])

    def test_nothing_extra_was_extracted(self):
        typed = {(r["indicator"], r["state"], r["year"]) for r in FIXTURE}
        self.assertEqual(sorted(set(BY_KEY) - typed), [])

    def test_every_value_is_identical(self):
        wrong = []
        for t in FIXTURE:
            e = BY_KEY[(t["indicator"], t["state"], t["year"])]
            for f in FIELDS:
                if t[f] != e[f]:
                    wrong.append((t["indicator"], t["state"], t["year"], f, t[f], e[f]))
            if t["unreliable"] != e["unreliable"]:
                wrong.append((t["indicator"], t["state"], t["year"], "unreliable", t["unreliable"], e["unreliable"]))
        self.assertEqual(wrong, [])

    def test_the_counts(self):
        self.assertEqual(len(FIXTURE), 611)
        self.assertEqual(len(EXTRACTED), 611)


class Guards(unittest.TestCase):
    def test_an_unknown_geography_is_an_error(self):
        text = read("nhms_2019_ncd.txt").replace("\nSabah ", "\nSabahh ", 1)
        with self.assertRaises(P.ParseError):
            L.read_2019(text)

    def test_a_missing_table_is_an_error(self):
        with self.assertRaises(P.ParseError):
            L.read_2023(read("nhms_2023_report.txt").replace("Table 4.2.4", "Table 9.9.9"))

    def test_a_prevalence_outside_its_interval_is_an_error(self):
        text = read("nhms_2017_adolescent.txt").replace("MALAYSIA 4783 382418 18.3 17.20 19.38", "MALAYSIA 4783 382418 28.3 17.20 19.38", 1)
        with self.assertRaises(P.ParseError):
            L.read_2017(text)


if __name__ == "__main__":
    unittest.main()
