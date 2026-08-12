# Validation report: `data/raw/healthcare/hospital_beds_national.csv`

- Rows: **32**
- Columns: `date, state, district, type, beds`

## Missingness

| column | non-missing | missing (blank) | % missing |
|---|---|---|---|
| date | 32 | 0 | 0.0% |
| state | 32 | 0 | 0.0% |
| district | 32 | 0 | 0.0% |
| type | 32 | 0 | 0.0% |
| beds | 32 | 0 | 0.0% |

## Duplicates

- Exact duplicate rows: **0**
- Rows sharing a `date, state, district, type` key with another row: **0** across **0** distinct keys

## Numeric range checks

| column | min | max | non-numeric values (excl. blank) |
|---|---|---|---|
| beds | 3683.0 | 49985.0 | 0 |

## State-name standardisation

- Distinct state values: 1
- All state names map cleanly to the 16 canonical DOSM states (or the `Malaysia` national sentinel).

## District-name standardisation

- Distinct (state, district) pairs: 1

## Temporal coverage

- Years present: 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022