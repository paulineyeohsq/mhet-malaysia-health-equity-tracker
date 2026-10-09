# Validation report: `data/raw/socioeconomic/hh_access_amenities.csv`

- Rows: **694**
- Columns: `date, state, district, sanitation, electricity, piped_water`

## Missingness

| column | non-missing | missing (blank) | % missing |
|---|---|---|---|
| date | 694 | 0 | 0.0% |
| state | 694 | 0 | 0.0% |
| district | 694 | 0 | 0.0% |
| sanitation | 670 | 24 | 3.5% |
| electricity | 680 | 14 | 2.0% |
| piped_water | 677 | 17 | 2.4% |

## Duplicates

- Exact duplicate rows: **0**
- Rows sharing a `date, state, district` key with another row: **0** across **0** distinct keys

## Numeric range checks

| column | min | max | non-numeric values (excl. blank) |
|---|---|---|---|
| sanitation | 74.6 | 100.0 | 0 |
| electricity | 40.2 | 100.0 | 0 |
| piped_water | 3.7 | 100.0 | 0 |

## State-name standardisation

- Distinct state values: 16
- All state names map cleanly to the 16 canonical DOSM states (or the `Malaysia` national sentinel).

## District-name standardisation

- Distinct (state, district) pairs: 178

## Temporal coverage

- Years present: 2016, 2019, 2022, 2024
- Gap years within min–max range (expected — most DOSM series are irregular survey years, not annual): 2017, 2018, 2020, 2021, 2023