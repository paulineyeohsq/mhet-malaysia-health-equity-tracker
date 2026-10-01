# Validation report: `data/raw/demography/population_district_full.csv`

- Rows: **383040**
- Columns: `state, district, date, sex, age, ethnicity, population`

## Missingness

| column | non-missing | missing (blank) | % missing |
|---|---|---|---|
| state | 383040 | 0 | 0.0% |
| district | 383040 | 0 | 0.0% |
| date | 383040 | 0 | 0.0% |
| sex | 383040 | 0 | 0.0% |
| age | 383040 | 0 | 0.0% |
| ethnicity | 383040 | 0 | 0.0% |
| population | 383040 | 0 | 0.0% |

## Duplicates

- Exact duplicate rows: **0**
- Rows sharing a `date, state, district, sex, age, ethnicity` key with another row: **0** across **0** distinct keys

## Numeric range checks

| column | min | max | non-numeric values (excl. blank) |
|---|---|---|---|
| population | 0.0 | 2370.6 | 0 |

## State-name standardisation

- Distinct state values: 16
- All state names map cleanly to the 16 canonical DOSM states (or the `Malaysia` national sentinel).

## District-name standardisation

- Distinct (state, district) pairs: 164

## Temporal coverage

- Years present: 2020, 2021, 2022, 2023, 2024, 2025