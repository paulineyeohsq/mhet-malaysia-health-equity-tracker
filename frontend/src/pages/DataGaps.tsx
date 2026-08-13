import { useMemo } from "react";
import PageHeader from "../components/PageHeader";
import DataTable, { type Column } from "../components/DataTable";
import DataGapsList from "../components/DataGapsList";
import { ProvenanceCard } from "../components/MetadataPanel";
import InsufficientData from "../components/InsufficientData";
import { useData } from "../lib/useData";
import type { InventoryFile } from "../lib/inventoryMap";

function truncate(text: string, max = 140): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

/**
 * A single page answering "what should I not expect from this dashboard,
 * and where exactly are the real datasets weaker than they look" — the
 * research-efficiency gap identified directly from this session's own NHMS
 * sourcing work: re-discovering what doesn't exist wasted real time. All
 * content here is read from dataset_inventory.json, the same file
 * DataExplorer.tsx and MetadataPanel.tsx already surface — nothing new is
 * invented on this page, it is purely a more direct view of it.
 */
export default function DataGaps() {
  const { data: inventory } = useData<InventoryFile>("dataset_inventory.json");

  const ingested = useMemo(() => (inventory ? inventory.datasets.filter((d) => d.status.startsWith("ingested")) : []), [inventory]);

  const columns: Column[] = [
    { key: "name", label: "Dataset" },
    { key: "geographic_resolution", label: "Geographic resolution" },
    { key: "date_range", label: "Date range" },
    { key: "limitations", label: "Key limitation" },
  ];

  const rows = ingested.map((d) => ({
    name: d.name,
    geographic_resolution: d.geographic_resolution,
    date_range: d.date_range,
    limitations: truncate(d.limitations),
  }));

  return (
    <div>
      <PageHeader
        title="Data Gaps"
        subtitle="What this dashboard does not have, and where the data it does have is weaker than a headline number suggests — before you spend time rediscovering it yourself."
      />
      <div className="space-y-8 p-6 lg:p-10">
        <section aria-labelledby="not-ingested-heading">
          <h2 id="not-ingested-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Confirmed to exist, not yet in this dashboard
          </h2>
          <DataGapsList />
        </section>

        <section aria-labelledby="limitations-heading">
          <h2 id="limitations-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            What's in — and its real limitations
          </h2>
          <p className="mb-3 text-xs text-ink-secondary">
            Every dataset actually powering this dashboard, with its documented limitation. Full detail (source
            citation, missingness, methodology notes) is below the table.
          </p>
          {rows.length > 0 ? (
            <DataTable columns={columns} rows={rows} pageSize={50} />
          ) : (
            <InsufficientData reason="Dataset inventory still loading or unavailable." />
          )}
        </section>

        <section aria-labelledby="full-provenance-heading">
          <h2 id="full-provenance-heading" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Full provenance detail
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {ingested.map((entry) => (
              <ProvenanceCard key={entry.id} entry={entry} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
