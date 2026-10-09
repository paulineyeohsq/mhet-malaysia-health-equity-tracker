# Validation report: `data/raw/demography/population_state.csv`

- Rows: **44688**
- Columns: `state, date, sex, age, ethnicity, population`

## Missingness

| column | non-missing | missing (blank) | % missing |
|---|---|---|---|
| state | 44688 | 0 | 0.0% |
| date | 44688 | 0 | 0.0% |
| sex | 44688 | 0 | 0.0% |
| age | 44688 | 0 | 0.0% |
| ethnicity | 44688 | 0 | 0.0% |
| population | 44688 | 0 | 0.0% |

## Duplicates

- Exact duplicate rows: **0**
- Rows sharing a `date, state, sex, age, ethnicity` key with another row: **0** across **0** distinct keys

## Numeric range checks

| column | min | max | non-numeric values (excl. blank) |
|---|---|---|---|
| population | 0.0 | 7454.2 | 0 |

## State-name standardisation

- Distinct state values: 16
- All state names map cleanly to the 16 canonical DOSM states (or the `Malaysia` national sentinel).

## Temporal coverage

- Years present: 2020, 2021, 2022, 2023, 2024, 2025, 2026