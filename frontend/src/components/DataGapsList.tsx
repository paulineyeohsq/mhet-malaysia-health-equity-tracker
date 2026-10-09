import { useData } from "../lib/useData";
import type { InventoryFile } from "../lib/inventoryMap";
import Disclosure from "./Disclosure";

/**
 * "Datasets identified but not yet included" list — extracted from
 * DataExplorer.tsx so it can also anchor the dedicated Data Gaps page
 * without duplicating the markup. Reads dataset_inventory.json itself
 * (useData's in-memory cache means this is free if the page already
 * fetched it elsewhere).
 */
export default function DataGapsList({ query = "", collapsed = false }: { query?: string; collapsed?: boolean }) {
  const { data: inventory } = useData<InventoryFile>("dataset_inventory.json");

  if (!inventory) return <p className="text-sm text-ink-secondary">Loading…</p>;
  if (inventory.identified_but_not_yet_ingested.length === 0) {
    return <p className="text-sm text-ink-secondary">No confirmed-but-uningested datasets recorded.</p>;
  }

  const q = query.trim().toLowerCase();
  const shown = inventory.identified_but_not_yet_ingested.filter((d) => !q || `${d.id} ${d.name} ${d.reason}`.toLowerCase().includes(q));
  if (shown.length === 0) return <p className="text-sm text-ink-secondary">No known gap matches "{query.trim()}".</p>;

  return (
    <div className="rounded-lg border border-dashed border-line-axis bg-plane p-4">
      <p className="mb-3 text-xs text-ink-secondary">
        These were found to exist (as a survey, a report or a dashboard) but are not in this dashboard, either because
        there is no machine-readable source to read them from or because they have not been extracted yet. Each
        entry says what was checked and when; nothing here is estimated or filled in.
      </p>
      <ul className="space-y-2">
        {shown.map((d) =>
          collapsed ? (
            <li key={d.id} className="text-sm">
              <Disclosure summary={<span className="font-medium text-ink-primary">{d.name}</span>} defaultOpen={q.length > 0}>
                <p className="text-ink-secondary">{d.reason}</p>
              </Disclosure>
            </li>
          ) : (
            <li key={d.id} className="text-sm">
              <span className="font-medium text-ink-primary">{d.name}</span>
              <span className="text-ink-muted"> — {d.reason}</span>
            </li>
          )
        )}
      </ul>
    </div>
  );
}
