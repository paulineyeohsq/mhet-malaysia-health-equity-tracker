import { HashRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Overview from "./pages/Overview";
import HealthEquityMap from "./pages/HealthEquityMap";
import SocioeconomicInequality from "./pages/SocioeconomicInequality";
import HealthOutcomes from "./pages/HealthOutcomes";
import HealthcareAccess from "./pages/HealthcareAccess";
import PopulationEquity from "./pages/PopulationEquity";
import InequalityAnalytics from "./pages/InequalityAnalytics";
import DataExplorer from "./pages/DataExplorer";
import Methodology from "./pages/Methodology";

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
          <Route path="population" element={<PopulationEquity />} />
          <Route path="analytics" element={<InequalityAnalytics />} />
          <Route path="explorer" element={<DataExplorer />} />
          <Route path="methodology" element={<Methodology />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
