# `/database`

Like `/backend`, this directory holds no live database in the current
build — see `/backend/README.md` for the full reasoning behind the
static-JSON architecture actually shipped.

## What would live here in a database-backed version

If this project is extended with a real PostgreSQL/Supabase database, the
processed static JSON files in `data/processed/` map directly onto tables,
since `scripts/transform_data.py` already produces them in a flat,
one-row-per-observation shape:

| Table (proposed)              | Sourced from                                | Grain |
|---|---|---|
| `geo_state`                   | `data/processed/geo_lookup.csv` (state rows) | one row per state |
| `geo_district`                | `data/processed/geo_lookup.csv` (district rows) | one row per district |
| `socioeconomic_national`      | `socioeconomic_national.json` | year |
| `socioeconomic_state`         | `socioeconomic_state.json` | state × year |
| `socioeconomic_district`      | `socioeconomic_district.json` | state × district × year |
| `population_state`            | `population_state.json` | state × year × sex |
| `population_district`         | `population_district.json` | state × district × census year |
| `healthcare_access_state`     | `healthcare_access_state.json` | state × year |
| `healthcare_access_national`  | `healthcare_access_national.json` | year |
| `healthcare_access_district_2022` | `healthcare_access_district_2022.json` | state × district (2022 only) |
| `health_outcomes_state`       | `health_outcomes_state.json` | state × year |
| `immunisation_national`       | `immunisation_national.json` | year × disease |
| `nutrition_national`          | `nutrition_national.json` | year × sex × indicator × range |
| `dataset_inventory`           | `data/inventory/dataset_inventory.json` | one row per source dataset (provenance) |

`geo_state.state_code`/`geo_district.district_code` (from `geo_lookup.csv`)
would be the join keys / foreign keys for every other table's `state`/
`district` text column, per the project's geographic-harmonisation design
(`scripts/geo_utils.py` — canonical names only, no free-text state/district
values anywhere downstream of the ETL).

`scripts/update_database.py` already contains the natural seam for this:
its final "sync" stage currently copies JSON files into
`frontend/public/data/`; in a database-backed version that stage would
instead `COPY`/`INSERT` the same rows into these tables (e.g. via
`psycopg2`/`asyncpg`/the Supabase Python client), with the ingest/validate/
transform stages unchanged.

No schema migration files are included here because there is no database
to migrate in the current static-site build — adding them for a database
that will never be created in this session's environment would not be
verifiable and risks silently drifting from whatever the real target
database ends up being.
