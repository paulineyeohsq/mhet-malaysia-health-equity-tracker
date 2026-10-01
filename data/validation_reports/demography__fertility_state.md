# Validation report: `data/raw/demography/fertility_state.csv`

- Rows: **3000**
- Columns: `state, date, age_group, fertility_rate`

## Missingness

| column | non-missing | missing (blank) | % missing |
|---|---|---|---|
| state | 3000 | 0 | 0.0% |
| date | 3000 | 0 | 0.0% |
| age_group | 3000 | 0 | 0.0% |
| fertility_rate | 3000 | 0 | 0.0% |

## Duplicates

- Exact duplicate rows: **0**
- Rows sharing a `date, state` key with another row: **3000** across **375** distinct keys

## Numeric range checks


## State-name standardisation

- Distinct state values: 16
- All state names map cleanly to the 16 canonical DOSM states (or the `Malaysia` national sentinel).

## Temporal coverage

- Years present: 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009, 2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024