import { lazy } from "react";
import { HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { PATTERNS, TOPICS } from "./lib/routes";
import Layout from "./components/Layout";
const Overview = lazy(() => import("./pages/Overview"));
const HealthEquityMap = lazy(() => import("./pages/HealthEquityMap"));
const PopulationEquity = lazy(() => import("./pages/PopulationEquity"));
const InequalityAnalytics = lazy(() => import("./pages/InequalityAnalytics"));
const StateEquityMatrix = lazy(() => import("./pages/StateEquityMatrix"));
const DataExplorer = lazy(() => import("./pages/DataExplorer"));
const DataGaps = lazy(() => import("./pages/DataGaps"));
const Methodology = lazy(() => import("./pages/Methodology"));
const DeterminantsExplorer = lazy(() => import("./pages/DeterminantsExplorer"));
const PriorityAreas = lazy(() => import("./pages/PriorityAreas"));
const ResearchOpportunities = lazy(() => import("./pages/ResearchOpportunities"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Topics = lazy(() => import("./pages/Topics"));
const Patterns = lazy(() => import("./pages/Patterns"));

/** Sends an old URL to its new home, keeping any router state (the "Ask MY-HEO" shortcuts pass filters that way). */
function Redirect({ to }: { to: string }) {
  const { state } = useLocation();
  return <Navigate to={to} state={state} replace />;
}

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Overview />} />
          <Route path="map" element={<HealthEquityMap />} />
          <Route path="topics" element={<Navigate to={TOPICS[0].path} replace />} />
          <Route path="topics/:topic" element={<Topics />} />
          <Route path="patterns" element={<Navigate to={PATTERNS[0].path} replace />} />
          <Route path="patterns/:view" element={<Patterns />} />
          {[...TOPICS, ...PATTERNS].map((o) => (
            <Route key={o.legacy} path={o.legacy.slice(1)} element={<Redirect to={o.path} />} />
          ))}
          <Route path="population" element={<PopulationEquity />} />
          <Route path="determinants" element={<DeterminantsExplorer />} />
          <Route path="analytics" element={<InequalityAnalytics />} />
          <Route path="state-matrix" element={<StateEquityMatrix />} />
          <Route path="priority-areas" element={<PriorityAreas />} />
          <Route path="research-opportunities" element={<ResearchOpportunities />} />
          <Route path="explorer" element={<DataExplorer />} />
          <Route path="data-gaps" element={<DataGaps />} />
          <Route path="methodology" element={<Methodology />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
