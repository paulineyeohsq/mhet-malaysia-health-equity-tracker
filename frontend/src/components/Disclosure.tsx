import type { ReactNode } from "react";

/**
 * Progressive disclosure: a one-line summary that is always visible, with the detail (caveats, formulas, citations)
 * one click away. Native <details>, so it is keyboard- and screen-reader-accessible with no script, and printing /
 * "find in page" still reach the content.
 */
export default function Disclosure({
  summary,
  children,
  className = "",
  summaryClassName = "",
  defaultOpen = false,
}: {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
  summaryClassName?: string;
  defaultOpen?: boolean;
}) {
  return (
    <details className={`group ${className}`} open={defaultOpen}>
      <summary
        className={`flex cursor-pointer list-none items-baseline gap-1.5 [&::-webkit-details-marker]:hidden ${summaryClassName}`}
      >
        <span aria-hidden="true" className="inline-block text-[0.7em] transition-transform group-open:rotate-90">
          ▶
        </span>
        <span>{summary}</span>
      </summary>
      <div className="mt-1.5">{children}</div>
    </details>
  );
}
