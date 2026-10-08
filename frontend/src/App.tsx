import { lazy } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
const Overview = lazy(() => import("./pages/Overview"));
const HealthEquityMap = lazy(() => import("./pages/HealthEquityMap"));
const SocioeconomicInequality = lazy(() => import("./pages/SocioeconomicInequality"));
const HealthOutcomes = lazy(() => import("./pages/HealthOutcomes"));
const HealthcareAccess = lazy(() => import("./pages/HealthcareAccess"));
const PopulationEquity = lazy(() => import("./pages/PopulationEquity"));
const InequalityAnalytics = lazy(() => import("./pages/InequalityAnalytics"));
const StateEquityMatrix = lazy(() => import("./pages/StateEquityMatrix"));
const DataExplorer = lazy(() => import("./pages/DataExplorer"));
const DataGaps = lazy(() => import("./pages/DataGaps"));
const Methodology = lazy(() => import("./pages/Methodology"));
const DeterminantsExplorer = lazy(() => import("./pages/DeterminantsExplorer"));
const IndicatorMatrix = lazy(() => import("./pages/IndicatorMatrix"));
const Trends = lazy(() => import("./pages/Trends"));
const PriorityAreas = lazy(() => import("./pages/PriorityAreas"));
const ResearchOpportunities = lazy(() => import("./pages/ResearchOpportunities"));
const Financing = lazy(() => import("./pages/Financing"));
const Environment = lazy(() => import("./pages/Environment"));

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Overview />} />
          <Route path="map" element={<HealthEquityMap />} />
          <Route path="socioeconomic" element={<SocioeconomicInequality />} />
          <Route path="health-outcomes" element={<HealthOutcomes />} />
          <Route path="healthcare-access" element={<HealthcareAccess />} />
          <Route path="financing" element={<Financing />} />
          <Route path="environment" element={<Environment />} />
          <Route path="population" element={<PopulationEquity />} />
          <Route path="determinants" element={<DeterminantsExplorer />} />
          <Route path="matrix" element={<IndicatorMatrix />} />
          <Route path="trends" element={<Trends />} />
          <Route path="analytics" element={<InequalityAnalytics />} />
          <Route path="state-matrix" element={<StateEquityMatrix />} />
          <Route path="priority-areas" element={<PriorityAreas />} />
          <Route path="research-opportunities" element={<ResearchOpportunities />} />
          <Route path="explorer" element={<DataExplorer />} />
          <Route path="data-gaps" element={<DataGaps />} />
          <Route path="methodology" element={<Methodology />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
