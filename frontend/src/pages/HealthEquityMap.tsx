import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import PageHeader from "../components/PageHeader";
import ChoroplethMap, { type ChoroplethDatum, type TierConfig } from "../components/ChoroplethMap";
import SourceNote from "../components/SourceNote";
import InsufficientData from "../components/InsufficientData";
import EquityInsightCard, { buildEquityInsight } from "../components/EquityInsightCard";
import { useData } from "../lib/useData";
import type { SOURCES } from "../lib/sources";
import { computeTerciles, computeAverage, fmt } from "../lib/equity";
import { isSmallCount, SMALL_COUNT_CAUTION_TEXT } from "../lib/reliability";

type Geography = "state" | "district";

interface IndicatorDef {
  id: string;
  label: string;
  sourceKey: keyof typeof SOURCES;
  unit: string;
  file: string;
  valueField: string;
  geographies: Geography[];
  higherIsWorse: boolean;
  /** Row key holding the underlying event count, if this rate is built on one — used for the small-count caution flag. */
  absField?: string;
  /** For data files with more than one row per state+year (e.g. fertility_state.json's per-age-band rows) — keeps only rows matching this field/value pair before any year filtering. */
  filterField?: string;
  filterValue?: string;
}

const INDICATORS: IndicatorDef[] = [
  { id: "poverty", label: "Absolute poverty rate", sourceKey: "poverty", unit: "%", file: "socioeconomic_state.json", valueField: "poverty_absolute", geographies: ["state", "district"], higherIsWorse: true },
  { id: "income", label: "Median household income", sourceKey: "income", unit: "RM", file: "socioeconomic_state.json", valueField: "income_median", geographies: ["state", "district"], higherIsWorse: false },
  { id: "gini", label: "Gini coefficient", sourceKey: "gini", unit: "", file: "socioeconomic_state.json", valueField: "gini", geographies: ["state", "district"], higherIsWorse: true },
  { id: "hospital_beds", label: "Hospital beds (absolute)", sourceKey: "hospital_beds", unit: "beds", file: "healthcare_access_state.json", valueField: "hospital_beds", geographies: ["state", "district"], higherIsWorse: false },
  { id: "beds_per_100k", label: "Hospital beds per 100,000", sourceKey: "hospital_beds", unit: "per 100k", file: "healthcare_access_state.json", valueField: "beds_per_100k", geographies: ["state"], higherIsWorse: false },
  { id: "staff_per_100k", label: "Healthcare staff per 100,000", sourceKey: "healthcare_staff", unit: "per 100k", file: "healthcare_access_state.json", valueField: "staff_per_100k", geographies: ["state"], higherIsWorse: false },
  { id: "crude_death_rate", label: "Crude death rate", sourceKey: "deaths", unit: "per 1,000", file: "health_outcomes_state.json", valueField: "crude_death_rate_per_1000", geographies: ["state"], higherIsWorse: true, absField: "deaths_abs" },
  { id: "maternal_mortality", label: "Maternal mortality rate", sourceKey: "maternal_deaths", unit: "per 100k births", file: "health_outcomes_state.json", valueField: "maternal_mortality_rate_per_100k_births", geographies: ["state"], higherIsWorse: true, absField: "maternal_deaths_abs" },
  { id: "infant_mortality", label: "Infant mortality rate", sourceKey: "early_childhood_deaths", unit: "per 1,000 births", file: "health_outcomes_state.json", valueField: "infant_mortality_rate", geographies: ["state"], higherIsWorse: true, absField: "infant_deaths_abs" },
  { id: "sanitation", label: "Sanitation access", sourceKey: "amenities", unit: "%", file: "socioeconomic_district.json", valueField: "sanitation_pct", geographies: ["district"], higherIsWorse: false },
  { id: "piped_water", label: "Piped water access", sourceKey: "amenities", unit: "%", file: "socioeconomic_district.json", valueField: "piped_water_pct", geographies: ["district"], higherIsWorse: false },
  { id: "diabetes", label: "Known diabetes prevalence (NHMS)", sourceKey: "nhms_ncd", unit: "%", file: "nhms_ncd_state.json", valueField: "known_diabetes_prevalence_pct", geographies: ["state"], higherIsWorse: true, absField: "known_diabetes_n" },
  { id: "hypertension", label: "Known hypertension prevalence (NHMS)", sourceKey: "nhms_ncd", unit: "%", file: "nhms_ncd_state.json", valueField: "known_hypertension_prevalence_pct", geographies: ["state"], higherIsWorse: true, absField: "known_hypertension_n" },
  { id: "under5_mortality", label: "Under-5 mortality rate", sourceKey: "early_childhood_deaths", unit: "per 1,000 live births", file: "health_outcomes_state.json", valueField: "under5_mortality_rate", geographies: ["state"], higherIsWorse: true, absField: "under5_deaths_abs" },
  { id: "covid_cases", label: "COVID-19 cases (annual)", sourceKey: "covid", unit: "cases", file: "covid_state.json", valueField: "covid_cases_abs", geographies: ["state"], higherIsWorse: true },
  { id: "financing_programmes", label: "PeKa B40 screenings (annual)", sourceKey: "health_programmes", unit: "screenings", file: "health_programmes_state.json", valueField: "pekab40_screenings_abs", geographies: ["state"], higherIsWorse: false },
  { id: "fertility_tfr", label: "Total fertility rate", sourceKey: "fertility", unit: "births/woman", file: "fertility_state.json", valueField: "fertility_rate", geographies: ["state"], higherIsWorse: false, filterField: "age_group", filterValue: "tfr" },
  { id: "asfr_15_19", label: "Fertility rate, age 15-19 (ASFR)", sourceKey: "fertility", unit: "per 1,000 women", file: "fertility_state.json", valueField: "fertility_rate", geographies: ["state"], higherIsWorse: false, filterField: "age_group", filterValue: "15-19" },
  { id: "asfr_20_24", label: "Fertility rate, age 20-24 (ASFR)", sourceKey: "fertility", unit: "per 1,000 women", file: "fertility_state.json", valueField: "fertility_rate", geographies: ["state"], higherIsWorse: false, filterField: "age_group", filterValue: "20-24" },
  { id: "asfr_25_29", label: "Fertility rate, age 25-29 (ASFR)", sourceKey: "fertility", unit: "per 1,000 women", file: "fertility_state.json", valueField: "fertility_rate", geographies: ["state"], higherIsWorse: false, filterField: "age_group", filterValue: "25-29" },
  { id: "asfr_30_34", label: "Fertility rate, age 30-34 (ASFR)", sourceKey: "fertility", unit: "per 1,000 women", file: "fertility_state.json", valueField: "fertility_rate", geographies: ["state"], higherIsWorse: false, filterField: "age_group", filterValue: "30-34" },
  { id: "asfr_35_39", label: "Fertility rate, age 35-39 (ASFR)", sourceKey: "fertility", unit: "per 1,000 women", file: "fertility_state.json", valueField: "fertility_rate", geographies: ["state"], higherIsWorse: false, filterField: "age_group", filterValue: "35-39" },
  { id: "asfr_40_44", label: "Fertility rate, age 40-44 (ASFR)", sourceKey: "fertility", unit: "per 1,000 women", file: "fertility_state.json", valueField: "fertility_rate", geographies: ["state"], higherIsWorse: false, filterField: "age_group", filterValue: "40-44" },
  { id: "asfr_45_49", label: "Fertility rate, age 45-49 (ASFR)", sourceKey: "fertility", unit: "per 1,000 women", file: "fertility_state.json", valueField: "fertility_rate", geographies: ["state"], higherIsWorse: false, filterField: "age_group", filterValue: "45-49" },
  { id: "district_death_rate", label: "Death rate (district)", sourceKey: "deaths_district", unit: "per 1,000", file: "deaths_district_sex.json", valueField: "death_rate_per_1000", geographies: ["district"], higherIsWorse: true, absField: "deaths_abs", filterField: "sex", filterValue: "both" },
  { id: "district_birth_rate", label: "Birth rate (district)", sourceKey: "births_district", unit: "per 1,000", file: "births_district_sex.json", valueField: "birth_rate_per_1000", geographies: ["district"], higherIsWorse: false, absField: "births_abs", filterField: "sex", filterValue: "both" },
];

