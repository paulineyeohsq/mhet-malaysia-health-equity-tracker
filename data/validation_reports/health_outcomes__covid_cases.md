# Validation report: `data/raw/health_outcomes/covid_cases.csv`

- Rows: **33218**
- Columns: `date, state, cases_new, cases_import, cases_recovered, cases_active, cases_cluster`

## Missingness

| column | non-missing | missing (blank) | % missing |
|---|---|---|---|
| date | 33218 | 0 | 0.0% |
| state | 33218 | 0 | 0.0% |
| cases_new | 33218 | 0 | 0.0% |
| cases_import | 33218 | 0 | 0.0% |
| cases_recovered | 33218 | 0 | 0.0% |
| cases_active | 33218 | 0 | 0.0% |
| cases_cluster | 33218 | 0 | 0.0% |

## Duplicates

- Exact duplicate rows: **0**
- Rows sharing a `date, state` key with another row: **0** across **0** distinct keys

## Numeric range checks


## State-name standardisation

- Distinct state values: 17
- All state names map cleanly to the 16 canonical DOSM states (or the `Malaysia` national sentinel).

## Temporal coverage

- Years present: 2020, 2021, 2022, 2023, 2024, 2025