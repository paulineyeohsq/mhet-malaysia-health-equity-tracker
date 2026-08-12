# Validation report: `data/raw/healthcare/hospital_beds_national.csv`

- Rows: **5468**
- Columns: `date, state, district, type, beds`

## Missingness

| column | non-missing | missing (blank) | % missing |
|---|---|---|---|
| date | 5468 | 0 | 0.0% |
| state | 5468 | 0 | 0.0% |
| district | 5468 | 0 | 0.0% |
| type | 5468 | 0 | 0.0% |
| beds | 5468 | 0 | 0.0% |

## Duplicates

- Exact duplicate rows: **0**
- Rows sharing a `date, state, district, type` key with another row: **0** across **0** distinct keys

## Numeric range checks

| column | min | max | non-numeric values (excl. blank) |
|---|---|---|---|
| beds | 0.0 | 49985.0 | 0 |

## State-name standardisation

- Distinct state values: 17
- All state names map cleanly to the 16 canonical DOSM states (or the `Malaysia` national sentinel).

## District-name standardisation

- Distinct (state, district) pairs: 171

## Temporal coverage

- Years present: 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022