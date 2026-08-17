import { useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import StatTile from "../components/StatTile";
import KPISummarySection from "../components/KPISummarySection";
import SourceNote from "../components/SourceNote";
import LineChartCard from "../components/LineChartCard";
import BarRankingCard from "../components/BarRankingCard";
import DataTable, { type Column } from "../components/DataTable";
import InsufficientData from "../components/InsufficientData";
import EquityInsightCard, { buildEquityInsight } from "../components/EquityInsightCard";
import MetadataPanel from "../components/MetadataPanel";
import { useData } from "../lib/useData";
import type { Row } from "../lib/equity";
import { INVENTORY_MAP } from "../lib/inventoryMap";

interface NationalRow {
  year: number;
  beds_total: number | null;
  beds_moh: number | null;
  beds_non_moh: number | null;
  beds_special_institution: number | null;
  staff_all: number | null;
  staff_doctor: number | null;
  staff_dentist: number | null;
  staff_nurse: number | null;
}

interface StateRow {
  state: string;
  year: number;
  staff_all: number | null;
  staff_doctor: number | null;
  staff_dentist: number | null;
  staff_nurse: number | null;
  staff_nurse_community: number | null;
  population_used_for_rate: number | null;
  staff_per_100k: number | null;
  hospital_beds: number | null;
  beds_per_100k: number | null;
  [key: string]: unknown;
}

interface DistrictRow {
  state: string;
  district: string | null;
  year: number;
  hospital_beds: number | null;
  note: string;
  [key: string]: unknown;
}

interface PopStateRow {
  state: string;
  year: number;
  sex: string;
  population_thousands: number;
}

function fmtInt(v: number | null | undefined): string {
  return v === null || v === undefined ? "No data" : v.toLocaleString();
}

function fmtRate(v: number | null | undefined): string {
  return v === null || v === undefined ? "No data" : v.toFixed(1);
}

export default function HealthcareAccess() {
  const { data: national } = useData<NationalRow[]>("healthcare_access_national.json");
  const { data: stateData } = useData<StateRow[]>("healthcare_access_state.json");
  const { data: districtData } = useData<DistrictRow[]>("healthcare_access_district_2022.json");
  const { data: popState } = useData<PopStateRow[]>("population_state.json");

  const latestNational = useMemo(() => {
    if (!national) return null;
    return [...national].sort((a, b) => b.year - a.year)[0];
  }, [national]);

  // National per-100,000 rate: only computed for a year where both a beds
  // total AND a matching-year state population sum exist. We deliberately
  // do not fabricate this for years without a real population denominator.
  const nationalRate = useMemo(() => {
    if (!national || !popState) return null;
    const popYears = new Set(popState.filter((p) => p.sex === "overall").map((p) => p.year));
    const candidateYears = national
      .filter((r) => r.beds_total !== null && popYears.has(r.year))
      .map((r) => r.year)
      .sort((a, b) => b - a);
    const year = candidateYears[0];
    if (year === undefined) return null;
    const nRow = national.find((r) => r.year === year)!;
    const popThousands = popState
      .filter((p) => p.year === year && p.sex === "overall")
      .reduce((acc, p) => acc + p.population_thousands, 0);
    const population = Math.round(popThousands * 1000);
    const bedsTotal = nRow.beds_total as number;
    const rate = (bedsTotal / population) * 100000;
    return { year, bedsTotal, population, rate };
  }, [national, popState]);

  const stateYears = useMemo(() => {
    if (!stateData) return [];
    return Array.from(new Set(stateData.map((r) => r.year))).sort((a, b) => b - a);
  }, [stateData]);
  const [stateYear, setStateYear] = useState<number | null>(null);
  const effectiveStateYear = stateYear ?? stateYears[0] ?? null;

  const stateSnapshot = useMemo(() => {
    if (!stateData || effectiveStateYear === null) return [];
    return stateData.filter((r) => r.year === effectiveStateYear);
  }, [stateData, effectiveStateYear]);

  const staffRateAvailable = stateSnapshot.some((r) => r.staff_per_100k !== null);
  const bedsRateAvailable = stateSnapshot.some((r) => r.beds_per_100k !== null);

  const districtRows = useMemo(() => {
    if (!districtData) return [];
    return districtData.filter((r) => r.district !== null);
  }, [districtData]);

  const districtMalaysiaAggregate = useMemo(() => {
    if (!districtData) return null;
    return districtData.find((r) => r.state === "Malaysia" && r.district === null) ?? null;
  }, [districtData]);

  const districtRanking = useMemo(() => {
    const withBeds = districtRows.filter((r) => r.hospital_beds !== null);
    const sorted = [...withBeds].sort((a, b) => (b.hospital_beds as number) - (a.hospital_beds as number));
    const top = sorted.slice(0, 15);
    const bottom = sorted.slice(-15).reverse();
    return { top, bottom };
  }, [districtRows]);

  const districtNote =
    districtRows[0]?.note ??
    districtMalaysiaAggregate?.note ??
    "No 2022 district-level population denominator is available in this pipeline, so a beds-per-100,000 rate is not computed at district level.";

  const stateColumns: Column[] = [
    { key: "state", label: "State" },
    { key: "staff_all", label: "Total staff", numeric: true },
    { key: "staff_doctor", label: "Doctors", numeric: true },
    { key: "staff_dentist", label: "Dentists", numeric: true },
    { key: "staff_nurse", label: "Nurses", numeric: true },
    { key: "staff_nurse_community", label: "Community nurses", numeric: true },
    { key: "population_used_for_rate", label: "Population (rate denominator)", numeric: true },
    { key: "staff_per_100k", label: "Staff per 100,000", numeric: true },
    { key: "hospital_beds", label: "Hospital beds", numeric: true },
    { key: "beds_per_100k", label: "Beds per 100,000", numeric: true },
  ];

  const districtColumns: Column[] = [
    { key: "state", label: "State" },
    { key: "district", label: "District" },
    { key: "hospital_beds", label: "Hospital beds (2022)", numeric: true },
  ];

  return (
    <div>
      <PageHeader
        title="Healthcare Access"
        subtitle="Hospitals, hospital beds and healthcare workforce (doctors, dentists, nurses, community nurses) across Malaysia, shown per 100,000 population wherever a matching-year population denominator exists, and as absolute counts otherwise."
      />

      <div className="space-y-8 p-6 lg:p-10">
        <MetadataPanel
          datasetIds={Array.from(
            new Set([
              ...INVENTORY_MAP["healthcare_access_national.json"],
              ...INVENTORY_MAP["healthcare_access_district_2022.json"],
              ...INVENTORY_MAP["population_state.json"],
            ])
          )}
        />
        {/* National KPI tiles */}
        <section>
          <KPISummarySection
            title={`National snapshot${latestNational ? ` — ${latestNational.year}` : ""}`}
            headingId="national-snapshot"
            columns={5}
            items={[
              {
                label: "Total hospital beds",
                value: fmtInt(latestNational?.beds_total),
                sublabel: latestNational ? `${latestNational.year}, MOH + non-MOH + special institution` : undefined,
              },
              {
                label: "Total healthcare staff",
                value: fmtInt(latestNational?.staff_all),
                sublabel: latestNational ? `${latestNational.year}` : undefined,
              },
              {
                label: "Doctors",
                value: fmtInt(latestNational?.staff_doctor),
                sublabel: latestNational ? `${latestNational.year}` : undefined,
              },
              {
                label: "Dentists",
                value: fmtInt(latestNational?.staff_dentist),
                sublabel: latestNational ? `${latestNational.year}` : undefined,
              },
              {
                label: "Nurses",
                value: fmtInt(latestNational?.staff_nurse),
                sublabel: latestNational ? `${latestNational.year}` : undefined,
              },
            ]}
          />
          <SourceNote sourceKey="hospital_beds" year={latestNational?.year} />

          {/* National per-100k rate, with numerator/denominator shown explicitly */}
          <div className="mt-4 rounded-lg border border-line-grid bg-plane p-4">
            <h3 className="text-sm font-medium text-ink-primary">National hospital beds per 100,000 population</h3>
            {nationalRate ? (
              <>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-ink-primary">
                  {fmtRate(nationalRate.rate)} <span className="text-sm font-normal text-ink-secondary">per 100,000</span>
                </p>
                <p className="mt-2 text-xs leading-relaxed text-ink-secondary">
                  Calculation: {nationalRate.bedsTotal.toLocaleString()} beds ÷{" "}
                  {nationalRate.population.toLocaleString()} population × 100,000 = {fmtRate(nationalRate.rate)} per
                  100,000. Numerator: total hospital beds, Ministry of Health Malaysia, {nationalRate.year}.
                  Denominator: sum of DOSM state population estimates ("overall" sex) for {nationalRate.year}, from{" "}
                  <code>population_state.json</code>. This national rate is not published directly by the source
                  agency and is computed here client-side only for a year where both figures share the same year.
                </p>
              </>
            ) : (
              <InsufficientData reason="No year exists with both a national hospital-beds total and a matching-year national population estimate." />
            )}
          </div>
        </section>

        {/* National trends */}
        <section aria-labelledby="national-trend">
          <h2 id="national-trend" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            National trend
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {national && (
              <LineChartCard
                title="Hospital beds by type"
                data={national.map((r) => ({
                  year: r.year,
                  "MOH beds": r.beds_moh,
                  "Non-MOH beds": r.beds_non_moh,
                  "Special institution beds": r.beds_special_institution,
                }))}
                xKey="year"
                series={[
                  { key: "MOH beds", label: "MOH beds", color: "#3a7173" },
                  { key: "Non-MOH beds", label: "Non-MOH beds", color: "#eb6834" },
                  { key: "Special institution beds", label: "Special institution beds", color: "#1baf7a" },
                ]}
              />
            )}
            {national && (
              <LineChartCard
                title="Healthcare workforce by type"
                data={national.map((r) => ({
                  year: r.year,
                  Doctors: r.staff_doctor,
                  Dentists: r.staff_dentist,
                  Nurses: r.staff_nurse,
                }))}
                xKey="year"
                series={[
                  { key: "Doctors", label: "Doctors", color: "#3a7173" },
                  { key: "Dentists", label: "Dentists", color: "#eb6834" },
                  { key: "Nurses", label: "Nurses", color: "#1baf7a" },
                ]}
              />
            )}
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            No bed-type breakdown is available for 2014 in the source data (beds series begins 2015); staff figures
            are available from 2014. Missing points are shown as gaps, not zero.
          </p>
          <SourceNote sourceKey="healthcare_staff" />
        </section>

        {/* State-level section */}
        <section aria-labelledby="state-comparison">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <h2 id="state-comparison" className="text-sm font-semibold uppercase tracking-wide text-ink-secondary">
              State comparison
            </h2>
            {stateYears.length > 0 && (
              <div>
                <label htmlFor="state-year-select" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                  Year
                </label>
                <select
                  id="state-year-select"
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
            )}
          </div>

          <EquityInsightCard
            insight={buildEquityInsight({
              rows: stateData as unknown as Row[] | null,
              year: effectiveStateYear,
              valueField: "staff_per_100k",
              metricLabel: "healthcare staff per 100,000 population",
              unit: "per 100k",
              higherIsWorse: false,
            })}
            reason={`Fewer than two states report a staff-per-100,000 rate for ${effectiveStateYear ?? "the selected year"}.`}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            {staffRateAvailable ? (
              <BarRankingCard
                title={`Healthcare staff per 100,000 population by state — ${effectiveStateYear}`}
                data={stateSnapshot.filter((r) => r.staff_per_100k !== null)}
                nameKey="state"
                valueKey="staff_per_100k"
                unit="per 100k"
                color="#3a7173"
              />
            ) : (
              <div>
                <h3 className="mb-2 text-sm font-medium text-ink-primary">
                  Healthcare staff per 100,000 population by state — {effectiveStateYear}
                </h3>
                <InsufficientData reason={`A staff-per-100,000 rate can only be computed for years with a matching state population estimate (2020–2022). No population estimate exists for ${effectiveStateYear}, so absolute staff counts are shown in the table below instead of a fabricated rate.`} />
              </div>
            )}

            {bedsRateAvailable ? (
              <BarRankingCard
                title={`Hospital beds per 100,000 population by state — ${effectiveStateYear}`}
                data={stateSnapshot.filter((r) => r.beds_per_100k !== null)}
                nameKey="state"
                valueKey="beds_per_100k"
                unit="per 100k"
                color="#eb6834"
              />
            ) : (
              <div>
                <h3 className="mb-2 text-sm font-medium text-ink-primary">
                  Hospital beds per 100,000 population by state — {effectiveStateYear}
                </h3>
                <InsufficientData reason="State-level hospital bed counts only exist as a 2022 snapshot in the source pipeline — no other year has a state-level beds figure, so no rate or count can be shown here for this year. Select 2022 to see bed data." />
              </div>
            )}
          </div>

          <div className="mt-4 rounded-lg border border-line-grid bg-plane p-4 text-xs leading-relaxed text-ink-secondary">
            <p>
              <span className="font-medium text-ink-primary">Rate formula (staff):</span> staff_all ÷
              population_used_for_rate × 100,000. Numerator: total healthcare staff (MOH), Ministry of Health
              Malaysia. Denominator: DOSM state population estimate for the exact same state and year (shown per-row
              in the table below as "Population (rate denominator)"). Staff rates exist only for 2020–2022, the
              years for which a matching state population estimate is available.
            </p>
            <p className="mt-2">
              <span className="font-medium text-ink-primary">Rate formula (beds):</span> hospital_beds ÷
              population_used_for_rate × 100,000, using the same 2022 population denominator. Bed counts by state
              exist only for 2022 in the source data — there is no time series of state-level bed counts.
            </p>
          </div>

          <div className="mt-4">
            <h3 className="mb-2 text-sm font-medium text-ink-primary">
              Full state detail — {effectiveStateYear}
            </h3>
            <DataTable columns={stateColumns} rows={stateSnapshot} pageSize={16} />
          </div>
          <SourceNote sourceKey="healthcare_staff" year={effectiveStateYear ?? undefined} extra="Population denominator: DOSM state population estimates" />
        </section>

        {/* District-level section */}
        <section aria-labelledby="district-comparison">
          <h2 id="district-comparison" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            District comparison — 2022 only
          </h2>
          <p className="mb-3 max-w-3xl text-sm text-ink-secondary">
            Hospital bed counts at district resolution exist only for 2022 as a single snapshot — there is no
            district-level time series in the source data. {districtNote}
          </p>

          {districtMalaysiaAggregate && (
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatTile
                label="Malaysia total (all districts)"
                value={fmtInt(districtMalaysiaAggregate.hospital_beds)}
                unit="beds"
                sublabel="2022, national aggregate row"
              />
            </div>
          )}

          {districtRanking.top.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <BarRankingCard
                title="Top 15 districts by hospital beds (absolute count) — 2022"
                data={districtRanking.top}
                nameKey="district"
                valueKey="hospital_beds"
                unit="beds"
                color="#1baf7a"
              />
              <BarRankingCard
                title="Bottom 15 districts by hospital beds (absolute count) — 2022"
                data={districtRanking.bottom}
                nameKey="district"
                valueKey="hospital_beds"
                unit="beds"
                color="#eda100"
              />
            </div>
          ) : (
            <InsufficientData reason="No district-level hospital bed data available." />
          )}

          <div className="mt-4">
            <h3 className="mb-2 text-sm font-medium text-ink-primary">All districts — 2022</h3>
            <DataTable columns={districtColumns} rows={districtRows} pageSize={20} />
          </div>
          <SourceNote sourceKey="hospital_beds" year={2022} extra="Absolute counts only; no district-level rate is computed" />
        </section>
      </div>
    </div>
  );
}
