# Validation report: `data/raw/health_outcomes/death_sex_ethnic_state.csv`

- Rows: **8190**
- Columns: `state, date, sex, ethnicity, abs`

## Missingness

| column | non-missing | missing (blank) | % missing |
|---|---|---|---|
| state | 8190 | 0 | 0.0% |
| date | 8190 | 0 | 0.0% |
| sex | 8190 | 0 | 0.0% |
| ethnicity | 8190 | 0 | 0.0% |
| abs | 7998 | 192 | 2.3% |

## Duplicates

- Exact duplicate rows: **0**
- Rows sharing a `date, state, sex, ethnicity` key with another row: **0** across **0** distinct keys

## Numeric range checks

| column | min | max | non-numeric values (excl. blank) |
|---|---|---|---|
| abs | 0.0 | 42051.0 | 0 |

## State-name standardisation

- Distinct state values: 16
- All state names map cleanly to the 16 canonical DOSM states (or the `Malaysia` national sentinel).

## Temporal coverage

- Years present: 2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024