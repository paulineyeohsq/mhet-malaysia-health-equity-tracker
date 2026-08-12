import { useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import DataTable, { type Column, toCSV, downloadCSV } from "../components/DataTable";
import InsufficientData from "../components/InsufficientData";
import { useData } from "../lib/useData";

/**
 * Data Explorer — the "raw data" / power-user page. Lets a user pick one of
 * the 11 processed analytical JSON files (data/processed/*.json, served as
 * static assets under /data), inspect its full provenance (traced back to
 * the underlying data.gov.my / DOSM / MOH source datasets recorded in
 * dataset_inventory.json), browse/search/sort the complete table, and
 * download the complete data as CSV.
 */

// ---------------------------------------------------------------------------
// dataset_inventory.json shape
// ---------------------------------------------------------------------------

interface InventoryDataset {
  id: string;
  name: string;
  url: string;
  endpoint_csv?: string;
  endpoint_parquet?: string;
  description: string;
  source_org: string;
  update_frequency: string;
  date_range: string;
  geographic_resolution: string;
  dimensions?: string[];
  variables?: string[];
  unit: string;
  missingness: string;
  joinable_with?: string[];
  recommended_use?: string;
  limitations: string;
  status: string;
}

interface NotIngestedDataset {
  id: string;
  name: string;
  reason: string;
}

interface InventoryFile {
  generated: string;
  source_catalogue: string;
  note: string;
  datasets: InventoryDataset[];
  identified_but_not_yet_ingested: NotIngestedDataset[];
}

// ---------------------------------------------------------------------------
// Processed dataset registry: file name -> friendly label -> table columns.
// Field names below were read directly from each file's first row(s) in
// public/data/*.json — see task notes; none are invented.
// ---------------------------------------------------------------------------

interface DatasetDef {
  id: string;
  label: string;
  file: string;
  columns: Column[];
}

const DATASETS: DatasetDef[] = [
  {
    id: "socioeconomic_national",
    label: "Socioeconomic — National",
    file: "socioeconomic_national.json",
    columns: [
      { key: "year", label: "Year", numeric: true },
      { key: "income_mean", label: "Income mean (RM)", numeric: true },
      { key: "income_median", label: "Income median (RM)", numeric: true },
      { key: "poverty_absolute", label: "Absolute poverty (%)", numeric: true },
      { key: "poverty_hardcore", label: "Hardcore poverty (%)", numeric: true },
      { key: "poverty_relative", label: "Relative poverty (%)", numeric: true },
      { key: "gini", label: "Gini coefficient", numeric: true },
    ],
  },
  {
    id: "socioeconomic_state",
    label: "Socioeconomic — State",
    file: "socioeconomic_state.json",
    columns: [
      { key: "state", label: "State" },
      { key: "year", label: "Year", numeric: true },
      { key: "income_mean", label: "Income mean (RM)", numeric: true },
      { key: "income_median", label: "Income median (RM)", numeric: true },
      { key: "poverty_absolute", label: "Absolute poverty (%)", numeric: true },
      { key: "poverty_hardcore", label: "Hardcore poverty (%)", numeric: true },
      { key: "poverty_relative", label: "Relative poverty (%)", numeric: true },
      { key: "gini", label: "Gini coefficient", numeric: true },
    ],
  },
  {
    id: "socioeconomic_district",
    label: "Socioeconomic — District",
    file: "socioeconomic_district.json",
    columns: [
      { key: "state", label: "State" },
      { key: "district", label: "District" },
      { key: "year", label: "Year", numeric: true },
      { key: "income_mean", label: "Income mean (RM)", numeric: true },
      { key: "income_median", label: "Income median (RM)", numeric: true },
      { key: "poverty_absolute", label: "Absolute poverty (%)", numeric: true },
      { key: "poverty_relative", label: "Relative poverty (%)", numeric: true },
      { key: "gini", label: "Gini coefficient", numeric: true },
      { key: "sanitation_pct", label: "Sanitation access (%)", numeric: true },
      { key: "electricity_pct", label: "Electricity access (%)", numeric: true },
      { key: "piped_water_pct", label: "Piped water access (%)", numeric: true },
    ],
  },
  {
    id: "population_state",
    label: "Population — State",
    file: "population_state.json",
    columns: [
      { key: "state", label: "State" },
      { key: "year", label: "Year", numeric: true },
      { key: "sex", label: "Sex" },
      { key: "population_thousands", label: "Population (thousands)", numeric: true },
    ],
  },
  {
    id: "population_district",
    label: "Population — District",
    file: "population_district.json",
    columns: [
      { key: "state", label: "State" },
      { key: "district", label: "District" },
      { key: "year", label: "Year", numeric: true },
      { key: "population_total", label: "Population (total)", numeric: true },
      { key: "sex_male", label: "Male", numeric: true },
      { key: "sex_female", label: "Female", numeric: true },
      { key: "ethnicity_bumi", label: "Ethnicity: Bumiputera", numeric: true },
      { key: "ethnicity_chinese", label: "Ethnicity: Chinese", numeric: true },
      { key: "ethnicity_indian", label: "Ethnicity: Indian", numeric: true },
      { key: "ethnicity_other", label: "Ethnicity: Other", numeric: true },
      { key: "age_0_14", label: "Age 0-14", numeric: true },
      { key: "age_15_64", label: "Age 15-64", numeric: true },
      { key: "age_65_above", label: "Age 65+", numeric: true },
    ],
  },
  {
    id: "healthcare_access_state",
    label: "Healthcare Access — State",
    file: "healthcare_access_state.json",
    columns: [
      { key: "state", label: "State" },
      { key: "year", label: "Year", numeric: true },
      { key: "staff_all", label: "Staff (all)", numeric: true },
      { key: "staff_doctor", label: "Doctors", numeric: true },
      { key: "staff_dentist", label: "Dentists", numeric: true },
      { key: "staff_nurse", label: "Nurses", numeric: true },
      { key: "staff_nurse_community", label: "Community nurses", numeric: true },
      { key: "population_used_for_rate", label: "Population used for rate", numeric: true },
      { key: "staff_per_100k", label: "Staff per 100,000", numeric: true },
      { key: "hospital_beds", label: "Hospital beds", numeric: true },
      { key: "beds_per_100k", label: "Beds per 100,000", numeric: true },
    ],
  },
  {
    id: "healthcare_access_national",
    label: "Healthcare Access — National",
    file: "healthcare_access_national.json",
    columns: [
      { key: "year", label: "Year", numeric: true },
      { key: "beds_total", label: "Beds (total)", numeric: true },
      { key: "beds_moh", label: "Beds (MOH)", numeric: true },
      { key: "beds_non_moh", label: "Beds (non-MOH)", numeric: true },
      { key: "beds_special_institution", label: "Beds (special institution)", numeric: true },
      { key: "staff_all", label: "Staff (all)", numeric: true },
      { key: "staff_doctor", label: "Doctors", numeric: true },
      { key: "staff_dentist", label: "Dentists", numeric: true },
      { key: "staff_nurse", label: "Nurses", numeric: true },
    ],
  },
  {
    id: "healthcare_access_district_2022",
    label: "Healthcare Access — District (2022)",
    file: "healthcare_access_district_2022.json",
    columns: [
      { key: "state", label: "State" },
      { key: "district", label: "District" },
      { key: "year", label: "Year", numeric: true },
      { key: "hospital_beds", label: "Hospital beds", numeric: true },
      { key: "note", label: "Note" },
    ],
  },
  {
    id: "health_outcomes_state",
    label: "Health Outcomes — State",
    file: "health_outcomes_state.json",
    columns: [
      { key: "state", label: "State" },
      { key: "year", label: "Year", numeric: true },
      { key: "crude_death_rate_per_1000", label: "Crude death rate (per 1,000)", numeric: true },
      { key: "deaths_abs", label: "Deaths (count)", numeric: true },
      { key: "maternal_deaths_abs", label: "Maternal deaths (count)", numeric: true },
      { key: "maternal_mortality_rate_per_100k_births", label: "Maternal mortality (per 100k births)", numeric: true },
      { key: "crude_birth_rate_per_1000", label: "Crude birth rate (per 1,000)", numeric: true },
      { key: "births_abs", label: "Births (count)", numeric: true },
      { key: "infant_deaths_abs", label: "Infant deaths (count)", numeric: true },
      { key: "infant_mortality_rate", label: "Infant mortality rate", numeric: true },
      { key: "neonatal_deaths_abs", label: "Neonatal deaths (count)", numeric: true },
      { key: "neonatal_mortality_rate", label: "Neonatal mortality rate", numeric: true },
      { key: "perinatal_deaths_abs", label: "Perinatal deaths (count)", numeric: true },
      { key: "perinatal_mortality_rate", label: "Perinatal mortality rate", numeric: true },
      { key: "toddler_deaths_abs", label: "Toddler deaths (count)", numeric: true },
      { key: "toddler_mortality_rate", label: "Toddler mortality rate", numeric: true },
      { key: "under5_deaths_abs", label: "Under-5 deaths (count)", numeric: true },
      { key: "under5_mortality_rate", label: "Under-5 mortality rate", numeric: true },
    ],
  },
  {
    id: "immunisation_national",
    label: "Immunisation — National",
    file: "immunisation_national.json",
    columns: [
      { key: "year", label: "Year", numeric: true },
      { key: "disease", label: "Disease" },
      { key: "coverage_pct", label: "Coverage (%)", numeric: true },
    ],
  },
  {
    id: "nutrition_national",
    label: "Nutrition — National",
    file: "nutrition_national.json",
    columns: [
      { key: "year", label: "Year", numeric: true },
      { key: "sex", label: "Sex" },
      { key: "indicator", label: "Indicator" },
      { key: "range", label: "Range" },
      { key: "description", label: "Description" },
      { key: "prevalence_pct", label: "Prevalence (%)", numeric: true },
    ],
  },
];

// Which dataset_inventory.json `datasets[].id` entries feed each processed
// file. transform_data.py merges multiple raw sources into some processed
// files (e.g. income + poverty + gini -> socioeconomic_state.json), so a
// processed file can map to several inventory entries — all are shown.
const INVENTORY_MAP: Record<string, string[]> = {
  "socioeconomic_national.json": ["hh_income", "hh_poverty", "hh_inequality"],
  "socioeconomic_state.json": ["hh_income_state", "hh_poverty_state", "hh_inequality_state"],
  "socioeconomic_district.json": [
    "hh_income_district",
    "hh_poverty_district",
    "hh_inequality_district",
    "hh_access_amenities",
  ],
  "population_state.json": ["population_state"],
  // population_district.json is actually built from the DOSM census_district
  // series, not the (not-yet-ingested) live population_district source — see
  // that entry's `limitations` field in dataset_inventory.json.
  "population_district.json": ["census_district"],
  "healthcare_access_state.json": ["hospital_beds", "healthcare_staff"],
  "healthcare_access_national.json": ["hospital_beds", "healthcare_staff"],
  "healthcare_access_district_2022.json": ["hospital_beds"],
  "health_outcomes_state.json": [
    "death_state",
    "death_maternal_state",
    "deaths_early_childhood_state",
    "birth_state",
  ],
  "immunisation_national.json": ["infant_immunisation"],
  "nutrition_national.json": ["nutrition_status_u5_sex"],
};

function ProvenanceCard({ entry }: { entry: InventoryDataset }) {
  return (
    <div className="rounded-lg border border-line-grid bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink-primary">{entry.name}</h3>
        <a
          href={entry.url}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 whitespace-nowrap text-xs font-medium text-series-1 hover:underline"
        >
          View source ↗
        </a>
      </div>
      <p className="mt-1 text-xs text-ink-secondary">{entry.description}</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div>
          <dt className="text-ink-muted">Source organisation</dt>
          <dd className="text-ink-primary">{entry.source_org}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Geographic resolution</dt>
          <dd className="text-ink-primary">{entry.geographic_resolution}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Unit</dt>
          <dd className="text-ink-primary">{entry.unit}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Date range</dt>
          <dd className="text-ink-primary">{entry.date_range}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Update frequency</dt>
          <dd className="text-ink-primary">{entry.update_frequency}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Missingness</dt>
          <dd className="text-ink-primary">{entry.missingness}</dd>
        </div>
      </dl>
      <p className="mt-3 border-t border-line-grid pt-2 text-xs text-ink-secondary">
        <span className="font-medium text-ink-primary">Limitations: </span>
        {entry.limitations}
      </p>
    </div>
  );
}

export default function DataExplorer() {
  const [selectedId, setSelectedId] = useState(DATASETS[0].id);
  const dataset = DATASETS.find((d) => d.id === selectedId) ?? DATASETS[0];

  const { data: rows, loading, error } = useData<Record<string, unknown>[]>(dataset.file);
  const { data: inventory } = useData<InventoryFile>("dataset_inventory.json");

  const matchedEntries = useMemo(() => {
    if (!inventory) return [];
    const ids = INVENTORY_MAP[dataset.file] ?? [];
    return ids
      .map((id) => inventory.datasets.find((d) => d.id === id))
      .filter((d): d is InventoryDataset => Boolean(d));
  }, [inventory, dataset.file]);

  const csvFilename = dataset.file.replace(/\.json$/, ".csv");

  return (
    <div>
      <PageHeader
        title="Data Explorer"
        subtitle="Browse, search, sort and download the complete processed data behind every chart in this dashboard, alongside full source provenance."
      />
      <div className="space-y-8 p-6 lg:p-10">
        <section aria-labelledby="dataset-selector-heading">
          <h2 id="dataset-selector-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Select dataset
          </h2>
          <div className="rounded-lg border border-line-grid bg-surface p-4">
            <label htmlFor="dataset-select" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
              Dataset
            </label>
            <select
              id="dataset-select"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
            >
              {DATASETS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-ink-muted">
              File: <code className="rounded bg-plane px-1 py-0.5">public/data/{dataset.file}</code>
              {rows && !loading ? ` · ${rows.length} rows` : ""}
            </p>
          </div>
        </section>

        <section aria-labelledby="provenance-heading">
          <h2 id="provenance-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Data source &amp; provenance
          </h2>
          {matchedEntries.length === 0 ? (
            <InsufficientData reason="Provenance metadata for this dataset is still loading or unavailable." />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {matchedEntries.map((entry) => (
                <ProvenanceCard key={entry.id} entry={entry} />
              ))}
            </div>
          )}
          {matchedEntries.length > 1 && (
            <p className="mt-3 text-xs text-ink-muted">
              This processed dataset is built by merging {matchedEntries.length} raw source datasets from the
              catalogue above (see <code className="rounded bg-plane px-1 py-0.5">scripts/transform_data.py</code>).
            </p>
          )}
        </section>

        <section aria-labelledby="table-heading">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="table-heading" className="text-sm font-semibold uppercase tracking-wide text-ink-secondary">
              Data table
            </h2>
            <button
              type="button"
              onClick={() => rows && downloadCSV(csvFilename, toCSV(dataset.columns, rows))}
              disabled={!rows || rows.length === 0}
              className="rounded-md bg-seq-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-seq-650 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Download CSV
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-ink-secondary">Loading data…</p>
          ) : error ? (
            <InsufficientData reason={`Could not load ${dataset.file}: ${error}`} />
          ) : rows && rows.length > 0 ? (
            <DataTable columns={dataset.columns} rows={rows} pageSize={25} />
          ) : (
            <InsufficientData reason={`No rows found in ${dataset.file}.`} />
          )}
        </section>

        <section aria-labelledby="not-ingested-heading">
          <h2 id="not-ingested-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Additional datasets identified but not yet included
          </h2>
          {inventory && inventory.identified_but_not_yet_ingested.length > 0 ? (
            <div className="rounded-lg border border-dashed border-line-axis bg-plane p-4">
              <p className="mb-3 text-xs text-ink-secondary">
                These datasets were confirmed to exist in the data.gov.my catalogue (URL and schema verified) but are
                not yet available in this dashboard build.
              </p>
              <ul className="space-y-2">
                {inventory.identified_but_not_yet_ingested.map((d) => (
                  <li key={d.id} className="text-sm">
                    <span className="font-medium text-ink-primary">{d.name}</span>
                    <span className="text-ink-muted"> — {d.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-ink-secondary">Loading…</p>
          )}
        </section>
      </div>
    </div>
  );
}
