# Validation report: `data/raw/socioeconomic/hh_poverty.csv`

- Rows: **21**
- Columns: `date, poverty_absolute, poverty_hardcore, poverty_relative`

## Missingness

| column | non-missing | missing (blank) | % missing |
|---|---|---|---|
| date | 21 | 0 | 0.0% |
| poverty_absolute | 21 | 0 | 0.0% |
| poverty_hardcore | 18 | 3 | 14.3% |
| poverty_relative | 14 | 7 | 33.3% |

## Duplicates

- Exact duplicate rows: **0**
- Rows sharing a `date` key with another row: **0** across **0** distinct keys

## Numeric range checks

| column | min | max | non-numeric values (excl. blank) |
|---|---|---|---|
| poverty_absolute | 0.4 | 49.3 | 0 |
| poverty_hardcore | 0.0 | 6.9 | 0 |
| poverty_relative | 15.6 | 20.0 | 0 |

## Temporal coverage

- Years present: 1970, 1976, 1979, 1984, 1987, 1989, 1992, 1995, 1997, 1999, 2002, 2004, 2007, 2009, 2012, 2014, 2016, 2019, 2020, 2022, 2024
- Gap years within min–max range (expected — most DOSM series are irregular survey years, not annual): 1971, 1972, 1973, 1974, 1975, 1977, 1978, 1980, 1981, 1982, 1983, 1985, 1986, 1988, 1990, 1991, 1993, 1994, 1996, 1998, 2000, 2001, 2003, 2005, 2006, 2008, 2010, 2011, 2013, 2015, 2017, 2018, 2021, 2023