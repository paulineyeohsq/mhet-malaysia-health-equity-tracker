# Data backlog

Datasets that are known to exist in some form but could **not** be added to the dashboard under its rules: nothing is
typed in by hand, nothing is estimated, and a dataset is only ingested if the official source publishes it in a
machine-readable form, or its official table can be read reliably and reproducibly by the pipeline in `scripts/`.

This file is internal. The public Data Gaps page lists only the limitations of the data the dashboard has.

The weekly workflow runs [`scripts/watch_backlog.py`](../scripts/watch_backlog.py). It changes nothing on the site; when
a signal below appears it opens one GitHub issue ("Data watch: ...") so a person can look. A signal means "go and
check", never "ingest".

Last re-checked against the official sources: **2026-10-10**.

## Causes of death, by state and district

| | |
|---|---|
| Source | DOSM, [Statistics on Causes of Death, Malaysia, 2025](https://www.dosm.gov.my/portal-main/release-content/statistics-on-causes-of-death-malaysia-2025) (released 18 Dec 2025, 2024 data) |
| What is published | A 4-page press release. The principal cause by state and by district appears only as sentences ("13 states recorded ischaemic heart diseases ..."), not as tables. Not in the OpenDOSM (185) or data.gov.my (297) catalogues. |
| Also found | DOSM's cause-of-death calculator serves a 101 MB record-level JSON (age, sex, state, district, ethnicity, cause) with no year column, no stated licence, and no documentation as a data release. Not used. |
| Why it cannot be added | No table to read. The only machine-readable file is an application asset with no period stated, so counts could not be assigned to years or turned into rates. |
| Next release | DOSM's page says 29 October 2026. |
| Watch | Catalogue entries matching "cause ... death" / ICD; a published `statistics-on-causes-of-death-malaysia-<next year>` document. |
| Re-check | Weekly (automatic); by hand after 29 Oct 2026. Ask DOSM whether the release tables can be published as open data. |

## Divorces, by state

| | |
|---|---|
| Source | DOSM, [Marriage, Divorce and Rujuk Statistics, Malaysia, 2025](https://www.dosm.gov.my/portal-main/release-content/marriage-divorce-and-rujuk-statistics-malaysia-2025) (released 20 Nov 2025, 2024 data) |
| What is published | A 10-page infographic PDF. State totals are map labels in no fixed order (and the three federal territories cannot be told apart reliably); the divorce rate by state is in a chart. Marriages by state are in the catalogue (`marriages_state`, already in the dashboard); divorces are not. |
| Why it cannot be added | Not a table. Reading values out of map and chart labels would depend on layout, and a wrong assignment would be silent. |
| Watch | Catalogue entries matching "divorc"; a published next edition. |
| Re-check | Weekly (automatic). Ask DOSM for the underlying tables. |

## Persons with disabilities (OKU), by state

| | |
|---|---|
| Source | DOSM, [Person with Disability Statistics, Malaysia, 2024](https://www.dosm.gov.my/portal-main/release-content/person-with-disability-statistics-malaysia-2024) (released 11 Dec 2025); the 2025 edition's page says "Article not yet published". The registry itself is held by JKM. |
| What is published | A 4-page press release with national figures (805,509 registered). JKM files exist only on the deprecated archive.data.gov.my portal: seven scattered CSVs (new registrations by disability type, ethnicity and state for 2022; one state's register for 2022; one state's care institutions), CC BY, not updated, not a coherent current state series. Nothing in the live catalogue. |
| Why it cannot be added | No current, complete, machine-readable state series. Combining the archive fragments would mix years and coverage. |
| Watch | Catalogue entries matching "disab" / "OKU"; the 2025 or later DOSM edition becoming a real document. |
| Re-check | Weekly (automatic). Ask JKM / DOSM for a state-level table. |

## Added since the last audit (no longer on the backlog)

| Dataset | Source | Notes |
|---|---|---|
| Public clinics by state and district | MOH facility registry (`MoH-Malaysia/data-resources-public`, CSV) | Public sector only; one snapshot (31 Dec 2025). |
| NHMS 2025 older persons | NHMS 2025 Volume 2 (PDF, read by `scripts/nhms_pdf.py`) | National only; no state breakdown is published. |
| NHMS 2011 NCD indicators | NHMS 2011 Volume II (PDF, read by `scripts/nhms_pdf.py`) | Overall diabetes, underweight, abdominal obesity. Other 2011 tables are page images with no readable text. Sabah and W.P. Labuan are one combined estimate in 2011 and are left empty. |
| Life expectancy | OpenDOSM dashboard | Added earlier. |

## Not changed, but you should know

The NHMS 2015, 2019 and 2023 state tables and the NHMS 2017 adolescent tables already in the dashboard were transcribed
by hand from the PDFs into `data/raw/health_outcomes/nhms_*.csv` in earlier work. They are not produced by the pipeline.
The new extraction in `scripts/nhms_pdf.py` could reproduce them from the reports and check them value for value;
that has not been done because it would touch existing published numbers, which needs a decision first.
