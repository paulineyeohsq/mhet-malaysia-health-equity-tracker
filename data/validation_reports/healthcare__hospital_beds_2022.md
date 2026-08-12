# Validation report: `data/raw/healthcare/hospital_beds_2022.csv`

- Rows: **170**
- Columns: `date, state, district, type, beds`

## Missingness

| column | non-missing | missing (blank) | % missing |
|---|---|---|---|
| date | 170 | 0 | 0.0% |
| state | 170 | 0 | 0.0% |
| district | 170 | 0 | 0.0% |
| type | 170 | 0 | 0.0% |
| beds | 170 | 0 | 0.0% |

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

- Distinct (state, district) pairs: 170

## Temporal coverage

- Years present: 2022