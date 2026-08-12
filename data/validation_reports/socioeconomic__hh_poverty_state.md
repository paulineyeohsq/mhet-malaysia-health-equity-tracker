# Validation report: `data/raw/socioeconomic/hh_poverty_state.csv`

- Rows: **310**
- Columns: `state, date, poverty_absolute, poverty_hardcore, poverty_relative`

## Missingness

| column | non-missing | missing (blank) | % missing |
|---|---|---|---|
| state | 310 | 0 | 0.0% |
| date | 310 | 0 | 0.0% |
| poverty_absolute | 308 | 2 | 0.6% |
| poverty_hardcore | 271 | 39 | 12.6% |
| poverty_relative | 217 | 93 | 30.0% |

## Duplicates

- Exact duplicate rows: **0**
- Rows sharing a `date, state` key with another row: **0** across **0** distinct keys

## Numeric range checks

| column | min | max | non-numeric values (excl. blank) |
|---|---|---|---|
| poverty_absolute | 0.0 | 76.1 | 0 |
| poverty_hardcore | 0.0 | 15.5 | 0 |
| poverty_relative | 4.9 | 21.6 | 0 |

## State-name standardisation

- Distinct state values: 16
- All state names map cleanly to the 16 canonical DOSM states (or the `Malaysia` national sentinel).

## Temporal coverage

- Years present: 1970, 1976, 1979, 1984, 1987, 1989, 1992, 1995, 1997, 1999, 2002, 2004, 2007, 2009, 2012, 2014, 2016, 2019, 2020, 2022, 2024
- Gap years within min–max range (expected — most DOSM series are irregular survey years, not annual): 1971, 1972, 1973, 1974, 1975, 1977, 1978, 1980, 1981, 1982, 1983, 1985, 1986, 1988, 1990, 1991, 1993, 1994, 1996, 1998, 2000, 2001, 2003, 2005, 2006, 2008, 2010, 2011, 2013, 2015, 2017, 2018, 2021, 2023