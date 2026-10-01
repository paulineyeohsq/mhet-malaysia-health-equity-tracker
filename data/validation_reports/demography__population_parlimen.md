# Validation report: `data/raw/demography/population_parlimen.csv`

- Rows: **5550**
- Columns: `date, state, parlimen, sex, age, ethnicity, population`

## Missingness

| column | non-missing | missing (blank) | % missing |
|---|---|---|---|
| date | 5550 | 0 | 0.0% |
| state | 5550 | 0 | 0.0% |
| parlimen | 5550 | 0 | 0.0% |
| sex | 5550 | 0 | 0.0% |
| age | 5550 | 0 | 0.0% |
| ethnicity | 5550 | 0 | 0.0% |
| population | 5550 | 0 | 0.0% |

## Duplicates

- Exact duplicate rows: **0**
- Rows sharing a `date, state, sex, age, ethnicity` key with another row: **5500** across **350** distinct keys

## Numeric range checks

| column | min | max | non-numeric values (excl. blank) |
|---|---|---|---|
| population | 0.0 | 723.8 | 0 |

## State-name standardisation

- Distinct state values: 16
- All state names map cleanly to the 16 canonical DOSM states (or the `Malaysia` national sentinel).

## Temporal coverage

- Years present: 2020, 2021, 2022, 2023, 2024