import { useData } from "../lib/useData";
import type { InventoryDataset, InventoryFile } from "../lib/inventoryMap";

export default function ProvenanceCard({ entry, hideTitle = false }: { entry: InventoryDataset; hideTitle?: boolean }) {
  const { data: inventory } = useData<InventoryFile>("dataset_inventory.json");
  const status = inventory?.source_status?.[entry.id];
  return (
    <div className="rounded-lg border border-line-grid bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        {hideTitle ? <span /> : <h3 className="text-sm font-semibold text-ink-primary">{entry.name}</h3>}
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
      {status && (
        <p className="mt-3 border-t border-line-grid pt-2 text-xs text-ink-secondary">
          <span className="font-medium text-ink-primary">Publisher says: </span>
          data as of {status.data_as_of ?? "not stated"}
          {status.last_updated ? `, last updated ${status.last_updated.slice(0, 10)}` : ""}
          {status.next_update ? `, next update ${status.next_update.slice(0, 10)}` : ""}. If this is later than the latest
          year this dashboard shows, the next automatic refresh will pick it up.
        </p>
      )}
      <p className="mt-3 border-t border-line-grid pt-2 text-xs text-ink-secondary">
        <span className="font-medium text-ink-primary">Limitations: </span>
        {entry.limitations}
      </p>
    </div>
  );
}
