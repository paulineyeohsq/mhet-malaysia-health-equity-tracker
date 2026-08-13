import { useState } from "react";
import { useData } from "../lib/useData";
import type { InventoryFile, InventoryDataset } from "../lib/inventoryMap";

export function ProvenanceCard({ entry }: { entry: InventoryDataset }) {
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

/**
 * Collapsible "Data source & limitations" disclosure, attachable near any
 * chart/table across the app — driven by the same dataset_inventory.json
 * fields DataExplorer.tsx already surfaces (source_org/geographic_resolution/
 * unit/date_range/update_frequency/missingness/limitations). No new
 * metadata is invented here.
 */
export default function MetadataPanel({
  datasetIds,
  title = "Data source & limitations",
}: {
  datasetIds: string[];
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const { data: inventory } = useData<InventoryFile>("dataset_inventory.json");

  const matchedEntries = inventory
    ? datasetIds
        .map((id) => inventory.datasets.find((d) => d.id === id))
        .filter((d): d is InventoryDataset => Boolean(d))
    : [];

  return (
    <div className="rounded-lg border border-line-grid bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-2 text-xs font-medium uppercase tracking-wide text-ink-secondary hover:text-ink-primary"
      >
        <span>ⓘ {title}</span>
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="border-t border-line-grid p-4">
          {matchedEntries.length === 0 ? (
            <p className="text-xs text-ink-muted">Provenance metadata still loading or unavailable.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {matchedEntries.map((entry) => (
                <ProvenanceCard key={entry.id} entry={entry} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
