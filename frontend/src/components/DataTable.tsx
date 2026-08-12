import { useMemo, useState } from "react";

export interface Column {
  key: string;
  label: string;
  numeric?: boolean;
}

/**
 * Accessible sortable/searchable table used by the Data Explorer and by
 * ranking views elsewhere. Renders as a real <table> with <th scope="col">
 * for screen readers, per the accessibility requirement.
 */
export default function DataTable({
  columns,
  rows,
  pageSize = 20,
  searchable = true,
}: {
  columns: Column[];
  rows: Record<string, unknown>[];
  pageSize?: number;
  searchable?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!query.trim()) return rows;
    const q = query.toLowerCase();
    return rows.filter((r) => Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(q)));
  }, [rows, query]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * sortDir;
      return String(av).localeCompare(String(bv)) * sortDir;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(1);
    }
    setPage(0);
  }

  return (
    <div>
      {searchable && (
        <div className="mb-3 flex items-center gap-2">
          <label htmlFor="table-search" className="sr-only">
            Search table
          </label>
          <input
            id="table-search"
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Search…"
            className="w-full max-w-xs rounded-md border border-line-axis px-3 py-1.5 text-sm focus:border-series-1"
          />
          <span className="text-xs text-ink-muted">{sorted.length} rows</span>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-line-grid">
        <table className="w-full text-sm">
          <caption className="sr-only">Data table, sortable by column</caption>
          <thead>
            <tr className="bg-plane">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={`px-3 py-2 text-xs font-medium uppercase tracking-wide text-ink-secondary ${
                    c.numeric ? "text-right" : "text-left"
                  }`}
                >
                  <button
                    onClick={() => toggleSort(c.key)}
                    className="inline-flex items-center gap-1 hover:text-ink-primary"
                    aria-label={`Sort by ${c.label}`}
                  >
                    {c.label}
                    {sortKey === c.key && <span aria-hidden>{sortDir === 1 ? "↑" : "↓"}</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((r, i) => (
              <tr key={i} className="border-t border-line-grid odd:bg-surface even:bg-plane/40">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-3 py-1.5 tabular-nums ${c.numeric ? "text-right" : "text-left"} ${
                      r[c.key] === null || r[c.key] === undefined ? "text-ink-muted" : "text-ink-primary"
                    }`}
                  >
                    {r[c.key] === null || r[c.key] === undefined ? "—" : String(r[c.key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs text-ink-secondary">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded border border-line-axis px-2 py-1 disabled:opacity-40"
          >
            Previous
          </button>
          <span>
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="rounded border border-line-axis px-2 py-1 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export function toCSV(columns: Column[], rows: Record<string, unknown>[]): string {
  const header = columns.map((c) => `"${c.label.replace(/"/g, '""')}"`).join(",");
  const lines = rows.map((r) =>
    columns
      .map((c) => {
        const v = r[c.key];
        if (v === null || v === undefined) return "";
        return `"${String(v).replace(/"/g, '""')}"`;
      })
      .join(",")
  );
  return [header, ...lines].join("\n");
}

export function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
