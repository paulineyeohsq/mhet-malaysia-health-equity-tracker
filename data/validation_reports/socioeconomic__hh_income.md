# Validation report: `data/raw/socioeconomic/hh_income.csv`

- Rows: **22**
- Columns: `date, income_mean, income_median`

## Missingness

| column | non-missing | missing (blank) | % missing |
|---|---|---|---|
| date | 22 | 0 | 0.0% |
| income_mean | 22 | 0 | 0.0% |
| income_median | 22 | 0 | 0.0% |

## Duplicates

- Exact duplicate rows: **0**
- Rows sharing a `date` key with another row: **0** across **0** distinct keys

## Numeric range checks

| column | min | max | non-numeric values (excl. blank) |
|---|---|---|---|
| income_mean | 264.0 | 9155.0 | 0 |
| income_median | 166.0 | 7017.0 | 0 |

## Temporal coverage

- Years present: 1970, 1974, 1976, 1979, 1984, 1987, 1989, 1992, 1995, 1997, 1999, 2002, 2004, 2007, 2009, 2012, 2014, 2016, 2019, 2020, 2022, 2024
- Gap years within min–max range (expected — most DOSM series are irregular survey years, not annual): 1971, 1972, 1973, 1975, 1977, 1978, 1980, 1981, 1982, 1983, 1985, 1986, 1988, 1990, 1991, 1993, 1994, 1996, 1998, 2000, 2001, 2003, 2005, 2006, 2008, 2010, 2011, 2013, 2015, 2017, 2018, 2021, 2023