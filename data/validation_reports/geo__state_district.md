# Validation report: `data/raw/geo/state_district.csv`

- Rows: **160**
- Columns: `state, district, code_state, code_district, code_state_district`

## Missingness

| column | non-missing | missing (blank) | % missing |
|---|---|---|---|
| state | 160 | 0 | 0.0% |
| district | 160 | 0 | 0.0% |
| code_state | 160 | 0 | 0.0% |
| code_district | 160 | 0 | 0.0% |
| code_state_district | 160 | 0 | 0.0% |

## Duplicates

- Exact duplicate rows: **0**
- Rows sharing a `state, district` key with another row: **0** across **0** distinct keys

## Numeric range checks


## State-name standardisation

- Distinct state values: 16
- All state names map cleanly to the 16 canonical DOSM states (or the `Malaysia` national sentinel).

## District-name standardisation

- Distinct (state, district) pairs: 160