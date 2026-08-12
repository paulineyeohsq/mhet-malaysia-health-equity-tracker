import { useMemo } from "react";
import PageHeader from "../components/PageHeader";
import StatTile from "../components/StatTile";
import SourceNote from "../components/SourceNote";
import LineChartCard from "../components/LineChartCard";
import BarRankingCard from "../components/BarRankingCard";
import { useData } from "../lib/useData";

interface NationalRow {
  year: number;
  income_mean: number | null;
  income_median: number | null;
  poverty_absolute: number | null;
  poverty_relative: number | null;
  gini: number | null;
}
interface StateRow {
  state: string;
  year: number;
  income_median: number | null;
  poverty_absolute: number | null;
  gini: number | null;
}
interface HealthcareNational {
  year: number;
  beds_total: number | null;
  staff_all: number | null;
}
interface PopState {
  state: string;
  year: number;
  sex: string;
  population_thousands: number;
}

export default function Overview() {
  const { data: national } = useData<NationalRow[]>("socioeconomic_national.json");
  const { data: stateData } = useData<StateRow[]>("socioeconomic_state.json");
  const { data: hcNational } = useData<HealthcareNational[]>("healthcare_access_national.json");
  const { data: popState } = useData<PopState[]>("population_state.json");

  const latestNational = useMemo(() => {
    if (!national) return null;
    return [...national].sort((a, b) => b.year - a.year)[0];
  }, [national]);

  const latestHc = useMemo(() => {
    if (!hcNational) return null;
    return [...hcNational].sort((a, b) => b.year - a.year)[0];
  }, [hcNational]);

  const totalPopulation = useMemo(() => {
    if (!popState) return null;
    const latestYear = Math.max(...popState.map((p) => p.year));
    const sum = popState
      .filter((p) => p.year === latestYear && p.sex === "overall")
      .reduce((acc, p) => acc + p.population_thousands, 0);
    return { year: latestYear, thousands: sum };
  }, [popState]);

  const latestStateYear = useMemo(() => {
    if (!stateData) return null;
    return Math.max(...stateData.map((r) => r.year));
  }, [stateData]);

  const stateSnapshot = useMemo(() => {
    if (!stateData || !latestStateYear) return [];
    return stateData.filter((r) => r.year === latestStateYear);
  }, [stateData, latestStateYear]);

  const povertyRange = useMemo(() => {
    const vals = stateSnapshot.map((r) => r.poverty_absolute).filter((v): v is number => v !== null);
    if (!vals.length) return null;
    return { min: Math.min(...vals), max: Math.max(...vals) };
  }, [stateSnapshot]);

  return (
    <div>
      <PageHeader
        title="Malaysia Health Equity Tracker"
        subtitle="Exploring health inequalities, socioeconomic vulnerability and healthcare access across Malaysia"
      />

      <div className="space-y-8 p-6 lg:p-10">
        {/* Key indicators */}
        <section aria-labelledby="key-indicators">
          <h2 id="key-indicators" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            National snapshot
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <StatTile
              label="Population"
              value={totalPopulation ? (totalPopulation.thousands / 1000).toFixed(1) : "—"}
              unit="million"
              sublabel={totalPopulation ? `${totalPopulation.year}, sum of state estimates` : undefined}
            />
            <StatTile
              label="Median household income"
              value={latestNational?.income_median ? `RM ${latestNational.income_median.toLocaleString()}` : "—"}
              sublabel={latestNational ? `${latestNational.year}` : undefined}
            />
            <StatTile
              label="Absolute poverty rate"
              value={latestNational?.poverty_absolute !== null && latestNational?.poverty_absolute !== undefined ? `${latestNational.poverty_absolute}%` : "—"}
              sublabel={latestNational ? `${latestNational.year}` : undefined}
            />
            <StatTile
              label="Gini coefficient"
              value={latestNational?.gini?.toFixed(3) ?? "—"}
              sublabel={latestNational ? `${latestNational.year}, income basis` : undefined}
            />
            <StatTile
              label="Public hospital beds"
              value={latestHc?.beds_total ? latestHc.beds_total.toLocaleString() : "—"}
              sublabel={latestHc ? `${latestHc.year}, MOH + non-MOH` : undefined}
            />
          </div>
        </section>

        {/* National trend */}
        <section aria-labelledby="national-trend">
          <h2 id="national-trend" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            National trend
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {national && (
              <LineChartCard
                title="Median household income (RM/month)"
                data={national.map((r) => ({ year: r.year, "Median income": r.income_median }))}
                xKey="year"
                series={[{ key: "Median income", label: "Median income (RM)", color: "#2a78d6" }]}
              />
            )}
            {national && (
              <LineChartCard
                title="Poverty rate & Gini coefficient"
                data={national.map((r) => ({
                  year: r.year,
                  "Absolute poverty (%)": r.poverty_absolute,
                  "Gini ×100": r.gini !== null ? Math.round(r.gini * 1000) / 10 : null,
                }))}
                xKey="year"
                series={[
                  { key: "Absolute poverty (%)", label: "Absolute poverty (%)", color: "#eb6834" },
                  { key: "Gini ×100", label: "Gini × 100", color: "#4a3aa7" },
                ]}
              />
            )}
          </div>
          <SourceNote sourceKey="income" year={latestNational?.year} />
        </section>

        {/* State comparison */}
        <section aria-labelledby="state-comparison">
          <h2 id="state-comparison" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            State comparison — {latestStateYear ?? "…"}
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            <BarRankingCard
              title="Absolute poverty rate by state (%)"
              data={stateSnapshot.filter((r) => r.poverty_absolute !== null)}
              nameKey="state"
              valueKey="poverty_absolute"
              unit="%"
              color="#eb6834"
              highlightWorst
            />
            <BarRankingCard
              title="Median household income by state (RM)"
              data={stateSnapshot.filter((r) => r.income_median !== null)}
              nameKey="state"
              valueKey="income_median"
              unit="RM"
              color="#2a78d6"
            />
          </div>
          <SourceNote sourceKey="poverty" year={latestStateYear ?? undefined} />
        </section>

        {/* Key findings */}
        <section aria-labelledby="key-findings">
          <h2 id="key-findings" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Key findings
          </h2>
          <ul className="list-disc space-y-2 pl-5 text-sm text-ink-secondary marker:text-series-1">
            <li>
              National absolute poverty fell from {national?.[0]?.poverty_absolute ?? "—"}% in {national?.[0]?.year ?? "—"} to{" "}
              {latestNational?.poverty_absolute ?? "—"}% in {latestNational?.year ?? "—"}, but the state range in{" "}
              {latestStateYear ?? "—"} still spans{" "}
              {povertyRange ? `${povertyRange.min}% to ${povertyRange.max}%` : "—"} — a persistent geographic gap that the
              national average obscures.
            </li>
            <li>
              Income and poverty figures are drawn directly from DOSM's Household Income and Expenditure Survey; see the{" "}
              <a href="#/socioeconomic" className="text-series-1 underline underline-offset-2">
                Socioeconomic Inequality
              </a>{" "}
              page for district-level detail and correlation with health indicators.
            </li>
            <li>
              This overview intentionally does not present a single composite "equity score" — see{" "}
              <a href="#/analytics" className="text-series-1 underline underline-offset-2">
                Inequality Analytics
              </a>{" "}
              for why, and what is measured instead.
            </li>
          </ul>
        </section>

        {/* Data coverage */}
        <section aria-labelledby="data-coverage">
          <h2 id="data-coverage" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Data coverage
          </h2>
          <p className="max-w-3xl text-sm text-ink-secondary">
            This dashboard integrates {" "}
            <a href="#/explorer" className="text-series-1 underline underline-offset-2">24 datasets</a> from data.gov.my,
            DOSM and the Ministry of Health, spanning population, income, poverty, inequality, basic amenities,
            healthcare workforce and infrastructure, and mortality/morbidity outcomes. Geographic resolution ranges from
            national to state to district depending on the indicator — the Health Equity Map and Data Explorer clearly
            label which resolution each indicator supports. See the{" "}
            <a href="#/methodology" className="text-series-1 underline underline-offset-2">Methodology</a> page for full
            provenance, limitations and update cadence.
          </p>
        </section>
      </div>
    </div>
  );
}
