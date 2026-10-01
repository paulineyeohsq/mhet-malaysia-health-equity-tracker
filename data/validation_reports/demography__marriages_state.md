# Validation report: `data/raw/demography/marriages_state.csv`

- Rows: **192**
- Columns: `state, date, sex, abs, rate`

## Missingness

| column | non-missing | missing (blank) | % missing |
|---|---|---|---|
| state | 192 | 0 | 0.0% |
| date | 192 | 0 | 0.0% |
| sex | 192 | 0 | 0.0% |
| abs | 192 | 0 | 0.0% |
| rate | 192 | 0 | 0.0% |

## Duplicates

- Exact duplicate rows: **0**
- Rows sharing a `date, state, sex` key with another row: **0** across **0** distinct keys

## Numeric range checks

| column | min | max | non-numeric values (excl. blank) |
|---|---|---|---|
| abs | 397.0 | 42825.0 | 0 |
| rate | 10.8 | 38.8 | 0 |

## State-name standardisation

- Distinct state values: 16
- All state names map cleanly to the 16 canonical DOSM states (or the `Malaysia` national sentinel).

## Temporal coverage

- Years present: 2017, 2018, 2019, 2020, 2021, 2022