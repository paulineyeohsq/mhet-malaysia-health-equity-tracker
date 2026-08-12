# Validation report: `data/raw/socioeconomic/hh_poverty_district.csv`

- Rows: **480**
- Columns: `state, district, date, poverty_absolute, poverty_relative`

## Missingness

| column | non-missing | missing (blank) | % missing |
|---|---|---|---|
| state | 480 | 0 | 0.0% |
| district | 480 | 0 | 0.0% |
| date | 480 | 0 | 0.0% |
| poverty_absolute | 480 | 0 | 0.0% |
| poverty_relative | 480 | 0 | 0.0% |

## Duplicates

- Exact duplicate rows: **0**
- Rows sharing a `date, state, district` key with another row: **0** across **0** distinct keys

## Numeric range checks

| column | min | max | non-numeric values (excl. blank) |
|---|---|---|---|
| poverty_absolute | 0.0 | 56.6 | 0 |
| poverty_relative | 0.0 | 60.0 | 0 |

## State-name standardisation

- Distinct state values: 16
- All state names map cleanly to the 16 canonical DOSM states (or the `Malaysia` national sentinel).

## District-name standardisation

- Distinct (state, district) pairs: 172

## Temporal coverage

- Years present: 2019, 2022, 2024
- Gap years within min–max range (expected — most DOSM series are irregular survey years, not annual): 2020, 2021, 2023