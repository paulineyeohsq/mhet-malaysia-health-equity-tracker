# Validation report: `data/raw/health_outcomes/covid_deaths_linelist.csv`

- Rows: **37351**
- Columns: `date, date_announced, date_positive, date_dose1, date_dose2, date_dose3, brand1, brand2, brand3, state, age, male, bid, malaysian, comorb`

## Missingness

| column | non-missing | missing (blank) | % missing |
|---|---|---|---|
| date | 37351 | 0 | 0.0% |
| date_announced | 37351 | 0 | 0.0% |
| date_positive | 37351 | 0 | 0.0% |
| date_dose1 | 14876 | 22475 | 60.2% |
| date_dose2 | 9276 | 28075 | 75.2% |
| date_dose3 | 1543 | 35808 | 95.9% |
| brand1 | 14876 | 22475 | 60.2% |
| brand2 | 9276 | 28075 | 75.2% |
| brand3 | 1543 | 35808 | 95.9% |
| state | 37351 | 0 | 0.0% |
| age | 37351 | 0 | 0.0% |
| male | 37351 | 0 | 0.0% |
| bid | 37351 | 0 | 0.0% |
| malaysian | 37351 | 0 | 0.0% |
| comorb | 37351 | 0 | 0.0% |

## Duplicates

- Exact duplicate rows: **20**
- Rows sharing a `date, state, age` key with another row: **11960** across **4613** distinct keys

## Numeric range checks


## State-name standardisation

- Distinct state values: 16
- All state names map cleanly to the 16 canonical DOSM states (or the `Malaysia` national sentinel).

## Temporal coverage

- Years present: 2020, 2021, 2022, 2023, 2024