# Validation report: `data/raw/health_outcomes/std_state.csv`

- Rows: **480**
- Columns: `date, state, disease, cases, incidence`

## Missingness

| column | non-missing | missing (blank) | % missing |
|---|---|---|---|
| date | 480 | 0 | 0.0% |
| state | 480 | 0 | 0.0% |
| disease | 480 | 0 | 0.0% |
| cases | 480 | 0 | 0.0% |
| incidence | 480 | 0 | 0.0% |

## Duplicates

- Exact duplicate rows: **0**
- Rows sharing a `date, state, disease` key with another row: **0** across **0** distinct keys

## Numeric range checks

| column | min | max | non-numeric values (excl. blank) |
|---|---|---|---|
| cases | 0.0 | 4669.0 | 0 |
| incidence | 0.0 | 54.55 | 0 |

## State-name standardisation

- Distinct state values: 16
- All state names map cleanly to the 16 canonical DOSM states (or the `Malaysia` national sentinel).

## Temporal coverage

- Years present: 2017, 2018, 2019, 2020, 2021, 2022