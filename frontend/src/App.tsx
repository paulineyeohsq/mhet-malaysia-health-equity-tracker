import { HashRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Overview from "./pages/Overview";
import HealthEquityMap from "./pages/HealthEquityMap";
import SocioeconomicInequality from "./pages/SocioeconomicInequality";
import HealthOutcomes from "./pages/HealthOutcomes";
import HealthcareAccess from "./pages/HealthcareAccess";
import PopulationEquity from "./pages/PopulationEquity";
import InequalityAnalytics from "./pages/InequalityAnalytics";
import StateEquityMatrix from "./pages/StateEquityMatrix";
import DataExplorer from "./pages/DataExplorer";
import DataGaps from "./pages/DataGaps";
import Methodology from "./pages/Methodology";
import DeterminantsExplorer from "./pages/DeterminantsExplorer";
import IndicatorMatrix from "./pages/IndicatorMatrix";
import Trends from "./pages/Trends";
import PriorityAreas from "./pages/PriorityAreas";
import ResearchOpportunities from "./pages/ResearchOpportunities";
import Financing from "./pages/Financing";

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
