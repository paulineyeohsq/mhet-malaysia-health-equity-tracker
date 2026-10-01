# Validation report: `data/raw/demography/population_dun.csv`

- Rows: **15000**
- Columns: `date, state, parlimen, dun, sex, age, ethnicity, population`

## Missingness

| column | non-missing | missing (blank) | % missing |
|---|---|---|---|
| date | 15000 | 0 | 0.0% |
| state | 15000 | 0 | 0.0% |
| parlimen | 15000 | 0 | 0.0% |
| dun | 15000 | 0 | 0.0% |
| sex | 15000 | 0 | 0.0% |
| age | 15000 | 0 | 0.0% |
| ethnicity | 15000 | 0 | 0.0% |
| population | 15000 | 0 | 0.0% |

## Duplicates

- Exact duplicate rows: **0**
- Rows sharing a `date, state, sex, age, ethnicity` key with another row: **15000** across **325** distinct keys

## Numeric range checks

| column | min | max | non-numeric values (excl. blank) |
|---|---|---|---|
| population | 0.0 | 323.4 | 0 |

## State-name standardisation

- Distinct state values: 13
- All state names map cleanly to the 16 canonical DOSM states (or the `Malaysia` national sentinel).

## Temporal coverage

- Years present: 2020, 2021, 2022, 2023, 2024