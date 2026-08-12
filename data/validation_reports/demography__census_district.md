# Validation report: `data/raw/demography/census_district.csv`

- Rows: **960**
- Columns: `state, code_state, district, code_district, code_state_district, year, population_total, area_km2, population_growth, housing_total, housing_occupied, housing_empty, household_total, household_size_avg, sex_male, sex_female, nationality_citizen, nationality_non_citizen, ethnicity_bumi, ethnicity_chinese, ethnicity_indian, ethnicity_other, age_0_14, age_15_64, age_65_above, marital_of_age, marital_never_married, marital_married, marital_widowed, marital_separated, marital_unknown, religion_muslim, religion_christian, religion_buddhist, religion_hindu, religion_other, religion_atheist, religion_unknown, density_urban, density_rural, `

## Missingness

| column | non-missing | missing (blank) | % missing |
|---|---|---|---|
| state | 960 | 0 | 0.0% |
| code_state | 960 | 0 | 0.0% |
| district | 960 | 0 | 0.0% |
| code_district | 960 | 0 | 0.0% |
| code_state_district | 960 | 0 | 0.0% |
| year | 960 | 0 | 0.0% |
| population_total | 809 | 151 | 15.7% |
| area_km2 | 960 | 0 | 0.0% |
| population_growth | 648 | 312 | 32.5% |
| housing_total | 572 | 388 | 40.4% |
| housing_occupied | 572 | 388 | 40.4% |
| housing_empty | 571 | 389 | 40.5% |
| household_total | 572 | 388 | 40.4% |
| household_size_avg | 572 | 388 | 40.4% |
| sex_male | 809 | 151 | 15.7% |
| sex_female | 809 | 151 | 15.7% |
| nationality_citizen | 809 | 151 | 15.7% |
| nationality_non_citizen | 572 | 388 | 40.4% |
| ethnicity_bumi | 809 | 151 | 15.7% |
| ethnicity_chinese | 809 | 151 | 15.7% |
| ethnicity_indian | 760 | 200 | 20.8% |
| ethnicity_other | 806 | 154 | 16.0% |
| age_0_14 | 698 | 262 | 27.3% |
| age_15_64 | 698 | 262 | 27.3% |
| age_65_above | 698 | 262 | 27.3% |
| marital_of_age | 572 | 388 | 40.4% |
| marital_never_married | 572 | 388 | 40.4% |
| marital_married | 572 | 388 | 40.4% |
| marital_widowed | 572 | 388 | 40.4% |
| marital_separated | 572 | 388 | 40.4% |
| marital_unknown | 127 | 833 | 86.8% |
| religion_muslim | 572 | 388 | 40.4% |
| religion_christian | 572 | 388 | 40.4% |
| religion_buddhist | 572 | 388 | 40.4% |
| religion_hindu | 559 | 401 | 41.8% |
| religion_other | 570 | 390 | 40.6% |
| religion_atheist | 565 | 395 | 41.1% |
| religion_unknown | 498 | 462 | 48.1% |
| density_urban | 434 | 526 | 54.8% |
| density_rural | 681 | 279 | 29.1% |
|  | 161 | 799 | 83.2% |

## Duplicates

- Exact duplicate rows: **0**
- Rows sharing a `state, district` key with another row: **960** across **160** distinct keys

## Numeric range checks


## State-name standardisation

- Distinct state values: 16
- All state names map cleanly to the 16 canonical DOSM states (or the `Malaysia` national sentinel).

## District-name standardisation

- Distinct (state, district) pairs: 160