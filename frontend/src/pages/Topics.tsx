import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { TOPICS } from "../lib/routes";

const PAGES: Record<string, LazyExoticComponent<ComponentType>> = {
  outcomes: lazy(() => import("./HealthOutcomes")),
  access: lazy(() => import("./HealthcareAccess")),
  financing: lazy(() => import("./Financing")),
  environment: lazy(() => import("./Environment")),
};

/** One dashboard for the four domain topics, with a topic dropdown. Each topic is the original page, unchanged. */
export default function Topics() {
  const { topic } = useParams();
  const navigate = useNavigate();
  const current = TOPICS.find((t) => t.id === topic);
  if (!current) return <Navigate to={TOPICS[0].path} replace />;
  const Page = PAGES[current.id];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-line-grid bg-plane px-6 py-3 lg:px-10">
        <label htmlFor="topic-select" className="text-xs font-medium uppercase tracking-wide text-ink-muted">
          Health topic
        </label>
        <select
          id="topic-select"
          value={current.id}
          onChange={(e) => navigate(TOPICS.find((t) => t.id === e.target.value)!.path)}
          className="rounded-md border border-line-axis bg-surface px-2 py-1.5 text-sm"
        >
          {TOPICS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <Suspense fallback={<div className="p-10 text-sm text-ink-muted">Loading…</div>}>
        <Page key={current.id} />
      </Suspense>
    </div>
  );
}
