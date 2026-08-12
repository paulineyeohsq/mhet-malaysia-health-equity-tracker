# Validation report: `data/raw/health_outcomes/deaths_early_childhood_state.csv`

- Rows: **708**
- Columns: `date, state, type, abs, rate`

## Missingness

| column | non-missing | missing (blank) | % missing |
|---|---|---|---|
| date | 708 | 0 | 0.0% |
| state | 708 | 0 | 0.0% |
| type | 708 | 0 | 0.0% |
| abs | 708 | 0 | 0.0% |
| rate | 708 | 0 | 0.0% |

## Duplicates

- Exact duplicate rows: **0**
- Rows sharing a `date, state, type` key with another row: **0** across **0** distinct keys

## Numeric range checks

| column | min | max | non-numeric values (excl. blank) |
|---|---|---|---|
| abs | 10.0 | 593.0 | 0 |
| rate | 0.2 | 13.5 | 0 |

## State-name standardisation

- Distinct state values: 6
- All state names map cleanly to the 16 canonical DOSM states (or the `Malaysia` national sentinel).

## Temporal coverage

- Years present: 2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024