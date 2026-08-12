# Malaysia Health Equity Tracker

A static React + TypeScript dashboard for exploring health inequity in
Malaysia, built entirely from real, publicly available Malaysian government
open data — **no synthetic, simulated, or invented data anywhere in the
pipeline or the app.**

The project answers one guiding research question:

> **Where are health inequalities greatest in Malaysia, who is affected, and
> how do socioeconomic conditions relate to health outcomes?**

It integrates official statistics from the Department of Statistics Malaysia
(DOSM), the Ministry of Health Malaysia (MOH), and the National Registration
Department (NRD) at the national, state, and district level, so a
researcher, policymaker, or member of the public can explore income,
poverty, healthcare access, and health-outcome data without independently
collecting, cleaning, and joining dozens of raw government CSV files
themselves.

Every number shown anywhere on the dashboard traces back to a specific,
citable dataset published on [data.gov.my](https://data.gov.my/data-catalogue)
or the official [dosm-malaysia/data-open](https://github.com/dosm-malaysia/data-open)
GitHub mirror. Where a figure cannot be derived from the source data without
an unjustified assumption, the dashboard shows "No data" rather than a guess.

## Repo structure

```
mhet/
├── frontend/            React + TypeScript + Vite dashboard (the deployable app)
├── data/
│   ├── raw/              Untouched CSV/GeoJSON files as fetched from source (never hand-edited)
│   │   ├── socioeconomic/    HIES income, poverty, Gini, basic-amenities access
│   │   ├── demography/       Population & census tables
│   │   ├── healthcare/       Hospital beds, healthcare staff
│   │   ├── health_outcomes/  Deaths, births, immunisation, nutrition, STDs
│   │   └── geo/               DOSM administrative boundary GeoJSON + open-data licence
│   ├── processed/        Master analytical JSON/CSV files built by scripts/transform_data.py
│   │   └── geo/               Copy-through state/district boundary GeoJSON for the choropleth map
│   ├── inventory/         dataset_inventory.json — machine-readable catalogue of all 24 ingested
│   │                       + 9 identified-but-not-ingested datasets
│   └── validation_reports/  One Markdown data-quality report per raw CSV, plus an index
├── scripts/              Python ETL pipeline: ingest -> validate -> geo lookup -> transform -> sync
├── backend/               Intentionally minimal — explains why there is no live backend (see below)
├── database/              Intentionally minimal — sketches the schema a future DB-backed version would use
├── docs/                  This documentation: DATA_DICTIONARY.md, DATA_SOURCES.md, METHODOLOGY.md
└── .github/workflows/     update-data.yml — scheduled pipeline re-run workflow
```

## Tech stack

**Frontend** (`frontend/`, see `frontend/package.json`):
- React 19.2 + TypeScript, built with Vite 8
- Tailwind CSS v4 (`@tailwindcss/postcss`)
- [Recharts](https://recharts.org/) 3.10 for charts
- [Leaflet](https://leafletjs.com/) 1.9 / [react-leaflet](https://react-leaflet.js.org/) 5.0 for the interactive choropleth map
- [react-router-dom](https://reactrouter.com/) 7.18 (hash-based routing, `HashRouter`)
- [simple-statistics](https://simple-statistics.github.io/) 7.10 and [d3-scale](https://d3js.org/d3-scale) for the Inequality Analytics page's regressions and colour scales
- Linting via `oxlint`

**Data pipeline** (`scripts/`, `data/`):
- Python 3 standard library (`csv`, `json`, `urllib`) for ingest/transform/validate
- [shapely](https://shapely.readthedocs.io/) for computing real geometric centroids from DOSM's official boundary polygons

## The 9 dashboard pages

Routes are defined in `frontend/src/App.tsx`; labels come from
`frontend/src/components/Layout.tsx`:

| Route | Page |
|---|---|
| `/` | Overview |
| `/map` | Health Equity Map |
| `/socioeconomic` | Socioeconomic Inequality |
| `/health-outcomes` | Health Outcomes |
| `/healthcare-access` | Healthcare Access |
| `/population` | Population Equity |
| `/analytics` | Inequality Analytics |
| `/explorer` | Data Explorer |
| `/methodology` | Methodology |

## How to run locally

```bash
cd frontend
npm install
npm run dev
```

This starts the Vite dev server (see the `dev` script in
`frontend/package.json`). The app reads its data from static JSON files at
`frontend/public/data/` via `fetch()` — no backend process is required.

**Build for production:**

```bash
cd frontend
npm run build
```

This runs `tsc -b && vite build` (per `frontend/package.json`) and outputs a
fully static site to `frontend/dist/`. Preview the production build locally
with `npm run preview`.

**Re-run the data pipeline:**

```bash
# Rebuild processed JSON from the existing data/raw/ contents, no network access required:
python3 scripts/update_database.py --skip-ingest

# Full refresh: re-fetch data/raw/ from data.gov.my/DOSM/MOH first, then rebuild
# (requires outbound internet access):
python3 scripts/update_database.py
```

`scripts/update_database.py` orchestrates the full pipeline (ingest ->
validate -> transform -> sync into `frontend/public/data/`), snapshotting the
previous `frontend/public/data/` contents to a `.backup/` folder first and
leaving them untouched if any stage fails. See
[`docs/METHODOLOGY.md`](docs/METHODOLOGY.md) for the stage-by-stage detail
and the individual scripts (`scripts/ingest_data.py`,
`scripts/validate_data.py`, `scripts/build_geo_lookup.py`,
`scripts/transform_data.py`) for exact per-script behaviour.

## How to deploy

The built app (`frontend/dist/` after `npm run build`) is a plain static
site — HTML, CSS, JS, and static JSON data files — deployable to any static
host with no server-side configuration:

- **Vercel / Netlify (Git-connected):** connect the repository, set the
  base/root directory to `frontend`, the build command to `npm run build`,
  and the output/publish directory to `dist` (i.e. `frontend/dist`).
- **Vercel / Netlify (CLI or drag-and-drop):** run `npm run build` inside
  `frontend/` locally, then deploy the resulting `frontend/dist/` folder
  directly (e.g. `vercel deploy frontend/dist` or drag the `dist` folder
  into Netlify's manual-deploy UI).
- **Any other static host** (S3 + CloudFront, etc.): upload the contents of
  `frontend/dist/` as-is. Note that routing uses `HashRouter` (URLs like
  `#/map`), so no server-side rewrite rules are needed for client-side
  routes to work on a plain static host.

### GitHub Pages

This repo includes a ready-to-use workflow at
[`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)
that builds the frontend and publishes it automatically on every push to
`main`, using GitHub's official Pages Actions (`upload-pages-artifact` +
`deploy-pages` — no `gh-pages` branch or personal access token needed). To
turn it on:

1. Push this repo to GitHub.
2. In the repo, go to **Settings → Pages → Build and deployment → Source**
   and choose **GitHub Actions**.
3. Push to `main` (or run the workflow manually from the **Actions** tab) —
   the site will build and publish to
   `https://<your-username>.github.io/<repo-name>/`.

`vite.config.ts` uses a relative base path (`base: './'`), and routing uses
`HashRouter`, so the build works correctly at a GitHub Pages *project* site
subpath (`/<repo-name>/`) with no further configuration — verified by
serving the production build from a simulated subpath during QA.

See [`backend/README.md`](backend/README.md) for why this project ships as a
static site rather than with a live API/database.

## Documentation

- [`docs/DATA_DICTIONARY.md`](docs/DATA_DICTIONARY.md) — field-by-field
  reference for every processed JSON/CSV file the frontend reads.
- [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md) — the full catalogue of all
  24 ingested and 9 identified-but-not-ingested source datasets.
- [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md) — the technical pipeline
  methodology: architecture, geographic harmonisation, missing-data policy,
  inequality-measure statistics, and known limitations.

## Limitations at a glance

Irregular HIES survey years, several single-snapshot-year datasets
(district amenities and district hospital beds are both 2022-only), no
ethnicity-linked health outcome data, public-sector-only healthcare
workforce counts, and no composite "equity score" (a deliberate design
decision, not an oversight). See
[`docs/METHODOLOGY.md`](docs/METHODOLOGY.md#9-limitations) for the full,
itemised list with the reasoning behind each one.

## Data licence and attribution

All underlying data is sourced from DOSM, MOH, and NRD via data.gov.my and
the official `dosm-malaysia/data-open` GitHub mirror. DOSM's own
`data/raw/geo/DOSM_DATA_OPEN_LICENSE.md` (the Open Data Licence covering the
administrative boundary files used here) permits copying, publishing,
distributing, adapting, and commercial/non-commercial exploitation of the
data, provided the use does not suggest official endorsement by DOSM or any
agency, and does not extend to any personal data, third-party rights,
patents, trademarks, or design rights within the datasets. All datasets
remain the intellectual property of DOSM unless stated otherwise. This
project is a research and public-interest prototype, not an official DOSM,
MOH, or Government of Malaysia product.
