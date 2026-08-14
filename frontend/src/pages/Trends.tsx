import { useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import LineChartCard, { type Series } from "../components/LineChartCard";
import SourceNote from "../components/SourceNote";
import InsufficientData from "../components/InsufficientData";
import { useData } from "../lib/useData";
import { buildStateTrend, computeAverage, type Row } from "../lib/equity";
import { MALAYSIA_STATES } from "../lib/geoConstants";
import { OUTCOME_FIELDS, DETERMINANT_FIELDS, rowsForField, type FieldDef } from "../lib/determinantFields";

const ALL_FIELDS: FieldDef[] = [...OUTCOME_FIELDS, ...DETERMINANT_FIELDS];

/**
 * Is a state's gap on some indicator widening or narrowing over time? Most
 * DOSM series run 1970-2024, but Determinants Explorer only ever shows one
 * cross-sectional year — this page is the trend-over-time complement,
 * built entirely on existing infrastructure: LineChartCard (table/CSV/PNG
 * export already built in) and equity.ts's buildStateTrend/computeAverage.
 */
export default function Trends() {
  const { data: healthOutcomes } = useData<Row[]>("health_outcomes_state.json");
  const { data: healthcareAccess } = useData<Row[]>("healthcare_access_state.json");
  const { data: socioeconomic } = useData<Row[]>("socioeconomic_state.json");
  const { data: nhmsNcd } = useData<Row[]>("nhms_ncd_state.json");
  const { data: nhmsAdolescentMentalHealth } = useData<Row[]>("nhms_adolescent_mental_health_state.json");
  const { data: sanitation } = useData<Row[]>("sanitation_access_state.json");
  const { data: water } = useData<Row[]>("water_access_state.json");
  const { data: marriages } = useData<Row[]>("marriages_state.json");
  const { data: fertility } = useData<Row[]>("fertility_state.json");
  const { data: healthProgrammes } = useData<Row[]>("health_programmes_state.json");

  const rowsByFile: Record<FieldDef["file"], Row[] | null> = {
    "health_outcomes_state.json": healthOutcomes,
    "healthcare_access_state.json": healthcareAccess,
    "socioeconomic_state.json": socioeconomic,
    "nhms_ncd_state.json": nhmsNcd,
    "nhms_adolescent_mental_health_state.json": nhmsAdolescentMentalHealth,
    "sanitation_access_state.json": sanitation,
    "water_access_state.json": water,
    "marriages_state.json": marriages,
    "fertility_state.json": fertility,
    "health_programmes_state.json": healthProgrammes,
  };

  const [state, setState] = useState(MALAYSIA_STATES[0]);
  const [fieldId, setFieldId] = useState(DETERMINANT_FIELDS[1].id);
  const field = ALL_FIELDS.find((f) => f.id === fieldId)!;

  const rows = rowsForField(rowsByFile[field.file], field);

  const chartData = useMemo(() => {
    const stateTrend = buildStateTrend(rows, state, field.field);
    return stateTrend.map((p) => {
      const avg = computeAverage(rows, p.year, field.field);
      return { year: p.year, [state]: p.value, "Malaysia average": avg?.mean ?? null };
    });
  }, [rows, state, field]);

  const series: Series[] = [
    { key: state, label: state, color: "#2a78d6" },
    { key: "Malaysia average", label: "Malaysia average (that year)", color: "#eb6834" },
  ];

  return (
    <div>
      <PageHeader
        title="Trends"
        subtitle="WHY, over time: is a state's gap on an indicator widening or narrowing? Every real reported year for that state, plotted against the national average for the same year."
      />
      <div className="space-y-6 p-6 lg:p-10">
        <div className="mb-4 flex flex-wrap items-end gap-4 rounded-lg border border-line-grid bg-surface p-4">
          <div>
            <label htmlFor="trend-state" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
              State
            </label>
            <select
              id="trend-state"
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
            >
              {MALAYSIA_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="trend-field" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
              Indicator
            </label>
            <select
              id="trend-field"
              value={fieldId}
              onChange={(e) => setFieldId(e.target.value)}
              className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
            >
              <optgroup label="Health / healthcare-access outcomes">
                {OUTCOME_FIELDS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Socioeconomic / access determinants">
                {DETERMINANT_FIELDS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          <p className="ml-auto max-w-md text-xs text-ink-muted">
            State-level only. Only years {state} actually reports a value are plotted — gaps in the source data are
            never interpolated or filled.
          </p>
        </div>

        {chartData.length === 0 ? (
          <InsufficientData reason={`${state} has no reported values for "${field.label}" in this dataset.`} />
        ) : (
          <>
            <LineChartCard title={`${field.label} (${field.unit}) — ${state} vs. Malaysia average`} data={chartData} xKey="year" series={series} />
            <SourceNote sourceKey={field.sourceKey} extra={`${chartData.length} year(s) with data for ${state}`} />
          </>
        )}
      </div>
    </div>
  );
}
