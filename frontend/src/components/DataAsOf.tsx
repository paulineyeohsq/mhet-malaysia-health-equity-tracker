import { useLocation } from "react-router-dom";
import { useData } from "../lib/useData";
import type { InventoryFile } from "../lib/inventoryMap";
import { PAGE_DATA_FILES } from "../lib/pageDataFiles";
import { isStaleYear } from "../lib/dataAge";
import { canonicalPath } from "../lib/routes";

function prettyFile(name: string): string {
  return name
    .replace(/\.json$/, "")
    .replace(/_/g, " ")
    .replace(/\b(national|state|district|region)\b/g, (m) => `(${m})`);
}

/**
 * "Data as of" line for a page: the latest data year in each file the page reads, taken from
 * dataset_inventory.json (`data_files`, stamped by the pipeline from the files themselves), plus when the
 * pipeline last refreshed. Years more than three years old are called out. Renders nothing for pages with
 * no data files (Data Explorer, Data Gaps, Methodology) or until the inventory has loaded.
 */
export default function DataAsOf() {
  const { pathname } = useLocation();
  const { data: inventory } = useData<InventoryFile>("dataset_inventory.json");
  const files = PAGE_DATA_FILES[canonicalPath(pathname)];
  if (!files || !inventory?.data_files) return null;

  const rows = files
    .map((f) => ({ file: f, year: inventory.data_files?.[f] }))
    .filter((r): r is { file: string; year: number } => typeof r.year === "number")
    .sort((a, b) => a.year - b.year || a.file.localeCompare(b.file));
  if (rows.length === 0) return null;

  const oldest = rows[0];
  const newest = rows[rows.length - 1];
  const stale = rows.filter((r) => isStaleYear(r.year));
  const range = oldest.year === newest.year ? `${newest.year}` : `${oldest.year}–${newest.year}`;

  return (
    <div className="mt-2 text-xs text-ink-secondary">
      <span className="font-medium text-ink-primary">Data as of {range}</span>
      {" "}(latest year in the datasets this page uses
      {inventory.last_refreshed ? `; pipeline last refreshed ${inventory.last_refreshed}` : ""}).
      {stale.length > 0 && (
        <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900">
          {stale.length} of {rows.length} are more than 3 years old
        </span>
      )}
      <details className="mt-1">
        <summary className="cursor-pointer text-ink-muted">Latest year by dataset</summary>
        <ul className="mt-1 grid gap-x-6 sm:grid-cols-2">
          {rows.map((r) => (
            <li key={r.file} className="flex justify-between gap-3">
              <span>{prettyFile(r.file)}</span>
              <span className={`tabular-nums ${isStaleYear(r.year) ? "font-semibold text-amber-800" : ""}`}>{r.year}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
