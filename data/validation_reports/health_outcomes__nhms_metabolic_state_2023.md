# Validation report: `data/raw/health_outcomes/nhms_metabolic_state_2023.csv`

- Rows: **144**
- Columns: `state, date, indicator, n, estimated_population, prevalence_pct, ci_lower, ci_upper, unreliable_estimate`

## Missingness

| column | non-missing | missing (blank) | % missing |
|---|---|---|---|
| state | 144 | 0 | 0.0% |
| date | 144 | 0 | 0.0% |
| indicator | 144 | 0 | 0.0% |
| n | 0 | 144 | 100.0% |
| estimated_population | 0 | 144 | 100.0% |
| prevalence_pct | 144 | 0 | 0.0% |
| ci_lower | 0 | 144 | 100.0% |
| ci_upper | 0 | 144 | 100.0% |
| unreliable_estimate | 144 | 0 | 0.0% |

## Duplicates

- Exact duplicate rows: **0**
- Rows sharing a `date, state` key with another row: **144** across **16** distinct keys

## Numeric range checks


## State-name standardisation

- Distinct state values: 16
- All state names map cleanly to the 16 canonical DOSM states (or the `Malaysia` national sentinel).

## Temporal coverage

- Years present: 2023