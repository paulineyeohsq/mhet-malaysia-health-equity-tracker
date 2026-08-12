# `/backend`

This directory is intentionally minimal in the current build.

## Why there's no live backend

The Malaysia Health Equity Tracker was built as a **self-contained static
application**: a Python ETL pipeline (`/scripts`) produces versioned static
JSON files (`/data/processed`, mirrored into `/frontend/public/data`), and
the React frontend (`/frontend`) reads those files directly at runtime via
`fetch()`. There is no API server, no live database connection, and no
server-side request handling anywhere in the deployed app.

This was a deliberate architecture decision (see `docs/METHODOLOGY.md` and
the in-app Methodology page), made explicitly because the environment this
project was first built and delivered in had no provisioned database or
hosting credentials (no Vercel/Supabase/Postgres instance to connect to).
Rather than scaffold a backend that could never be exercised or tested end
to end in that environment, the project instead:

- Prioritizes **reproducibility** — the entire "backend" is a handful of
  auditable Python scripts anyone can run locally or in CI.
- Prioritizes **deployability** — the built app is static HTML/CSS/JS plus
  static JSON, deployable to any static host (Vercel, Netlify, GitHub
  Pages, S3, etc.) with zero server configuration.
- Keeps the trust boundary simple: every number the frontend shows can be
  traced to a specific static JSON file, which can be traced to a specific
  government CSV, with no server-side transformation happening "live" that
  could silently diverge from the audited pipeline.

## If this project grows a real backend later

The static-JSON contract makes this a low-risk future upgrade, not a
rewrite: a thin API (FastAPI or Node/Express, per the original project
spec) could serve the exact same shapes currently in
`frontend/public/data/*.json` from a real Postgres/Supabase database seeded
by the same `scripts/transform_data.py` output, and the frontend's
`useData()` hook (`frontend/src/lib/useData.ts`) would only need its base
URL changed from `/data/<name>.json` to an API endpoint — the data
contracts (field names, types, null-handling semantics) were designed to
transfer directly. `/database` (see that directory's own README) sketches
the schema this would use.