export default function HealthEquityMap() {
  const [geography, setGeography] = useState<Geography>("state");
  const [indicatorId, setIndicatorId] = useState("poverty");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [showTiers, setShowTiers] = useState(false);

  // Ask MHET: pre-apply a filter passed via router location state, once on mount.
  const location = useLocation();
  useEffect(() => {
    const s = location.state as { indicatorId?: string; geography?: Geography } | null;
    if (s?.indicatorId) setIndicatorId(s.indicatorId);
    if (s?.geography) setGeography(s.geography);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const indicator = INDICATORS.find((i) => i.id === indicatorId)!;
  const usesDistrictFile = geography === "district" && indicator.file === "socioeconomic_state.json";
  const dataFile = usesDistrictFile ? "socioeconomic_district.json" : geography === "district" && indicator.file.includes("healthcare") ? "healthcare_access_district_2022.json" : indicator.file;

  const { data: rawRows } = useData<Record<string, unknown>[]>(dataFile);
  const { data: stateGeo } = useData<GeoJSON.FeatureCollection>("geo/state.geojson");
  const { data: districtGeo } = useData<GeoJSON.FeatureCollection>("geo/district.geojson");

  // Some data files (e.g. fertility_state.json) have more than one row per
  // state+year — filterField/filterValue narrows to the row this indicator
  // actually means, before any year filtering downstream.
  const rows = useMemo(() => {
    if (!rawRows || !indicator.filterField) return rawRows;
    return rawRows.filter((r) => r[indicator.filterField!] === indicator.filterValue);
  }, [rawRows, indicator]);

  const availableYears = useMemo(() => {
    if (!rows) return [];
    return Array.from(new Set(rows.map((r) => r.year as number))).sort((a, b) => b - a);
  }, [rows]);
  const [year, setYear] = useState<number | null>(null);
  const effectiveYear = year ?? availableYears[0] ?? null;

  const nameField = geography === "district" ? "district" : "state";
  const valueField = geography === "district" && indicator.file.includes("healthcare") ? "hospital_beds" : indicator.valueField;

  const choroplethData: ChoroplethDatum[] = useMemo(() => {
    if (!rows || effectiveYear === null) return [];
    return rows
      .filter((r) => r.year === effectiveYear)
      .map((r) => ({
        name: String(r[nameField]),
        value: typeof r[valueField] === "number" ? (r[valueField] as number) : null,
      }));
  }, [rows, effectiveYear, nameField, valueField]);

  const povertyTierConfig: TierConfig | undefined = useMemo(() => {
    if (indicatorId !== "poverty" || !showTiers) return undefined;
    const values = choroplethData.map((d) => d.value).filter((v): v is number => v !== null);
    const breaks = computeTerciles(values);
    if (!breaks) return undefined;
    return {
      breaks,
      labels: ["Low poverty tier", "Medium poverty tier", "High poverty tier"],
      colors: ["#cde2fb", "#2a78d6", "#0d366b"],
    };
  }, [indicatorId, showTiers, choroplethData]);

  const selectedRow = useMemo(() => {
    if (!rows || !selectedName || effectiveYear === null) return null;
    return rows.find((r) => r[nameField] === selectedName && r.year === effectiveYear) ?? null;
  }, [rows, selectedName, effectiveYear, nameField]);

  // WHERE: "vs. Malaysia average" / "vs. state average" comparisons for the detail panel.
  const nationalAverage = useMemo(() => computeAverage(rows, effectiveYear, valueField), [rows, effectiveYear, valueField]);
  const parentState = geography === "district" && selectedRow ? (selectedRow.state as string | undefined) : undefined;
  const parentStateAverage = useMemo(() => {
    if (!parentState || !rows) return null;
    return computeAverage(
      rows.filter((r) => r.state === parentState),
      effectiveYear,
      valueField
    );
  }, [parentState, rows, effectiveYear, valueField]);

  const geo = geography === "district" ? districtGeo : stateGeo;
  const indicatorSupportsGeography = indicator.geographies.includes(geography);

  return (
    <div>
      <PageHeader
        title="Health Equity Map"
        subtitle="Select an indicator, year and geography to explore how health and socioeconomic conditions vary across Malaysia."
      />
      <div className="p-6 lg:p-10">
        {/* Filters */}
        <div className="mb-4 flex flex-wrap items-end gap-4 rounded-lg border border-line-grid bg-surface p-4">
          <div>
            <label htmlFor="ind-select" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
              Indicator
            </label>
            <select
              id="ind-select"
              value={indicatorId}
              onChange={(e) => {
                setIndicatorId(e.target.value);
                setSelectedName(null);
                setYear(null);
              }}
              className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
            >
              {INDICATORS.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="geo-select" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
              Geography
            </label>
            <select
              id="geo-select"
              value={geography}
              onChange={(e) => {
                setGeography(e.target.value as Geography);
                setSelectedName(null);
                setYear(null);
              }}
              className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
            >
              <option value="state">State</option>
              <option value="district" disabled={!indicator.geographies.includes("district")}>
                District {!indicator.geographies.includes("district") ? "(not available for this indicator)" : ""}
              </option>
            </select>
          </div>
          {availableYears.length > 0 && (
            <div>
              <label htmlFor="year-select" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                Year
              </label>
              <select
                id="year-select"
                value={effectiveYear ?? ""}
                onChange={(e) => setYear(Number(e.target.value))}
                className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          )}
          {indicatorId === "poverty" && (
            <div>
              <label className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
                <input
                  type="checkbox"
                  checked={showTiers}
                  onChange={(e) => setShowTiers(e.target.checked)}
                  className="h-3.5 w-3.5"
                />
                Poverty tier overlay
              </label>
              {showTiers && (
                <p className="mt-1 max-w-xs text-xs text-ink-muted">
                  Tiers are terciles of the current {geography}s' poverty rates, defined by this dashboard — not an
                  official DOSM classification.
                </p>
              )}
            </div>
          )}
          <p className="ml-auto max-w-xs text-xs text-ink-muted">
            Population subgroup filters (sex / ethnicity / age) are shown only where the underlying dataset supports
            them — see the Population Equity and Health Outcomes pages for subgroup breakdowns.
          </p>
        </div>

        {indicatorSupportsGeography && (
          <EquityInsightCard
            insight={buildEquityInsight({
              rows,
              year: effectiveYear,
              valueField,
              metricLabel: indicator.label,
              unit: indicator.unit,
              higherIsWorse: indicator.higherIsWorse,
              groupField: nameField,
              groupNoun: geography,
            })}
            reason={`Fewer than two ${geography}s report ${indicator.label.toLowerCase()} for ${effectiveYear ?? "the selected year"}.`}
          />
        )}

        {!indicatorSupportsGeography ? (
          <InsufficientData reason={`${indicator.label} is not published at ${geography} resolution by the source agency.`} />
        ) : (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              {geo && rows ? (
                <ChoroplethMap
                  geojson={geo}
                  data={choroplethData}
                  nameProperty={nameField as "state" | "district"}
                  onSelect={setSelectedName}
                  selectedName={selectedName}
                  unitLabel={indicator.unit}
                  tiers={povertyTierConfig}
                />
              ) : (
                <div className="flex h-[480px] items-center justify-center rounded-lg border border-line-grid text-sm text-ink-muted">
                  Loading map…
                </div>
              )}
              <SourceNote sourceKey={indicator.sourceKey} year={effectiveYear ?? undefined} />
              <p className="mt-2 text-xs text-ink-muted">
                {povertyTierConfig
                  ? "Colour scale: 3-tier poverty overlay (see legend above)."
                  : "Colour scale: light → dark blue, low → high value."}{" "}
                Grey areas indicate no data for this indicator/year/geography — this is shown explicitly rather than
                left blank, per this dashboard's data integrity policy.
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                Rank order reflects magnitude of this one indicator only — it is not a statement of which area is
                doing better or worse overall.
              </p>
            </div>

            {/* Detail panel */}
            <div className="rounded-lg border border-line-grid bg-surface p-4">
              <h3 className="text-sm font-semibold text-ink-primary">
                {selectedName ?? "Click a region on the map"}
              </h3>
              {selectedName && selectedRow ? (
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between border-b border-line-grid pb-1">
                    <dt className="text-ink-secondary">{indicator.label}</dt>
                    <dd className="font-medium tabular-nums text-ink-primary">
                      {selectedRow[valueField] !== null && selectedRow[valueField] !== undefined
                        ? `${selectedRow[valueField]} ${indicator.unit}`
                        : "No data"}
                      {indicator.absField && isSmallCount(selectedRow[indicator.absField] as number | null | undefined) && (
                        <span title={SMALL_COUNT_CAUTION_TEXT} aria-label={SMALL_COUNT_CAUTION_TEXT} className="ml-1 cursor-help text-amber-600">
                          ⚠
                        </span>
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between border-b border-line-grid pb-1">
                    <dt className="text-ink-secondary">Year</dt>
                    <dd className="tabular-nums">{effectiveYear}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-secondary">Geography</dt>
                    <dd className="capitalize">{geography}</dd>
                  </div>
                  {typeof selectedRow[valueField] === "number" && nationalAverage && (
                    <div className="flex justify-between border-t border-line-grid pt-2">
                      <dt className="text-ink-secondary">vs. Malaysia average</dt>
                      <dd className="tabular-nums text-ink-primary">
                        {(selectedRow[valueField] as number) - nationalAverage.mean >= 0 ? "+" : ""}
                        {fmt((selectedRow[valueField] as number) - nationalAverage.mean, 1)} {indicator.unit}
                        <span className="ml-1 text-xs text-ink-muted">
                          (avg {fmt(nationalAverage.mean, 1)}, n={nationalAverage.n})
                        </span>
                      </dd>
                    </div>
                  )}
                  {parentState && typeof selectedRow[valueField] === "number" && parentStateAverage && (
                    <div className="flex justify-between">
                      <dt className="text-ink-secondary">vs. {parentState} average</dt>
                      <dd className="tabular-nums text-ink-primary">
                        {(selectedRow[valueField] as number) - parentStateAverage.mean >= 0 ? "+" : ""}
                        {fmt((selectedRow[valueField] as number) - parentStateAverage.mean, 1)} {indicator.unit}
                        <span className="ml-1 text-xs text-ink-muted">
                          (avg {fmt(parentStateAverage.mean, 1)}, n={parentStateAverage.n})
                        </span>
                      </dd>
                    </div>
                  )}
                </dl>
              ) : selectedName ? (
                <InsufficientData reason="No record for this region/year combination." />
              ) : (
                <p className="mt-2 text-sm text-ink-secondary">
                  Click any state{geography === "district" ? " or district" : ""} on the map to see its exact value
                  and full provenance here.
                </p>
              )}
              <p className="mt-4 text-xs text-ink-muted">
                {indicator.higherIsWorse
                  ? "For this indicator, a higher value generally reflects greater disadvantage."
                  : "For this indicator, a lower value generally reflects greater disadvantage."}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
