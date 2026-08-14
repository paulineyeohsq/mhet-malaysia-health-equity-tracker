import { useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import DataTable, { type Column, toCSV, downloadCSV } from "../components/DataTable";
import InsufficientData from "../components/InsufficientData";
import { ProvenanceCard } from "../components/MetadataPanel";
import DataGapsList from "../components/DataGapsList";
import { useData } from "../lib/useData";
import { INVENTORY_MAP, type InventoryDataset, type InventoryFile } from "../lib/inventoryMap";

/**
 * Data Explorer — the "raw data" / power-user page. Lets a user pick one of
 * the 11 processed analytical JSON files (data/processed/*.json, served as
 * static assets under /data), inspect its full provenance (traced back to
 * the underlying data.gov.my / DOSM / MOH source datasets recorded in
 * dataset_inventory.json), browse/search/sort the complete table, and
 * download the complete data as CSV.
 */

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
    id: "hies_percentile_national",
    label: "Income by Percentile — National",
    file: "hies_percentile_national.json",
    columns: [
      { key: "year", label: "Year", numeric: true },
      { key: "percentile", label: "Percentile", numeric: true },
      { key: "variable", label: "Variable (mean/median/minimum/maximum)" },
      { key: "income_rm", label: "Income (RM)", numeric: true },
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
    id: "population_district_full",
    label: "Population — District (2020-2025, no ethnicity/age breakdown)",
    file: "population_district_full.json",
    columns: [
      { key: "state", label: "State" },
      { key: "district", label: "District" },
      { key: "year", label: "Year", numeric: true },
      { key: "sex", label: "Sex" },
      { key: "population_thousands", label: "Population (thousands)", numeric: true },
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
          <DataGapsList />
          <p className="mt-3 text-xs text-ink-secondary">
            For a complete, dedicated view of every dataset's limitations (not just what's missing), see{" "}
            <a href="#/data-gaps" className="text-series-1 underline underline-offset-2">
              Data Gaps
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
