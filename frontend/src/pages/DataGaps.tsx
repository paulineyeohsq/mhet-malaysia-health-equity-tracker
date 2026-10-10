import { useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import Disclosure from "../components/Disclosure";
import ProvenanceCard from "../components/ProvenanceCard";
import InsufficientData from "../components/InsufficientData";
import { useData } from "../lib/useData";
import { groupDatasets, matchesQuery } from "../lib/datasetGroups";
import type { InventoryFile } from "../lib/inventoryMap";

function truncate(text: string, max = 160): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

/**
 * The limitations of the datasets this dashboard actually uses, read from dataset_inventory.json (the same file the
 * Data Explorer uses); nothing is invented here. To be readable on a phone the datasets are grouped by topic, each
 * group opens on its own, and a search box narrows them. Every dataset is still there: grouping and searching only
 * change what is shown at a time. Datasets the dashboard does not have are not listed here.
 */
export default function DataGaps() {
  const { data: inventory } = useData<InventoryFile>("dataset_inventory.json");
  const [query, setQuery] = useState("");
  // null = each group in its default state; true / false = every group opened / closed by the buttons (the key remounts them)
  const [allOpen, setAllOpen] = useState<boolean | null>(null);

  const ingested = useMemo(() => (inventory ? inventory.datasets.filter((d) => d.status.startsWith("ingested")) : []), [inventory]);
  const searching = query.trim().length > 0;
  const groups = useMemo(
    () => groupDatasets(ingested).map((g) => ({ ...g, shown: g.items.filter((d) => matchesQuery(d, query)) })),
    [ingested, query]
  );
  const shownCount = groups.reduce((n, g) => n + g.shown.length, 0);

  return (
    <div>
      <PageHeader
        title="Data Gaps"
        subtitle="The limits of the data behind every chart: how recent each dataset is, how detailed its geography is, who or what it leaves out, and what to be careful of before relying on a figure."
      />
      <div className="space-y-8 p-6 lg:p-10">
        <div>
          <p className="mb-3 max-w-3xl text-sm text-ink-secondary">
            Every dataset the dashboard uses is listed here with its main limitation. Open a dataset for its source, unit,
            years covered, how often it is updated and its full list of limitations. A figure is only as good as its
            source: where a dataset stops at an earlier year, covers only part of the country or counts only the public
            sector, it says so here and beside the chart.
          </p>
          <label htmlFor="gaps-search" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
            Search the datasets and their limitations
          </label>
          <input
            id="gaps-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. poverty, district, 2022, MOH"
            className="mt-1 w-full max-w-md rounded-md border border-line-axis px-3 py-1.5 text-sm focus:border-series-1"
          />
          <p role="status" className="mt-1 text-xs text-ink-muted">
            {searching ? `${shownCount} of ${ingested.length} datasets match.` : `${ingested.length} datasets in ${groups.length} groups.`}
          </p>
        </div>

        <section aria-labelledby="limitations-heading">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="limitations-heading" className="text-sm font-semibold uppercase tracking-wide text-ink-secondary">
              Datasets and their limitations
            </h2>
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={() => setAllOpen(true)}
                className="rounded border border-line-axis px-2 py-1 font-medium text-ink-secondary hover:border-series-1 hover:text-series-1"
              >
                Open all groups
              </button>
              <button
                type="button"
                onClick={() => setAllOpen(false)}
                className="rounded border border-line-axis px-2 py-1 font-medium text-ink-secondary hover:border-series-1 hover:text-series-1"
              >
                Close all groups
              </button>
            </div>
          </div>
          {ingested.length === 0 ? (
            <InsufficientData reason="Data for this section is currently unavailable." />
          ) : shownCount === 0 ? (
            <p className="text-sm text-ink-secondary">No dataset matches "{query.trim()}".</p>
          ) : (
            <div className="space-y-3">
              {groups
                .filter((g) => g.shown.length > 0)
                .map((g) => (
                  <Disclosure
                    key={`${g.id}-${String(allOpen)}-${searching}`}
                    className="rounded-lg border border-line-grid bg-surface p-3"
                    summaryClassName="text-sm font-semibold text-ink-primary"
                    summary={`${g.label} (${searching ? `${g.shown.length} of ${g.items.length}` : g.items.length})`}
                    defaultOpen={searching || allOpen === true}
                  >
                    <ul className="mt-2 divide-y divide-line-grid">
                      {g.shown.map((d) => (
                        <li key={d.id} className="py-2">
                          <Disclosure
                            summaryClassName="text-sm text-ink-primary"
                            summary={
                              <span className="block">
                                <span className="font-medium">{d.name}</span>
                                <span className="block text-xs text-ink-muted">
                                  {d.geographic_resolution} · {d.date_range}
                                </span>
                                <span className="mt-0.5 block text-xs text-ink-secondary">{truncate(d.limitations)}</span>
                              </span>
                            }
                          >
                            <ProvenanceCard entry={d} hideTitle />
                          </Disclosure>
                        </li>
                      ))}
                    </ul>
                  </Disclosure>
                ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
