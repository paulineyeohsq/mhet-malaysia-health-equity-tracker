import type { Column } from "../components/DataTable";

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
