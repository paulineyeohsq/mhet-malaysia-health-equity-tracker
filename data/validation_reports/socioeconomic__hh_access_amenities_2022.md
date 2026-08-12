# Validation report: `data/raw/socioeconomic/hh_access_amenities_2022.csv`

- Rows: **172**
- Columns: `date, state, district, sanitation, electricity, piped_water`

## Missingness

| column | non-missing | missing (blank) | % missing |
|---|---|---|---|
| date | 172 | 0 | 0.0% |
| state | 172 | 0 | 0.0% |
| district | 172 | 0 | 0.0% |
| sanitation | 172 | 0 | 0.0% |
| electricity | 171 | 1 | 0.6% |
| piped_water | 171 | 1 | 0.6% |

## Duplicates

- Exact duplicate rows: **0**
- Rows sharing a `date, state, district` key with another row: **0** across **0** distinct keys

## Numeric range checks

| column | min | max | non-numeric values (excl. blank) |
|---|---|---|---|
| sanitation | 84.15 | 100.0 | 0 |
| electricity | 40.2 | 100.0 | 0 |
| piped_water | 21.6 | 100.0 | 0 |

## State-name standardisation

- Distinct state values: 16
- All state names map cleanly to the 16 canonical DOSM states (or the `Malaysia` national sentinel).

## District-name standardisation

- Distinct (state, district) pairs: 172

## Temporal coverage

- Years present: 2022