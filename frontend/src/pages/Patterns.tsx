import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { PATTERNS } from "../lib/routes";

const PAGES: Record<string, LazyExoticComponent<ComponentType>> = {
  trends: lazy(() => import("./Trends")),
  matrix: lazy(() => import("./IndicatorMatrix")),
  inequality: lazy(() => import("./SocioeconomicInequality")),
};

/** The three analytical views on one page, switched with a toggle. Each view is the original page, unchanged. */
export default function Patterns() {
  const { view } = useParams();
  const navigate = useNavigate();
  const current = PATTERNS.find((p) => p.id === view);
  if (!current) return <Navigate to={PATTERNS[0].path} replace />;
  const Page = PAGES[current.id];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-line-grid bg-plane px-6 py-3 lg:px-10">
        <span id="pattern-view-label" className="text-xs font-medium uppercase tracking-wide text-ink-muted">
          View as
        </span>
        <div role="radiogroup" aria-labelledby="pattern-view-label" className="inline-flex overflow-hidden rounded-md border border-line-axis">
          {PATTERNS.map((p) => {
            const on = p.id === current.id;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => navigate(p.path)}
                className={`px-3 py-1.5 text-sm font-medium ${on ? "bg-series-1 text-white" : "bg-surface text-ink-secondary hover:bg-seq-100"} ${p.id !== PATTERNS[0].id ? "border-l border-line-axis" : ""}`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>
      <Suspense fallback={<div className="p-10 text-sm text-ink-muted">Loading…</div>}>
        <Page key={current.id} />
      </Suspense>
    </div>
  );
}
