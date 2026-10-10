# Malaysia Health Equity Observatory (MY-HEO)

**Live site:** <https://my-heo.netlify.app/> (the original GitHub Pages site, <https://paulineyeohsq.github.io/mhet-malaysia-health-equity-tracker/>, still works)

MY-HEO is a static React + TypeScript dashboard for exploring health inequity in
Malaysia, built entirely from real, publicly available Malaysian government open
data — **no synthetic, simulated, or invented data anywhere in the pipeline or
the app.** It adds an optional AI research assistant that is grounded in the same
published data.

It answers one guiding research question:

> **Where are health inequalities greatest in Malaysia, who is affected, and how
> do socioeconomic conditions relate to health outcomes?**

It integrates official statistics from the Department of Statistics Malaysia
(DOSM), the Ministry of Health Malaysia (MOH), the Institute for Public Health
(NHMS surveys) and the National Registration Department (NRD) at national,
state and district level, so a researcher, policymaker or member of the public
can explore income, poverty, healthcare access and health outcomes without
collecting, cleaning and joining dozens of raw government CSV files themselves.

Every number shown traces back to a specific, citable dataset on
[data.gov.my](https://data.gov.my/data-catalogue) or the official
[dosm-malaysia/data-open](https://github.com/dosm-malaysia/data-open) mirror.
Where a figure cannot be derived without an unjustified assumption, the
dashboard shows "No data" rather than a guess. Missing is never treated as zero,
correlations are never presented as causes, and there is deliberately no
composite "equity score".

## How it fits together

```
 data.gov.my / DOSM / MOH                    GitHub Actions (weekly + on push)
        │                                              │
        ▼                                              ▼
  scripts/ (Python, stdlib)  ───►  frontend/public/data/*.json  ───►  GitHub Pages
  ingest → validate → transform         (static, versioned)         (React app, HashRouter)
                                                                          │
                                                       "Explain this" / research cards
                                                                          ▼
                                                 netlify-chat/ (Netlify Edge Function)
                                                                          ▼
                                                              Google Gemini (API key held
                                                              server-side, never in the browser)
```

- **The site** is plain static files on GitHub Pages. No server, database or
  account is involved in showing data.
- **The AI features** (the chat assistant panel, "Explain this", Research
  Opportunities cards) call one Netlify Edge Function, [`netlify-chat/`](netlify-chat/),
  which holds the Gemini API key, adds the page's published data as context,
  rate-limits requests (per client, plus a global daily cap) and calls Gemini.
  See [`netlify-chat/README.md`](netlify-chat/README.md). Everything else works
  without it.
- **The data** is rebuilt by the Python pipeline in [`scripts/`](scripts/). A
  scheduled workflow ([`update-data.yml`](.github/workflows/update-data.yml)) runs
  it every Monday with no manual step and publishes the result only if every test
  passes (see "Automatic data updates" below).

## Repo structure

```
mhet/
├── frontend/            React + TypeScript + Vite dashboard (the deployable app)
├── netlify-chat/        Chat proxy: Netlify Edge Function → Gemini (the only server-side code)
├── data/
│   ├── raw/              Untouched CSV/GeoJSON as fetched from source (never hand-edited)
│   ├── processed/        Analytical JSON built by scripts/transform_data.py
│   ├── inventory/        dataset_inventory.json — machine-readable catalogue of every dataset
│   └── validation_reports/  One Markdown data-quality report per raw CSV, plus an index
├── scripts/              Python ETL: ingest → validate → geo lookup → transform → sync
├── backend/              Explains why there is no live API/database (see its README)
├── database/             Sketch of the schema a future DB-backed version would use
├── docs/                 DATA_DICTIONARY.md, DATA_SOURCES.md, METHODOLOGY.md
└── .github/workflows/    deploy-pages.yml (publish on push to main), update-data.yml (weekly refresh)
```

## The pages

Routes are defined in `frontend/src/App.tsx`; the navigation is in `frontend/src/components/Layout.tsx` (a sidebar on
desktop, a collapsible menu on phones). The sidebar has 13 links. Two of them are consolidated pages that show one of
several views of the same kind, each view being the original page unchanged; the original URLs redirect to the new ones,
so old bookmarks and links still work. Unknown URLs show a "page not found" view, and a crash on one page is contained by
an error boundary so the rest of the app keeps working.

| Group | Route | Page |
|---|---|---|
| | `/` | Home (equity-gap snapshot, and the "Is the data up to date?" card) |
| Who and where | `/population` | Population Explorer |
| Who and where | `/map` | Geographic Explorer (state/district choropleth) |
| Topics and patterns | `/topics/:topic` | **Health Topics**: a dropdown switches between `outcomes` (was `/health-outcomes`), `access` (`/healthcare-access`), `financing` (`/financing`) and `environment` (`/environment`) |
| Topics and patterns | `/patterns/:view` | **Patterns & Inequality**: a toggle switches between `trends` (was `/trends`), `matrix` (`/matrix`) and `inequality` (`/socioeconomic`) |
| Topics and patterns | `/determinants` | Determinants Explorer (correlations between an outcome and a determinant) |
| Equity gap | `/analytics` | Equity Gap Analysis |
| Equity gap | `/state-matrix` | State Equity Gap Matrix |
| Priority & opportunity | `/priority-areas` | Priority Areas (every indicator scored, with the weights and equity gap explained) |
| Priority & opportunity | `/research-opportunities` | Research Opportunities (AI-assisted research questions) |
| Researcher tools | `/explorer` | Data Explorer |
| Researcher tools | `/data-gaps` | Data Gaps (what is missing and each dataset's limitations) |
| About | `/methodology` | Data Governance & Terms (purpose, data sources, limitations, privacy, contact, glossary) |

## Tech stack

**Frontend** (`frontend/`, see `frontend/package.json`):
- React 19 + TypeScript, built with Vite 8; pages are code-split with `React.lazy`
- Tailwind CSS v4
- [Recharts](https://recharts.org/) for charts
- [Leaflet](https://leafletjs.com/) / [react-leaflet](https://react-leaflet.js.org/) for the choropleth maps
- [react-router-dom](https://reactrouter.com/) 7 (hash-based routing, so any static host works)
- [simple-statistics](https://simple-statistics.github.io/) and d3-scale for the correlation and gap statistics
- Linting via `oxlint`

**Data pipeline** (`scripts/`, `data/`):
- Python 3 standard library (`csv`, `json`, `urllib`) for ingest/transform/validate
- [shapely](https://shapely.readthedocs.io/) for geometric centroids from DOSM's boundary polygons

**AI proxy** (`netlify-chat/`): a Netlify Edge Function (Deno) calling the Google
Gemini API, with per-client rate limiting and a daily request cap in Netlify Blobs.

## How to run locally

```bash
cd frontend
npm install
npm run dev
```

The app reads static JSON from `frontend/public/data/` — no backend process is
needed. AI features call the deployed Netlify function (its CORS allow-list
includes `http://localhost:5173`); set `VITE_CHAT_URL` to point at a different
deployment.

**Build for production** (`tsc -b && vite build`, output in `frontend/dist/`):

```bash
cd frontend
npm run build
npm run preview   # serve the production build locally
```

**Run the tests** (from `frontend/`):

```bash
npm run lint        # oxlint - must report 0 warnings
npm test            # Vitest: unit tests for src/lib (equity, correlation, priority score, data age, colour contrast)
                    #         and consistency checks against public/data
npm run build
npx playwright install chromium   # once
npm run test:e2e    # Playwright against the production build, at 1440 px and 390 px:
                    #   every route loads with no console errors, failed/third-party requests or horizontal
                    #   overflow; 404 and error-boundary fallbacks; mobile menu; AI error handling;
                    #   axe-core WCAG 2.1 A/AA on every page; chart and map text alternatives
node e2e/page-weights.mjs http://localhost:4173/   # cold-load page weight per route (needs `npx vite preview`)
```

[`deploy-pages.yml`](.github/workflows/deploy-pages.yml) runs lint, the unit tests, the build and the browser
tests before publishing; [`ci.yml`](.github/workflows/ci.yml) runs the same on every pull request.

**Re-run the data pipeline:**

```bash
# Rebuild processed JSON from the existing data/raw/ contents (no network needed):
python3 scripts/update_database.py --skip-ingest

# Full refresh: re-fetch data/raw/ from data.gov.my/DOSM/MOH first, then rebuild
# (needs outbound internet access):
python3 scripts/update_database.py
```

`scripts/update_database.py` orchestrates ingest → validate → transform → sync into
`frontend/public/data/`, snapshotting the previous contents to a `.backup/` folder
and leaving them untouched if any stage fails. See
[`docs/METHODOLOGY.md`](docs/METHODOLOGY.md) for the stage-by-stage detail.

## Automatic data updates

[`update-data.yml`](.github/workflows/update-data.yml) runs every Monday at 02:00 UTC (10:00 Malaysia time) and on
demand (**Actions → Update data → Run workflow**). With no manual step it:

1. re-fetches every source dataset (`scripts/ingest_data.py`; each fetch is retried, and a download with more than
   10% fewer rows than the file on disk is refused as truncated and the old file kept);
2. validates, transforms, and syncs into `frontend/public/data/` (`scripts/update_database.py`);
3. runs the same gates as any code change: lint, unit and data-consistency tests, build, and the Playwright and
   axe suites against the refreshed data;
4. then, if the data changed and nothing looks wrong, commits to `main` and triggers the deploy. If anything looks
   wrong (a dataset failed or was refused, a file lost more than 10% of its rows, a latest year went backwards) it
   opens a pull request instead; if the run fails it opens (or updates) an issue titled "Automated data refresh
   failed" and publishes nothing. The issue closes itself on the next clean run.

**Reading report tables.** The NHMS state and national tables that are published only as PDF reports are read by the
pipeline itself (`scripts/nhms_pdf.py`, using `pdftotext -raw`): nothing is typed in. Each table must have a MALAYSIA row,
every prevalence inside its own confidence interval, and every breakdown adding up to the report's totals, or the whole
update stops and keeps the previous data. `python3 -m unittest scripts/test_nhms_pdf.py` runs these checks against the
stored report text. Datasets that could not be added yet are in [`docs/DATA_BACKLOG.md`](docs/DATA_BACKLOG.md); the weekly
run watches for them and opens an issue, never changing the site.

**Publishing is automatic when the checks pass; unusual changes wait for a person.** That is a deliberate choice: a
clean refresh needs no approval, and a refresh that looks wrong never goes live until someone merges its pull request.
The home page card says exactly this, and shows "Waiting for review" (with a link) while such a pull request is open.
Before anything is published the deploy repeats the same gates (`deploy-pages.yml`: lint, unit tests, build, browser and
accessibility tests). Both sites are published from that one tested build when the optional `NETLIFY_AUTH_TOKEN` and
`NETLIFY_SITE_ID` repository secrets are set (and "Stop auto publishing" is chosen for the Netlify site); without them,
Netlify builds `main` on its own, running lint and the unit tests only, because its build image cannot run a browser.

**Between Mondays.** The home page has an "Is the data up to date?" card. *Check for newer data* asks the publishers (through
the `/refresh` function in `netlify-chat/`) whether anything has been released since the last ingest; if so, *Update the
dashboard now* starts this same workflow and the card follows it until the new data is published. The button only works
when something is really newer, never while a refresh is running, and at most once every 3 hours; it needs the
`GITHUB_DISPATCH_TOKEN` setup described in [`netlify-chat/README.md`](netlify-chat/README.md), and without it the card
still reports what is newer and says the next Monday refresh will pick it up.

Every run writes `data/raw/ingest_report.json` (per dataset: refreshed, unchanged, failed or refused, its latest year,
and what the publisher says about its own `data_as_of` / `next_update`) and `data/processed/update_summary.json`.
The data can only be as new as its publisher makes it: some sources are updated yearly or less often (hospital beds
and healthcare staff currently stop at 2022), and the app shows each publisher's own statement beside the data.

## Deployment

**Site (Netlify, the public address).** [`netlify.toml`](netlify.toml) holds the build settings (base `frontend`,
publish `dist`, Node 20). Netlify builds on every push to `main` and runs lint and the unit tests first, so a failing
check leaves the previous version live. The browser tests run in GitHub Actions on every pull request and in the
weekly data workflow, before anything reaches `main`. The site's address for social previews comes from
`frontend/.env` (`VITE_SITE_URL`); the functions read it from the `SITE_URL` variable (default
`https://my-heo.netlify.app/`).

**Site (GitHub Pages, original address).** [`deploy-pages.yml`](.github/workflows/deploy-pages.yml)
builds the frontend and publishes it on every push to `main` using GitHub's
official Pages actions. One-time setup: **Settings → Pages → Build and deployment →
Source → GitHub Actions**. `vite.config.ts` uses a relative base path and routing
uses `HashRouter`, so it works at a project subpath
(`https://<user>.github.io/<repo>/`) with no rewrite rules.

**Chat proxy (Netlify).** `netlify-chat/` is its own small Netlify site. Required
environment variable: `GEMINI_API_KEY` (scoped for edge functions). Optional:
`DAILY_REQUEST_CAP` — maximum AI calls per UTC day across all visitors (default
1000). The key never reaches the browser; the allowed origins (one list shared by both functions, in
`netlify-chat/netlify/edge-functions/lib/config.ts`) are `https://my-heo.netlify.app`, the GitHub Pages site and
`http://localhost:5173`. Full details in
[`netlify-chat/README.md`](netlify-chat/README.md).

## Privacy

The dashboard shows aggregated public statistics only; it has no accounts and
stores no personal data. If you use an AI feature, the question you type (and
the page's published data, as context) is sent to a Netlify function and on to
Google Gemini to generate the answer — so please **do not enter personal or
patient information**. The maps draw DOSM boundary polygons only, with no third-party
map tiles. See the Privacy section of the Data Governance & Terms page.

## Documentation

- [`docs/DATA_DICTIONARY.md`](docs/DATA_DICTIONARY.md) — field-by-field reference
  for every processed JSON/CSV file the frontend reads.
- [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md) — the full catalogue of all
  <!--count:ingested-->55<!--/count--> source datasets (the count is kept current automatically by
  `scripts/update_database.py`); datasets that could not be added are in [`docs/DATA_BACKLOG.md`](docs/DATA_BACKLOG.md).
- [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md) — pipeline methodology: architecture,
  geographic harmonisation, missing-data policy, inequality statistics and known limitations.

## Limitations at a glance

Irregular HIES survey years, several single-snapshot datasets (district amenities
and district hospital beds are 2022-only), public-sector-only healthcare workforce
counts, and no composite "equity score" (a deliberate design decision). Per-100,000
staff and bed rates for Selangor, W.P. Kuala Lumpur and W.P. Putrajaya are compared
as one pooled Klang Valley unit, because they share referral hospitals and federal
institutions. See [`docs/METHODOLOGY.md`](docs/METHODOLOGY.md#9-limitations) and the
Data Gaps page for the full, itemised list.

## Licence and attribution

This repository holds four kinds of material, each licensed differently.

| Material | Terms |
|---|---|
| **Code** (`frontend/`, `netlify-chat/`, `scripts/`, the workflows) | MIT License, see [`LICENSE`](LICENSE). Copyright (c) 2026 Pauline Yeoh. |
| **Data** (every dataset shown or processed here) | The publishers' own terms, below. The MIT licence does **not** cover the data. |
| **Documentation and methodology text** (`docs/` and the text of the Data Governance & Terms page) | Creative Commons Attribution 4.0 International (CC BY 4.0), see [`docs/LICENSE`](docs/LICENSE). |
| **Name and logo** | Not licensed: see below and [`NOTICE`](NOTICE). |

### Data: the publishers' terms

Every dataset remains under the terms of its publisher (DOSM, data.gov.my, MOH and the other agencies). Terms below
were read on the publishers' own pages and files on 2026-10-10; where none could be found, that is said.

| Source (what it is used for) | Terms as published | What to give when you reuse it |
|---|---|---|
| **Datasets from the data.gov.my / OpenDOSM catalogue** (DOSM, MOH, NRD and other agencies: income, poverty, population, hospital beds, healthcare staff, births, deaths, immunisation, nutrition, environment and more; 41 catalogue datasets in use) | Each dataset's catalogue page states: "This data is made open under the Creative Commons Attribution 4.0 International License (CC BY 4.0)", linking to <https://creativecommons.org/licenses/by/4.0/>. | CC BY 4.0, section 3(a): name the creator (the agency), keep any copyright and licence notices, link to the data and to the licence, **say that you changed it** (MY-HEO aggregates, pools and reformats the data, and says so beside each chart), and do not suggest the agency endorses you. |
| **DOSM open-data GitHub mirror** (`dosm-malaysia/data-open`: state and district boundaries, census district table, HIES 2019 snapshot) | DOSM Open Data Licence, copied in [`data/raw/geo/DOSM_DATA_OPEN_LICENSE.md`](data/raw/geo/DOSM_DATA_OPEN_LICENSE.md): you may copy, publish, distribute, transmit, adapt and exploit the data commercially and non-commercially; it does not cover personal data, third-party rights, patents, trademarks or design rights; you must not suggest official status or agency endorsement; datasets are DOSM's intellectual property. | The licence text has no attribution clause, but credit DOSM, and do not suggest official status or endorsement. |
| **NHMS survey figures** (adult NCD risk factors 2015, 2019, 2023; adolescent mental health 2017) | **No open licence or reuse terms were found.** The figures were transcribed from the NHMS technical reports of the Institute for Public Health, National Institutes of Health, Ministry of Health Malaysia. The NIH site (iku.nih.gov.my) carries "Copyright 2020 National Institutes of Health, Ministry of Health Malaysia" and a liability disclaimer. | Cite the report. Ask NIH / IPH before reusing these figures beyond what the dashboard shows. |
| **Life expectancy** (OpenDOSM dashboard) | The dashboard page itself states no licence. The OpenDOSM catalogue pages state CC BY 4.0, but that statement was not found on the dashboard. | Credit DOSM; treat as DOSM data. |

MY-HEO is an independent research and public-interest project. It is **not** an official product of DOSM, MOH or the
Government of Malaysia, and is not for clinical or individual-level decision-making.

### Name and logo

The names "Malaysia Health Equity Observatory" and "MY-HEO" and the logo files (`frontend/public/logo.png`,
`favicon.png`, `og-image.png`, and any source artwork) are **not** covered by the MIT licence and may not be used to
present a modified version as the official observatory. Forks should use their own name and logo. See [`NOTICE`](NOTICE).

### Third-party software

Dependencies keep their own licences (nearly all MIT, ISC, BSD or Apache-2.0). `react-leaflet` and
`@react-leaflet/core`, used for the maps, are under the Hippocratic License 2.1, which is not a standard permissive
licence; see [`NOTICE`](NOTICE).
