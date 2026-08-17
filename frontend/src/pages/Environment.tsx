import { useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import KPISummarySection from "../components/KPISummarySection";
import SourceNote from "../components/SourceNote";
import BarRankingCard from "../components/BarRankingCard";
import LineChartCard, { type Series } from "../components/LineChartCard";
import InsufficientData from "../components/InsufficientData";
import { useData } from "../lib/useData";

interface ForestReserveNational {
  year: number;
  area_hectares: number | null;
}
interface ForestReserveState {
  state: string;
  year: number;
  area_hectares: number | null;
}
interface WaterConsumptionState {
  state: string;
  year: number;
  sector: "domestic" | "nondomestic";
  consumption_mld: number | null;
}
interface WaterProductionState {
  state: string;
  year: number;
  production_mld: number | null;
}
interface AirPollutionNational {
  year: number;
  pollutant: string;
  concentration: number | null;
}
interface GhgEmissionsNational {
  year: number;
  source: string;
  emissions_gg_co2e: number | null;
}
interface WaterPollutionBasinNational {
  year: number;
  basins_monitored: number | null;
  measure: "bod5" | "nh3n" | "ss";
  status: "clean" | "slightly_polluted" | "polluted";
  n_basins: number | null;
  proportion_pct: number | null;
}
interface ElectricityFlowNational {
  year: number;
  sector: string;
  consumption_mkwh?: number | null;
  supply_mkwh?: number | null;
}

const POLLUTANT_LABELS: Record<string, string> = {
  CO: "Carbon monoxide (CO)",
  NO2: "Nitrogen dioxide (NO₂)",
  O3: "Ozone (O₃)",
  "PM 10": "Particulate matter (PM₁₀)",
  "PM 2.5": "Particulate matter (PM₂.₅)",
  SO2: "Sulfur dioxide (SO₂)",
};
const POLLUTANT_UNITS: Record<string, string> = {
  CO: "ppm",
  NO2: "ppm",
  O3: "ppm",
  "PM 10": "µg/m³",
  "PM 2.5": "µg/m³",
  SO2: "ppm",
};

const GHG_SOURCE_LABELS: Record<string, string> = {
  total: "Total",
  net: "Net (after LULUCF)",
  energy: "Energy",
  industrial_processes: "Industrial processes",
  agriculture: "Agriculture",
  waste: "Waste",
  lulucf: "Land use, land-use change & forestry (LULUCF)",
};
const GHG_COLORS: Record<string, string> = {
  total: "#0b0b0b",
  net: "#898781",
  energy: "#eb6834",
  industrial_processes: "#4a3aa7",
  agriculture: "#1baf7a",
  waste: "#e87ba4",
  lulucf: "#2a78d6",
};

const BASIN_MEASURE_LABELS: Record<string, string> = {
  bod5: "Biochemical Oxygen Demand (BOD₅)",
  nh3n: "Ammoniacal Nitrogen (NH₃N)",
  ss: "Suspended Solids",
};
const BASIN_STATUS_COLORS: Record<string, string> = {
  clean: "#1baf7a",
  slightly_polluted: "#eda100",
  polluted: "#d03b3b",
};

function fmtHectares(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${(v / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })}k ha`;
}

export default function Environment() {
  const { data: forestNational } = useData<ForestReserveNational[]>("forest_reserve_national.json");
  const { data: forestState } = useData<ForestReserveState[]>("forest_reserve_state.json");
  const { data: waterConsumption } = useData<WaterConsumptionState[]>("water_consumption_state.json");
  const { data: waterProduction } = useData<WaterProductionState[]>("water_production_state.json");
  const { data: airPollution } = useData<AirPollutionNational[]>("air_pollution_national.json");
  const { data: ghgEmissions } = useData<GhgEmissionsNational[]>("ghg_emissions_national.json");
  const { data: waterPollutionBasin } = useData<WaterPollutionBasinNational[]>("water_pollution_basin_national.json");
  const { data: electricityConsumption } = useData<ElectricityFlowNational[]>("electricity_consumption_national.json");
  const { data: electricitySupply } = useData<ElectricityFlowNational[]>("electricity_supply_national.json");

  // -- State-level year selector: years present in ALL THREE state-level
  // datasets, so the three panels below stay in sync when the user changes it.
  const stateYears = useMemo(() => {
    if (!forestState || !waterConsumption || !waterProduction) return [];
    const forestYears = new Set(forestState.map((r) => r.year));
    const consumptionYears = new Set(waterConsumption.map((r) => r.year));
    const productionYears = new Set(waterProduction.map((r) => r.year));
    return Array.from(forestYears)
      .filter((y) => consumptionYears.has(y) && productionYears.has(y))
      .sort((a, b) => b - a);
  }, [forestState, waterConsumption, waterProduction]);
  const [stateYear, setStateYear] = useState<number | null>(null);
  const effectiveStateYear = stateYear ?? stateYears[0] ?? null;

  const forestStateData = useMemo(
    () => (forestState ?? []).filter((r) => r.year === effectiveStateYear && r.area_hectares !== null),
    [forestState, effectiveStateYear]
  );
  const waterConsumptionDomesticData = useMemo(
    () => (waterConsumption ?? []).filter((r) => r.year === effectiveStateYear && r.sector === "domestic" && r.consumption_mld !== null),
    [waterConsumption, effectiveStateYear]
  );
  const waterProductionData = useMemo(
    () => (waterProduction ?? []).filter((r) => r.year === effectiveStateYear && r.production_mld !== null),
    [waterProduction, effectiveStateYear]
  );

  const forestTrendData = useMemo(
    () => (forestNational ?? []).slice().sort((a, b) => a.year - b.year).map((r) => ({ year: r.year, "Forest reserve area (ha)": r.area_hectares })),
    [forestNational]
  );
  const forestTrendSeries: Series[] = [{ key: "Forest reserve area (ha)", label: "Forest reserve area (ha)", color: "#1baf7a" }];

  // -- Air pollution: one pollutant at a time (mixed ppm/µg/m³ units can't share an axis).
  const pollutants = useMemo(() => Array.from(new Set((airPollution ?? []).map((r) => r.pollutant))).sort(), [airPollution]);
  const [pollutant, setPollutant] = useState<string>("PM 2.5");
  const pollutantData = useMemo(
    () =>
      (airPollution ?? [])
        .filter((r) => r.pollutant === pollutant)
        .sort((a, b) => a.year - b.year)
        .map((r) => ({ year: r.year, [POLLUTANT_LABELS[pollutant] ?? pollutant]: r.concentration })),
    [airPollution, pollutant]
  );
  const pollutantSeries: Series[] = [{ key: POLLUTANT_LABELS[pollutant] ?? pollutant, label: POLLUTANT_LABELS[pollutant] ?? pollutant, color: "#eb6834" }];

  const ghgTrendData = useMemo(() => {
    if (!ghgEmissions) return [];
    const years = Array.from(new Set(ghgEmissions.map((r) => r.year))).sort((a, b) => a - b);
    const sources = Array.from(new Set(ghgEmissions.map((r) => r.source)));
    return years.map((yr) => {
      const row: Record<string, number | null> & { year: number } = { year: yr };
      for (const src of sources) {
        row[GHG_SOURCE_LABELS[src] ?? src] = ghgEmissions.find((r) => r.year === yr && r.source === src)?.emissions_gg_co2e ?? null;
      }
      return row;
    });
  }, [ghgEmissions]);
  const ghgSeries: Series[] = useMemo(() => {
    const sources = Array.from(new Set((ghgEmissions ?? []).map((r) => r.source)));
    const order = ["total", "net", "energy", "industrial_processes", "agriculture", "waste", "lulucf"];
    return sources
      .slice()
      .sort((a, b) => order.indexOf(a) - order.indexOf(b))
      .map((src) => ({ key: GHG_SOURCE_LABELS[src] ?? src, label: GHG_SOURCE_LABELS[src] ?? src, color: GHG_COLORS[src] ?? "#898781" }));
  }, [ghgEmissions]);

  const [basinMeasure, setBasinMeasure] = useState<string>("bod5");
  const basinTrendData = useMemo(() => {
    if (!waterPollutionBasin) return [];
    const rows = waterPollutionBasin.filter((r) => r.measure === basinMeasure);
    const years = Array.from(new Set(rows.map((r) => r.year))).sort((a, b) => a - b);
    return years.map((yr) => ({
      year: yr,
      Clean: rows.find((r) => r.year === yr && r.status === "clean")?.proportion_pct ?? null,
      "Slightly polluted": rows.find((r) => r.year === yr && r.status === "slightly_polluted")?.proportion_pct ?? null,
      Polluted: rows.find((r) => r.year === yr && r.status === "polluted")?.proportion_pct ?? null,
    }));
  }, [waterPollutionBasin, basinMeasure]);
  const basinSeries: Series[] = [
    { key: "Clean", label: "Clean", color: BASIN_STATUS_COLORS.clean },
    { key: "Slightly polluted", label: "Slightly polluted", color: BASIN_STATUS_COLORS.slightly_polluted },
    { key: "Polluted", label: "Polluted", color: BASIN_STATUS_COLORS.polluted },
  ];

  const electricityTrendData = useMemo(() => {
    if (!electricityConsumption || !electricitySupply) return [];
    const years = Array.from(new Set([...electricityConsumption.map((r) => r.year), ...electricitySupply.map((r) => r.year)])).sort((a, b) => a - b);
    return years.map((yr) => ({
      year: yr,
      "Total consumption (MKWh)": electricityConsumption.find((r) => r.year === yr && r.sector === "total")?.consumption_mkwh ?? null,
      "Total supply (MKWh)": electricitySupply.find((r) => r.year === yr && r.sector === "total")?.supply_mkwh ?? null,
    }));
  }, [electricityConsumption, electricitySupply]);
  const electricitySeries: Series[] = [
    { key: "Total consumption (MKWh)", label: "Total consumption (MKWh)", color: "#eda100" },
    { key: "Total supply (MKWh)", label: "Total supply (MKWh)", color: "#2a78d6" },
  ];

  const latestForestNational = forestNational ? [...forestNational].filter((r) => r.area_hectares !== null).sort((a, b) => b.year - a.year)[0] : null;
  const latestPm25 = airPollution
    ? [...airPollution].filter((r) => r.pollutant === "PM 2.5" && r.concentration !== null).sort((a, b) => b.year - a.year)[0]
    : null;
  const latestGhgTotal = ghgEmissions
    ? [...ghgEmissions].filter((r) => r.source === "total" && r.emissions_gg_co2e !== null).sort((a, b) => b.year - a.year)[0]
    : null;
  const latestBasinClean = waterPollutionBasin
    ? [...waterPollutionBasin].filter((r) => r.measure === "bod5" && r.status === "clean").sort((a, b) => b.year - a.year)[0]
    : null;

  return (
    <div>
      <PageHeader
        title="Environment"
        subtitle="Land, water and air indicators from DOSM's environment catalogue — forest reserve area and water infrastructure are state-level; air pollution, greenhouse gas emissions, river basin water quality and electricity flows are published nationally only, with no state or station breakdown in the source."
      />
      <div className="space-y-8 p-6 lg:p-10">
        <KPISummarySection
          title="National snapshot (latest available year per indicator)"
          headingId="env-kpis"
          columns={4}
          items={[
            { label: "Permanent forest reserve", value: fmtHectares(latestForestNational?.area_hectares), sublabel: latestForestNational ? `${latestForestNational.year}` : undefined },
            { label: "PM₂.₅ concentration", value: latestPm25?.concentration != null ? `${latestPm25.concentration} µg/m³` : "—", sublabel: latestPm25 ? `${latestPm25.year}` : undefined },
            { label: "GHG emissions (total)", value: latestGhgTotal?.emissions_gg_co2e != null ? `${Math.round(latestGhgTotal.emissions_gg_co2e).toLocaleString()} Gg CO₂e` : "—", sublabel: latestGhgTotal ? `${latestGhgTotal.year}` : undefined },
            { label: "River basins classified clean (BOD₅)", value: latestBasinClean?.proportion_pct != null ? `${latestBasinClean.proportion_pct.toFixed(1)}%` : "—", sublabel: latestBasinClean ? `${latestBasinClean.year}` : undefined },
          ]}
        />

        {stateYears.length > 0 && (
          <div className="flex flex-wrap items-end gap-4 rounded-lg border border-line-grid bg-surface p-4">
            <div>
              <label htmlFor="env-state-year" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                State-level data as of year
              </label>
              <select
                id="env-state-year"
                value={effectiveStateYear ?? ""}
                onChange={(e) => setStateYear(Number(e.target.value))}
                className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
              >
                {stateYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <p className="max-w-md text-xs text-ink-muted">Applies to forest reserve area and water consumption/production below — the latest year with data in all three state-level datasets.</p>
          </div>
        )}

        <section aria-labelledby="env-forest">
          <h2 id="env-forest" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Forest reserve area by state
          </h2>
          {forestStateData.length > 0 ? (
            <BarRankingCard title={`Permanent forest reserve area — ${effectiveStateYear}`} data={forestStateData} nameKey="state" valueKey="area_hectares" unit="ha" color="#1baf7a" />
          ) : (
            <InsufficientData reason="No state-level forest reserve data for the selected year." />
          )}
          <SourceNote sourceKey="forest_reserve" year={effectiveStateYear ?? undefined} />

          <div className="mt-4">
            {forestTrendData.length > 0 ? (
              <LineChartCard title="National forest reserve area over time" data={forestTrendData} xKey="year" series={forestTrendSeries} unit="ha" />
            ) : (
              <InsufficientData reason="No national forest reserve trend data available." />
            )}
            <SourceNote sourceKey="forest_reserve" />
          </div>
        </section>

        <section aria-labelledby="env-water">
          <h2 id="env-water" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Water infrastructure by state
          </h2>
          <p className="mb-3 max-w-3xl text-sm text-ink-secondary">
            Annual mean daily rate of water consumed and produced per state — infrastructure-capacity context, not a
            water-quality or access measure (see Socioeconomic Inequality for treated-water access rates).
            W.P. Kuala Lumpur and W.P. Putrajaya are absent from the source (served by Selangor's water utility, not
            billed separately).
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              {waterConsumptionDomesticData.length > 0 ? (
                <BarRankingCard title={`Domestic water consumption — ${effectiveStateYear}`} data={waterConsumptionDomesticData} nameKey="state" valueKey="consumption_mld" unit="MLD" color="#2a78d6" />
              ) : (
                <InsufficientData reason="No domestic water consumption data for the selected year." />
              )}
            </div>
            <div>
              {waterProductionData.length > 0 ? (
                <BarRankingCard title={`Water production — ${effectiveStateYear}`} data={waterProductionData} nameKey="state" valueKey="production_mld" unit="MLD" color="#4a3aa7" />
              ) : (
                <InsufficientData reason="No water production data for the selected year." />
              )}
            </div>
          </div>
          <SourceNote sourceKey="water_utilities" year={effectiveStateYear ?? undefined} />
        </section>

        <section aria-labelledby="env-air">
          <h2 id="env-air" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Air pollution (national)
          </h2>
          <div className="mb-3 flex flex-wrap items-end gap-4">
            <div>
              <label htmlFor="env-pollutant" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                Pollutant
              </label>
              <select
                id="env-pollutant"
                value={pollutant}
                onChange={(e) => setPollutant(e.target.value)}
                className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
              >
                {pollutants.map((p) => (
                  <option key={p} value={p}>
                    {POLLUTANT_LABELS[p] ?? p}
                  </option>
                ))}
              </select>
            </div>
            <p className="max-w-md text-xs text-ink-muted">
              National monthly monitoring-station average, aggregated to an annual mean here. No station-level or
              state breakdown exists in the source.
            </p>
          </div>
          {pollutantData.length > 0 ? (
            <LineChartCard title={`${POLLUTANT_LABELS[pollutant] ?? pollutant} — national annual mean`} data={pollutantData} xKey="year" series={pollutantSeries} unit={POLLUTANT_UNITS[pollutant]} />
          ) : (
            <InsufficientData reason="No air pollution trend data for the selected pollutant." />
          )}
          <SourceNote sourceKey="air_pollution" />
        </section>

        <section aria-labelledby="env-ghg">
          <h2 id="env-ghg" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Greenhouse gas emissions by source (national)
          </h2>
          {ghgTrendData.length > 0 ? (
            <LineChartCard title="GHG emissions by source" data={ghgTrendData} xKey="year" series={ghgSeries} unit="Gg CO₂e" height={340} />
          ) : (
            <InsufficientData reason="No GHG emissions trend data available." />
          )}
          <p className="mt-2 max-w-3xl text-xs text-ink-muted">
            2020–2021 sectoral breakdown is provisional/blank in the source — only "Total" is populated for those two
            years.
          </p>
          <SourceNote sourceKey="ghg_emissions" />
        </section>

        <section aria-labelledby="env-basin">
          <h2 id="env-basin" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            River basin water quality (national)
          </h2>
          <div className="mb-3 flex flex-wrap items-end gap-4">
            <div>
              <label htmlFor="env-basin-measure" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                Pollution indicator
              </label>
              <select
                id="env-basin-measure"
                value={basinMeasure}
                onChange={(e) => setBasinMeasure(e.target.value)}
                className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
              >
                {Object.keys(BASIN_MEASURE_LABELS).map((m) => (
                  <option key={m} value={m}>
                    {BASIN_MEASURE_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
            <p className="max-w-md text-xs text-ink-muted">
              Share of ~120-150 monitored river basins classified clean / slightly polluted / polluted by this
              indicator. Basins span more than one state, so this is national only — not a state determinant.
            </p>
          </div>
          {basinTrendData.length > 0 ? (
            <LineChartCard title={`River basins by classification — ${BASIN_MEASURE_LABELS[basinMeasure]}`} data={basinTrendData} xKey="year" series={basinSeries} unit="%" />
          ) : (
            <InsufficientData reason="No river basin pollution trend data for the selected indicator." />
          )}
          <SourceNote sourceKey="water_pollution" />
        </section>

        <section aria-labelledby="env-electricity">
          <h2 id="env-electricity" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Electricity consumption &amp; supply (national)
          </h2>
          <p className="mb-3 max-w-3xl text-sm text-ink-secondary">
            Total annual electricity consumed and supplied nationally — energy-context alongside household
            electricity access (see Socioeconomic Inequality). The most recent year may be a partial-year total if
            the latest months were still provisional at source-fetch time.
          </p>
          {electricityTrendData.length > 0 ? (
            <LineChartCard title="Electricity consumption vs. supply" data={electricityTrendData} xKey="year" series={electricitySeries} unit="MKWh" />
          ) : (
            <InsufficientData reason="No electricity consumption/supply trend data available." />
          )}
          <SourceNote sourceKey="electricity_flow" />
        </section>
      </div>
    </div>
  );
}
