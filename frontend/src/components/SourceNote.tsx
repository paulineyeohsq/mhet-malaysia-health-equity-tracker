import { SOURCES } from "../lib/sources";
import Disclosure from "./Disclosure";

/**
 * Provenance footer required on every indicator. The line you always see names the source organisation and year (and
 * flags that a note exists); one click shows the rest: geography, unit, last-updated date, the "View source" link and
 * any caveat that applies to the figure.
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
    <Disclosure
      className="mt-2 text-xs leading-relaxed text-ink-muted"
      summary={
        <>
          View source — {s.org}
          {year !== undefined ? ` · ${year}` : ""}
          {s.caveat && (
            <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-900">⚠ note</span>
          )}
        </>
      }
    >
      <p>
        Source: {s.org}
        {year !== undefined ? ` · Year: ${year}` : ""} · Geography: {s.geography} · Unit: {s.unit} · Last updated:{" "}
        {s.lastUpdated}
        {extra ? ` · ${extra}` : ""}{" "}
        <a
          href={s.url}
          target="_blank"
          rel="noreferrer"
          className="text-series-1 underline underline-offset-2 hover:text-seq-600"
        >
          Open the dataset
        </a>
      </p>
      {s.caveat && (
        <p className="mt-1 text-ink-secondary">
          <span aria-hidden="true">⚠ </span>
          <span className="font-medium">Note: </span>
          {s.caveat}
        </p>
      )}
    </Disclosure>
  );
}
