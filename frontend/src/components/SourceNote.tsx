import { SOURCES } from "../lib/sources";

/**
 * Provenance footer required on every indicator: source org, geography,
 * unit, last-updated date, and a "View source" link to the original
 * data.gov.my dataset page. Never hide or omit this.
 */
export default function SourceNote({
  sourceKey,
  year,
  extra,
}: {
  sourceKey: keyof typeof SOURCES;
  year?: number | string;
  extra?: string;
}) {
  const s = SOURCES[sourceKey];
  if (!s) return null;
  return (
    <p className="mt-2 text-xs leading-relaxed text-ink-muted">
      Source: {s.org}
      {year !== undefined ? ` · Year: ${year}` : ""} · Geography: {s.geography} · Unit: {s.unit} · Last
      updated: {s.lastUpdated}
      {extra ? ` · ${extra}` : ""}{" "}
      <a
        href={s.url}
        target="_blank"
        rel="noreferrer"
        className="text-series-1 underline underline-offset-2 hover:text-seq-600"
      >
        View source
      </a>
    </p>
  );
}
