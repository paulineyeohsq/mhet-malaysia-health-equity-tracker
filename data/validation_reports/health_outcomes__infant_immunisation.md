# Validation report: `data/raw/health_outcomes/infant_immunisation.csv`

- Rows: **120**
- Columns: `date, disease, rate`

## Missingness

| column | non-missing | missing (blank) | % missing |
|---|---|---|---|
| date | 120 | 0 | 0.0% |
| disease | 120 | 0 | 0.0% |
| rate | 112 | 8 | 6.7% |

## Duplicates

- Exact duplicate rows: **0**
- Rows sharing a `date, disease` key with another row: **0** across **0** distinct keys

## Numeric range checks

| column | min | max | non-numeric values (excl. blank) |
|---|---|---|---|
| rate | 0.0 | 107.71 | 0 ⚠ outside plausible range [0,100] |

## Temporal coverage

- Years present: 2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023