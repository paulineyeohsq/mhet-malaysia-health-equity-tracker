# Validation report: `data/raw/socioeconomic/hh_inequality_state.csv`

- Rows: **289**
- Columns: `state, date, gini`

## Missingness

| column | non-missing | missing (blank) | % missing |
|---|---|---|---|
| state | 289 | 0 | 0.0% |
| date | 289 | 0 | 0.0% |
| gini | 289 | 0 | 0.0% |

## Duplicates

- Exact duplicate rows: **0**
- Rows sharing a `date, state` key with another row: **0** across **0** distinct keys

## Numeric range checks

| column | min | max | non-numeric values (excl. blank) |
|---|---|---|---|
| gini | 0.263 | 0.612 | 0 |

## State-name standardisation

- Distinct state values: 16
- All state names map cleanly to the 16 canonical DOSM states (or the `Malaysia` national sentinel).

## Temporal coverage

- Years present: 1974, 1976, 1979, 1984, 1987, 1989, 1992, 1995, 1997, 1999, 2002, 2004, 2007, 2009, 2012, 2014, 2016, 2019, 2022, 2024
- Gap years within min–max range (expected — most DOSM series are irregular survey years, not annual): 1975, 1977, 1978, 1980, 1981, 1982, 1983, 1985, 1986, 1988, 1990, 1991, 1993, 1994, 1996, 1998, 2000, 2001, 2003, 2005, 2006, 2008, 2010, 2011, 2013, 2015, 2017, 2018, 2020, 2021, 2023