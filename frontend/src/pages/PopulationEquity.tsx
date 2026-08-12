import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import PageHeader from "../components/PageHeader";
import StatTile from "../components/StatTile";
import SourceNote from "../components/SourceNote";
import LineChartCard, { type Series } from "../components/LineChartCard";
import BarRankingCard from "../components/BarRankingCard";
import DataTable, { type Column } from "../components/DataTable";
import InsufficientData from "../components/InsufficientData";
import { useData } from "../lib/useData";

interface PopStateRow {
  state: string;
  year: number;
  sex: "overall" | "male" | "female";
  population_thousands: number;
}

interface PopDistrictRow {
  state: string;
  district: string;
  year: number;
  population_total: number;
  sex_male: number;
  sex_female: number;
  ethnicity_bumi: number;
  ethnicity_chinese: number;
  ethnicity_indian: number;
  ethnicity_other: number;
  age_0_14: number | null;
  age_15_64: number | null;
  age_65_above: number | null;
}

const SERIES_COLORS = [
  "#2a78d6", // series-1
  "#eb6834", // series-2
  "#1baf7a", // series-3
  "#eda100", // series-4
  "#e87ba4", // series-5
  "#008300", // series-6
  "#4a3aa7", // series-7
];

export default function PopulationEquity() {
  const { data: popState } = useData<PopStateRow[]>("population_state.json");
  const { data: popDistrict } = useData<PopDistrictRow[]>("population_district.json");

  // ---- Derived year lists ----
  const stateYears = useMemo(
    () => (popState ? Array.from(new Set(popState.map((r) => r.year))).sort((a, b) => a - b) : []),
    [popState]
  );
  const latestStateYear = stateYears.length ? stateYears[stateYears.length - 1] : null;

  const censusYears = useMemo(
    () => (popDistrict ? Array.from(new Set(popDistrict.map((r) => r.year))).sort((a, b) => a - b) : []),
    [popDistrict]
  );
  const latestCensusYear = censusYears.length ? censusYears[censusYears.length - 1] : null;

  // ---- National KPI tiles (from state file, latest year) ----
  const nationalSnapshot = useMemo(() => {
    if (!popState || latestStateYear === null) return null;
    const rows = popState.filter((r) => r.year === latestStateYear);
    const overall = rows.filter((r) => r.sex === "overall").reduce((a, r) => a + r.population_thousands, 0);
    const male = rows.filter((r) => r.sex === "male").reduce((a, r) => a + r.population_thousands, 0);
    const female = rows.filter((r) => r.sex === "female").reduce((a, r) => a + r.population_thousands, 0);
    return {
      year: latestStateYear,
      overallThousands: overall,
      male,
      female,
      sexRatio: female > 0 ? (male / female) * 100 : null,
      nStates: new Set(rows.map((r) => r.state)).size,
    };
  }, [popState, latestStateYear]);

  // ---- National population trend across state-file years ----
  const trendData = useMemo(() => {
    if (!popState) return [];
    return stateYears.map((y) => {
      const rows = popState.filter((r) => r.year === y);
      return {
        year: y,
        Population: rows.filter((r) => r.sex === "overall").reduce((a, r) => a + r.population_thousands, 0),
      };
    });
  }, [popState, stateYears]);
  const trendSeries: Series[] = [{ key: "Population", label: "Total population (thousands)", color: SERIES_COLORS[0] }];

  // ---- Sex composition by state (latest state year) ----
  const sexByState = useMemo(() => {
    if (!popState || latestStateYear === null) return [];
    const states = Array.from(new Set(popState.map((r) => r.state))).sort();
    return states
      .map((state) => {
        const male = popState.find((r) => r.state === state && r.year === latestStateYear && r.sex === "male");
        const female = popState.find((r) => r.state === state && r.year === latestStateYear && r.sex === "female");
        return {
          state,
          Male: male ? male.population_thousands : null,
          Female: female ? female.population_thousands : null,
        };
      })
      .sort((a, b) => (b.Male ?? 0) + (b.Female ?? 0) - ((a.Male ?? 0) + (a.Female ?? 0)));
  }, [popState, latestStateYear]);

  // ---- Age structure: geography selector (All Malaysia or a state), aggregated from district census rows ----
  const stateOptionsForAge = useMemo(() => {
    if (!popDistrict) return [];
    return Array.from(new Set(popDistrict.map((r) => r.state))).sort();
  }, [popDistrict]);
  const [ageGeo, setAgeGeo] = useState<string>("__all__");
  const [ageYear, setAgeYear] = useState<number | null>(null);
  const effectiveAgeYear = ageYear ?? latestCensusYear;

  const ageBreakdown = useMemo(() => {
    if (!popDistrict || effectiveAgeYear === null) return null;
    const rows = popDistrict.filter(
      (r) => r.year === effectiveAgeYear && (ageGeo === "__all__" || r.state === ageGeo)
    );
    if (!rows.length) return null;
    const anyNull = rows.some((r) => r.age_0_14 === null || r.age_15_64 === null || r.age_65_above === null);
    if (anyNull) return { unavailable: true as const };
    const y0_14 = rows.reduce((a, r) => a + (r.age_0_14 ?? 0), 0);
    const y15_64 = rows.reduce((a, r) => a + (r.age_15_64 ?? 0), 0);
    const y65 = rows.reduce((a, r) => a + (r.age_65_above ?? 0), 0);
    const total = y0_14 + y15_64 + y65;
    return {
      unavailable: false as const,
      total,
      data: [
        { group: "0–14", Population: y0_14, Share: total ? (y0_14 / total) * 100 : 0 },
        { group: "15–64", Population: y15_64, Share: total ? (y15_64 / total) * 100 : 0 },
        { group: "65+", Population: y65, Share: total ? (y65 / total) * 100 : 0 },
      ],
    };
  }, [popDistrict, effectiveAgeYear, ageGeo]);

  // ---- Ethnicity composition: geography selector (state or district), standalone ----
  const districtOptions = useMemo(() => {
    if (!popDistrict) return [];
    return Array.from(new Set(popDistrict.map((r) => `${r.state}||${r.district}`)))
      .sort()
      .map((k) => {
        const [state, district] = k.split("||");
        return { state, district };
      });
  }, [popDistrict]);

  const [ethnicityLevel, setEthnicityLevel] = useState<"state" | "district">("state");
  const [ethnicityState, setEthnicityState] = useState<string>("__all__");
  const [ethnicityDistrictKey, setEthnicityDistrictKey] = useState<string>("");
  const [ethnicityYear, setEthnicityYear] = useState<number | null>(null);
  const effectiveEthnicityYear = ethnicityYear ?? latestCensusYear;

  const ethnicityRows = useMemo(() => {
    if (!popDistrict || effectiveEthnicityYear === null) return [];
    let rows = popDistrict.filter((r) => r.year === effectiveEthnicityYear);
    if (ethnicityLevel === "state") {
      if (ethnicityState !== "__all__") rows = rows.filter((r) => r.state === ethnicityState);
    } else if (ethnicityDistrictKey) {
      const [state, district] = ethnicityDistrictKey.split("||");
      rows = rows.filter((r) => r.state === state && r.district === district);
    } else {
      rows = [];
    }
    return rows;
  }, [popDistrict, effectiveEthnicityYear, ethnicityLevel, ethnicityState, ethnicityDistrictKey]);

  const ethnicityLabel = useMemo(() => {
    if (ethnicityLevel === "state") return ethnicityState === "__all__" ? "All Malaysia" : ethnicityState;
    if (!ethnicityDistrictKey) return "Select a district";
    const [, district] = ethnicityDistrictKey.split("||");
    return district;
  }, [ethnicityLevel, ethnicityState, ethnicityDistrictKey]);

  const ethnicityChart = useMemo(() => {
    if (!ethnicityRows.length) return null;
    const bumi = ethnicityRows.reduce((a, r) => a + r.ethnicity_bumi, 0);
    const chinese = ethnicityRows.reduce((a, r) => a + r.ethnicity_chinese, 0);
    const indian = ethnicityRows.reduce((a, r) => a + r.ethnicity_indian, 0);
    const other = ethnicityRows.reduce((a, r) => a + r.ethnicity_other, 0);
    const total = bumi + chinese + indian + other;
    if (!total) return null;
    return {
      total,
      data: [
        {
          group: ethnicityLabel,
          Bumiputera: bumi,
          Chinese: chinese,
          Indian: indian,
          Other: other,
          "Bumiputera (%)": Math.round((bumi / total) * 1000) / 10,
          "Chinese (%)": Math.round((chinese / total) * 1000) / 10,
          "Indian (%)": Math.round((indian / total) * 1000) / 10,
          "Other (%)": Math.round((other / total) * 1000) / 10,
        },
      ],
    };
  }, [ethnicityRows, ethnicityLabel]);

  // ---- District ranking (population, latest census year) ----
  const districtRanking = useMemo(() => {
    if (!popDistrict || latestCensusYear === null) return [];
    return popDistrict
      .filter((r) => r.year === latestCensusYear)
      .map((r) => ({ label: `${r.district} (${r.state})`, population_total: r.population_total }))
      .sort((a, b) => b.population_total - a.population_total)
      .slice(0, 15);
  }, [popDistrict, latestCensusYear]);

  // ---- Full browsing table (state-level, all years, all sexes) ----
  const stateTableColumns: Column[] = [
    { key: "state", label: "State" },
    { key: "year", label: "Year", numeric: true },
    { key: "sex", label: "Sex" },
    { key: "population_thousands", label: "Population (thousands)", numeric: true },
  ];
  const stateTableRows = useMemo(
    () => (popState ? [...popState].sort((a, b) => b.year - a.year || a.state.localeCompare(b.state)) : []),
    [popState]
  );

  const districtTableColumns: Column[] = [
    { key: "state", label: "State" },
    { key: "district", label: "District" },
    { key: "year", label: "Census year", numeric: true },
    { key: "population_total", label: "Total population", numeric: true },
    { key: "sex_male", label: "Male", numeric: true },
    { key: "sex_female", label: "Female", numeric: true },
    { key: "ethnicity_bumi", label: "Bumiputera", numeric: true },
    { key: "ethnicity_chinese", label: "Chinese", numeric: true },
    { key: "ethnicity_indian", label: "Indian", numeric: true },
    { key: "ethnicity_other", label: "Other", numeric: true },
    { key: "age_0_14", label: "Age 0–14", numeric: true },
    { key: "age_15_64", label: "Age 15–64", numeric: true },
    { key: "age_65_above", label: "Age 65+", numeric: true },
  ];
  const districtTableRows = useMemo(
    () =>
      popDistrict
        ? [...popDistrict]
            .sort((a, b) => b.year - a.year || a.state.localeCompare(b.state) || a.district.localeCompare(b.district))
        : [],
    [popDistrict]
  );

  return (
    <div>
      <PageHeader
        title="Population Equity"
        subtitle="Who lives where: population structure by sex, age, ethnicity and geography, shown alongside — not fused into — socioeconomic and health indicators."
      />

      <div className="space-y-8 p-6 lg:p-10">
        {/* KPI tiles */}
        <section aria-labelledby="pop-kpis">
          <h2 id="pop-kpis" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            National snapshot
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <StatTile
              label="Total population"
              value={nationalSnapshot ? (nationalSnapshot.overallThousands / 1000).toFixed(2) : "—"}
              unit="million"
              sublabel={nationalSnapshot ? `${nationalSnapshot.year}, sum of state estimates` : undefined}
            />
            <StatTile
              label="Male population"
              value={nationalSnapshot ? (nationalSnapshot.male / 1000).toFixed(2) : "—"}
              unit="million"
              sublabel={nationalSnapshot ? `${nationalSnapshot.year}` : undefined}
            />
            <StatTile
              label="Female population"
              value={nationalSnapshot ? (nationalSnapshot.female / 1000).toFixed(2) : "—"}
              unit="million"
              sublabel={nationalSnapshot ? `${nationalSnapshot.year}` : undefined}
            />
            <StatTile
              label="Sex ratio"
              value={nationalSnapshot?.sexRatio ? nationalSnapshot.sexRatio.toFixed(1) : "—"}
              unit="males per 100 females"
              sublabel={nationalSnapshot ? `${nationalSnapshot.year}, all states` : undefined}
            />
          </div>
          <SourceNote sourceKey="population" year={latestStateYear ?? undefined} />
          <p className="mt-2 max-w-3xl text-xs text-ink-muted">
            State-level population estimates are DOSM intercensal projections, available for {stateYears.join(", ") || "—"}
            {" "}— these are yearly estimates, not a full census.
          </p>
        </section>

        {/* Population trend + sex composition */}
        <section aria-labelledby="pop-trend">
          <h2 id="pop-trend" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Population trend and sex composition
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {trendData.length > 0 ? (
              <LineChartCard
                title="Total population over time (thousands)"
                data={trendData}
                xKey="year"
                series={trendSeries}
              />
            ) : (
              <InsufficientData reason="No state population trend data available." />
            )}
            {sexByState.length > 0 ? (
              <div className="rounded-lg border border-line-grid bg-surface p-4">
                <h3 className="mb-2 text-sm font-medium text-ink-primary">
                  Male vs. female population by state — {latestStateYear}
                </h3>
                <ResponsiveContainer width="100%" height={Math.max(260, sexByState.length * 26)}>
                  <BarChart data={sexByState} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 4 }}>
                    <CartesianGrid stroke="#e1e0d9" horizontal={false} />
                    <XAxis type="number" stroke="#898781" tick={{ fontSize: 11, fill: "#52514e" }} tickLine={false} axisLine={false} />
                    <YAxis
                      type="category"
                      dataKey="state"
                      stroke="#898781"
                      tick={{ fontSize: 11, fill: "#0b0b0b" }}
                      tickLine={false}
                      axisLine={false}
                      width={130}
                    />
                    <Tooltip
                      formatter={(v) => [`${Number(v).toLocaleString()} thousand`, ""]}
                      contentStyle={{ fontSize: 12, border: "1px solid #e1e0d9", borderRadius: 6 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Male" fill={SERIES_COLORS[0]} maxBarSize={12} />
                    <Bar dataKey="Female" fill={SERIES_COLORS[1]} maxBarSize={12} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <InsufficientData reason="No sex-disaggregated state population data available." />
            )}
          </div>
          <SourceNote sourceKey="population" year={latestStateYear ?? undefined} />
        </section>

        {/* Age structure */}
        <section aria-labelledby="pop-age">
          <h2 id="pop-age" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Age structure (census)
          </h2>
          <p className="mb-3 max-w-3xl text-xs text-ink-muted">
            Age breakdown is only available from the district-level census rounds ({censusYears.join(", ") || "—"}), which
            are decennial/quinquennial census years, not current or annual figures. Values below are aggregated from
            district-level census data. Age breakdown was not published for the 1970 census round.
          </p>
          <div className="mb-4 flex flex-wrap items-end gap-4 rounded-lg border border-line-grid bg-surface p-4">
            <div>
              <label htmlFor="age-geo" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                Geography
              </label>
              <select
                id="age-geo"
                value={ageGeo}
                onChange={(e) => setAgeGeo(e.target.value)}
                className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
              >
                <option value="__all__">All Malaysia (aggregated)</option>
                {stateOptionsForAge.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="age-year" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                Census year
              </label>
              <select
                id="age-year"
                value={effectiveAgeYear ?? ""}
                onChange={(e) => setAgeYear(Number(e.target.value))}
                className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
              >
                {censusYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {ageBreakdown && !ageBreakdown.unavailable ? (
            <div className="rounded-lg border border-line-grid bg-surface p-4">
              <h3 className="mb-2 text-sm font-medium text-ink-primary">
                Age group shares — {ageGeo === "__all__" ? "All Malaysia" : ageGeo}, {effectiveAgeYear}
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={ageBreakdown.data} margin={{ top: 8, right: 24, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke="#e1e0d9" vertical={false} />
                  <XAxis dataKey="group" stroke="#898781" tick={{ fontSize: 12, fill: "#52514e" }} tickLine={false} />
                  <YAxis
                    stroke="#898781"
                    tick={{ fontSize: 12, fill: "#52514e" }}
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    unit="%"
                  />
                  <Tooltip
                    formatter={(v, name) => [name === "Share" ? `${Number(v).toFixed(1)}%` : Number(v).toLocaleString(), name]}
                    contentStyle={{ fontSize: 12, border: "1px solid #e1e0d9", borderRadius: 6 }}
                  />
                  <Bar dataKey="Share" name="Share of population (%)" fill={SERIES_COLORS[2]} radius={[4, 4, 0, 0]} maxBarSize={80} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : ageBreakdown?.unavailable ? (
            <InsufficientData reason="Age breakdown was not published for this census round (typically the 1970 round)." />
          ) : (
            <InsufficientData reason="No age data available for this selection." />
          )}
          <SourceNote sourceKey="census" year={effectiveAgeYear ?? undefined} extra="Aggregated from district-level census rows" />
        </section>

        {/* Ethnicity composition — strictly standalone */}
        <section aria-labelledby="pop-ethnicity">
          <h2 id="pop-ethnicity" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Ethnicity composition (census)
          </h2>
          <div className="mb-3 rounded-lg border border-line-axis bg-plane p-3 text-xs text-ink-secondary">
            <strong className="text-ink-primary">Population composition shown for demographic context only.</strong> This
            dashboard does not present ethnicity-disaggregated health or socioeconomic outcomes, as no such data is
            available in the public sources used here. The chart and figures below show population share by ethnicity
            for the selected geography as a standalone demographic fact — they are never cross-tabulated with health,
            mortality or poverty figures anywhere on this dashboard.
          </div>
          <div className="mb-4 flex flex-wrap items-end gap-4 rounded-lg border border-line-grid bg-surface p-4">
            <div>
              <label htmlFor="eth-level" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                Level
              </label>
              <select
                id="eth-level"
                value={ethnicityLevel}
                onChange={(e) => setEthnicityLevel(e.target.value as "state" | "district")}
                className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
              >
                <option value="state">State</option>
                <option value="district">District</option>
              </select>
            </div>
            {ethnicityLevel === "state" ? (
              <div>
                <label htmlFor="eth-state" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                  State
                </label>
                <select
                  id="eth-state"
                  value={ethnicityState}
                  onChange={(e) => setEthnicityState(e.target.value)}
                  className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
                >
                  <option value="__all__">All Malaysia (aggregated)</option>
                  {stateOptionsForAge.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label htmlFor="eth-district" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                  District
                </label>
                <select
                  id="eth-district"
                  value={ethnicityDistrictKey}
                  onChange={(e) => setEthnicityDistrictKey(e.target.value)}
                  className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
                >
                  <option value="">Select a district…</option>
                  {districtOptions.map(({ state, district }) => (
                    <option key={`${state}||${district}`} value={`${state}||${district}`}>
                      {district} ({state})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label htmlFor="eth-year" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                Census year
              </label>
              <select
                id="eth-year"
                value={effectiveEthnicityYear ?? ""}
                onChange={(e) => setEthnicityYear(Number(e.target.value))}
                className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
              >
                {censusYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {ethnicityChart ? (
            <div className="rounded-lg border border-line-grid bg-surface p-4">
              <h3 className="mb-2 text-sm font-medium text-ink-primary">
                Ethnicity share of population — {ethnicityLabel}, {effectiveEthnicityYear}
              </h3>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart
                  data={ethnicityChart.data}
                  layout="vertical"
                  stackOffset="expand"
                  margin={{ top: 8, right: 24, bottom: 4, left: 4 }}
                >
                  <CartesianGrid stroke="#e1e0d9" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v: number) => `${Math.round(v * 100)}%`} stroke="#898781" tick={{ fontSize: 11, fill: "#52514e" }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="group" hide />
                  <Tooltip
                    formatter={(v, name) => [Number(v).toLocaleString(), name]}
                    contentStyle={{ fontSize: 12, border: "1px solid #e1e0d9", borderRadius: 6 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Bumiputera" stackId="eth" fill={SERIES_COLORS[0]} />
                  <Bar dataKey="Chinese" stackId="eth" fill={SERIES_COLORS[1]} />
                  <Bar dataKey="Indian" stackId="eth" fill={SERIES_COLORS[2]} />
                  <Bar dataKey="Other" stackId="eth" fill={SERIES_COLORS[3]} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <div className="rounded border border-line-grid p-2">
                  <dt className="text-xs text-ink-muted">Bumiputera</dt>
                  <dd className="font-medium tabular-nums text-ink-primary">{ethnicityChart.data[0]["Bumiputera (%)"]}%</dd>
                </div>
                <div className="rounded border border-line-grid p-2">
                  <dt className="text-xs text-ink-muted">Chinese</dt>
                  <dd className="font-medium tabular-nums text-ink-primary">{ethnicityChart.data[0]["Chinese (%)"]}%</dd>
                </div>
                <div className="rounded border border-line-grid p-2">
                  <dt className="text-xs text-ink-muted">Indian</dt>
                  <dd className="font-medium tabular-nums text-ink-primary">{ethnicityChart.data[0]["Indian (%)"]}%</dd>
                </div>
                <div className="rounded border border-line-grid p-2">
                  <dt className="text-xs text-ink-muted">Other</dt>
                  <dd className="font-medium tabular-nums text-ink-primary">{ethnicityChart.data[0]["Other (%)"]}%</dd>
                </div>
              </dl>
            </div>
          ) : (
            <InsufficientData reason="Select a district (or a state / All Malaysia) to view its ethnicity composition." />
          )}
          <SourceNote sourceKey="census" year={effectiveEthnicityYear ?? undefined} extra={ethnicityLevel === "state" && ethnicityState === "__all__" ? "Aggregated from district-level census rows" : undefined} />
        </section>

        {/* District ranking */}
        <section aria-labelledby="pop-district-ranking">
          <h2 id="pop-district-ranking" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Most populous districts — {latestCensusYear ?? "…"}
          </h2>
          {districtRanking.length > 0 ? (
            <BarRankingCard
              title={`Top 15 districts by population (${latestCensusYear})`}
              data={districtRanking}
              nameKey="label"
              valueKey="population_total"
              unit="persons"
              color={SERIES_COLORS[0]}
            />
          ) : (
            <InsufficientData reason="No district population data available." />
          )}
          <SourceNote sourceKey="census" year={latestCensusYear ?? undefined} />
        </section>

        {/* Full browsing tables */}
        <section aria-labelledby="pop-state-table">
          <h2 id="pop-state-table" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            State population by year and sex
          </h2>
          {stateTableRows.length > 0 ? (
            <DataTable columns={stateTableColumns} rows={stateTableRows as unknown as Record<string, unknown>[]} />
          ) : (
            <InsufficientData reason="No state population data available." />
          )}
          <SourceNote sourceKey="population" />
        </section>

        <section aria-labelledby="pop-district-table">
          <h2 id="pop-district-table" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            District population, sex, ethnicity and age (census)
          </h2>
          <p className="mb-3 max-w-3xl text-xs text-ink-muted">
            Columns are shown together for browsing convenience only; ethnicity and health/socioeconomic indicators
            are never combined into a single derived statistic anywhere on this dashboard. "—" indicates age data not
            published for that census round.
          </p>
          {districtTableRows.length > 0 ? (
            <DataTable columns={districtTableColumns} rows={districtTableRows as unknown as Record<string, unknown>[]} />
          ) : (
            <InsufficientData reason="No district census data available." />
          )}
          <SourceNote sourceKey="census" />
        </section>
      </div>
    </div>
  );
}
