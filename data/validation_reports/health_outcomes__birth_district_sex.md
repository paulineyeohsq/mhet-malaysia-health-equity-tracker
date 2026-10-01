# Validation report: `data/raw/health_outcomes/birth_district_sex.csv`

- Rows: **2361**
- Columns: `date, state, district, sex, abs, rate`

## Missingness

| column | non-missing | missing (blank) | % missing |
|---|---|---|---|
| date | 2361 | 0 | 0.0% |
| state | 2361 | 0 | 0.0% |
| district | 2361 | 0 | 0.0% |
| sex | 2361 | 0 | 0.0% |
| abs | 2361 | 0 | 0.0% |
| rate | 2361 | 0 | 0.0% |

## Duplicates

- Exact duplicate rows: **0**
- Rows sharing a `date, state, district, sex` key with another row: **0** across **0** distinct keys

## Numeric range checks

| column | min | max | non-numeric values (excl. blank) |
|---|---|---|---|
| abs | 43.0 | 28048.0 | 0 |
| rate | 1.902654867256637 | 44.367816091954026 | 0 |

## State-name standardisation

- Distinct state values: 16
- All state names map cleanly to the 16 canonical DOSM states (or the `Malaysia` national sentinel).

## District-name standardisation

- Distinct (state, district) pairs: 160

## Temporal coverage

- Years present: 2020, 2021, 2022, 2023, 2024