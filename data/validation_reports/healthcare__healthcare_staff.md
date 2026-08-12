# Validation report: `data/raw/healthcare/healthcare_staff.csv`

- Rows: **765**
- Columns: `date, state, type, staff`

## Missingness

| column | non-missing | missing (blank) | % missing |
|---|---|---|---|
| date | 765 | 0 | 0.0% |
| state | 765 | 0 | 0.0% |
| type | 765 | 0 | 0.0% |
| staff | 765 | 0 | 0.0% |

## Duplicates

- Exact duplicate rows: **0**
- Rows sharing a `date, state, type` key with another row: **0** across **0** distinct keys

## Numeric range checks

| column | min | max | non-numeric values (excl. blank) |
|---|---|---|---|
| staff | 6.0 | 167690.0 | 0 |

## State-name standardisation

- Distinct state values: 17
- All state names map cleanly to the 16 canonical DOSM states (or the `Malaysia` national sentinel).

## Temporal coverage

- Years present: 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022