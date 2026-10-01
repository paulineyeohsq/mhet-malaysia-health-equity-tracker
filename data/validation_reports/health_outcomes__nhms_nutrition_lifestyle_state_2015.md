# Validation report: `data/raw/health_outcomes/nhms_nutrition_lifestyle_state_2015.csv`

- Rows: **60**
- Columns: `state, date, indicator, n, estimated_population, prevalence_pct, ci_lower, ci_upper, unreliable_estimate`

## Missingness

| column | non-missing | missing (blank) | % missing |
|---|---|---|---|
| state | 60 | 0 | 0.0% |
| date | 60 | 0 | 0.0% |
| indicator | 60 | 0 | 0.0% |
| n | 60 | 0 | 0.0% |
| estimated_population | 60 | 0 | 0.0% |
| prevalence_pct | 60 | 0 | 0.0% |
| ci_lower | 60 | 0 | 0.0% |
| ci_upper | 60 | 0 | 0.0% |
| unreliable_estimate | 60 | 0 | 0.0% |

## Duplicates

- Exact duplicate rows: **0**
- Rows sharing a `date, state` key with another row: **60** across **15** distinct keys

## Numeric range checks


## State-name standardisation

- Distinct state values: 15
- All state names map cleanly to the 16 canonical DOSM states (or the `Malaysia` national sentinel).

## Temporal coverage

- Years present: 2015