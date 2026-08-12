import { useMemo } from "react";
import StatTile from "./StatTile";
import SourceNote from "./SourceNote";
import { useData } from "../lib/useData";
import { EAST_MALAYSIA_STATES, PENINSULAR_STATES } from "../lib/geoConstants";
import { computeGroupGapStats, computeGroupMeanGap, fmt, type Row } from "../lib/equity";

/**
 * Four separate, real per-metric equity-gap tiles — deliberately NOT a
 * blended/weighted "equity index" number, per this project's own Methodology
 * (a composite score requires an unjustified weighting scheme). Each tile is
 * computed directly from published DOSM/MOH state-level figures and shows
 * "—" rather than a fabricated value when the underlying comparison isn't
 * computable for the latest year.
 */
export default function EquityGapBanner() {
  const { data: socioRows } = useData<Row[]>("socioeconomic_state.json");
  const { data: staffRows } = useData<Row[]>("healthcare_access_state.json");

  const povertyYear = useMemo(() => {
    if (!socioRows) return null;
    return Math.max(...socioRows.map((r) => r.year as number));
  }, [socioRows]);

  const staffYear = useMemo(() => {
    if (!staffRows) return null;
    const years = staffRows.map((r) => r.year as number).filter((y) => !Number.isNaN(y));
    return years.length ? Math.max(...years) : null;
  }, [staffRows]);

  const regionalPovertyGap = useMemo(
    () =>
      computeGroupMeanGap(
        socioRows,
        povertyYear,
        "poverty_absolute",
        EAST_MALAYSIA_STATES,
        "East Malaysia",
        PENINSULAR_STATES,
        "Peninsular"
      ),
    [socioRows, povertyYear]
  );

  const regionalStaffGap = useMemo(
    () =>
      computeGroupMeanGap(
        staffRows,
        staffYear,
        "staff_per_100k",
        EAST_MALAYSIA_STATES,
        "East Malaysia",
        PENINSULAR_STATES,
        "Peninsular"
      ),
    [staffRows, staffYear]
  );

  const highestPovertyState = useMemo(
    () => computeGroupGapStats(socioRows, povertyYear, "poverty_absolute", true),
    [socioRows, povertyYear]
  );

  const widestStaffRatio = useMemo(
    () => computeGroupGapStats(staffRows, staffYear, "staff_per_100k", false),
    [staffRows, staffYear]
  );

  return (
    <section aria-labelledby="equity-gap-banner">
      <h2 id="equity-gap-banner" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
        Equity gap snapshot
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Regional poverty gap"
          value={regionalPovertyGap ? `${fmt(regionalPovertyGap.diff, 1)} pp` : "—"}
          sublabel={
            regionalPovertyGap
              ? `East Malaysia ${fmt(regionalPovertyGap.meanA, 1)}% vs Peninsular ${fmt(regionalPovertyGap.meanB, 1)}%, ${povertyYear}`
              : "Not enough state data for the latest year"
          }
        />
        <StatTile
          label="Regional healthcare-staff gap"
          value={regionalStaffGap ? `${fmt(regionalStaffGap.diff, 0)} per 100k` : "—"}
          sublabel={
            regionalStaffGap
              ? `East Malaysia ${fmt(regionalStaffGap.meanA, 0)} vs Peninsular ${fmt(regionalStaffGap.meanB, 0)}, ${staffYear}`
              : "Not enough state data for the latest year"
          }
        />
        <StatTile
          label="Highest poverty-rate state"
          value={highestPovertyState ? highestPovertyState.worst.name : "—"}
          sublabel={
            highestPovertyState
              ? `${fmt(highestPovertyState.worst.value, 1)}%, ${povertyYear}`
              : "Not enough state data for the latest year"
          }
        />
        <StatTile
          label="Widest healthcare-staff ratio"
          value={widestStaffRatio?.ratio !== null && widestStaffRatio !== null ? `${fmt(widestStaffRatio.ratio, 1)}×` : "—"}
          sublabel={
            widestStaffRatio
              ? `${widestStaffRatio.best.name} vs ${widestStaffRatio.worst.name}, ${staffYear}`
              : "Not enough state data for the latest year"
          }
        />
      </div>
      <SourceNote
        sourceKey="poverty"
        extra="Regional grouping (East Malaysia vs Peninsular) is a dashboard-defined grouping of DOSM states, not an official statistical category"
      />
    </section>
  );
}
