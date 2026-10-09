import { useData } from "../lib/useData";
import type { InventoryFile } from "../lib/inventoryMap";

/**
 * "Datasets identified but not yet included" list — extracted from
 * DataExplorer.tsx so it can also anchor the dedicated Data Gaps page
 * without duplicating the markup. Reads dataset_inventory.json itself
 * (useData's in-memory cache means this is free if the page already
 * fetched it elsewhere).
 */
export default function DataGapsList() {
  const { data: inventory } = useData<InventoryFile>("dataset_inventory.json");

  if (!inventory) return <p className="text-sm text-ink-secondary">Loading…</p>;
  if (inventory.identified_but_not_yet_ingested.length === 0) {
    return <p className="text-sm text-ink-secondary">No confirmed-but-uningested datasets recorded.</p>;
  }

  return (
    <div className="rounded-lg border border-dashed border-line-axis bg-plane p-4">
      <p className="mb-3 text-xs text-ink-secondary">
        These were found to exist (as a survey, a report or a dashboard) but are not in this dashboard, either because
        there is no machine-readable source to read them from or because they have not been extracted yet. Each
        entry says what was checked and when; nothing here is estimated or filled in.
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
  );
}
