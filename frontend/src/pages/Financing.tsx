import { useMemo, useState } from "react";
import PageHeader from "../components/PageHeader";
import KPISummarySection from "../components/KPISummarySection";
import SourceNote from "../components/SourceNote";
import LineChartCard, { type Series } from "../components/LineChartCard";
import DataTable, { type Column } from "../components/DataTable";
import InsufficientData from "../components/InsufficientData";
import { useData } from "../lib/useData";

interface MnhaRow {
  year: number;
  variable: "teh" | "ceh" | "moh";
  sector: "total" | "private" | "public";
  expenditure_myr: number | null;
}

function fmtRM(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `RM ${(v / 1_000_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })} billion`;
}

function fmtPct(v: number | null): string {
  if (v === null || Number.isNaN(v)) return "—";
  return `${v.toFixed(1)}%`;
}

const tableColumns: Column[] = [
  { key: "year", label: "Year", numeric: true },
  { key: "variable", label: "Variable" },
  { key: "sector", label: "Sector" },
  { key: "expenditure_myr", label: "Expenditure (RM)", numeric: true },
];

export default function Financing() {
  const { data: mnha } = useData<MnhaRow[]>("mnha_national.json");

  const years = useMemo(() => {
    if (!mnha) return [];
    return Array.from(new Set(mnha.map((r) => r.year))).sort((a, b) => b - a);
  }, [mnha]);
  const [year, setYear] = useState<number | null>(null);
  const effectiveYear = year ?? years[0] ?? null;

  function find(variable: MnhaRow["variable"], sector: MnhaRow["sector"], yr: number | null) {
    if (!mnha || yr === null) return null;
    return mnha.find((r) => r.variable === variable && r.sector === sector && r.year === yr)?.expenditure_myr ?? null;
  }

  const tehTotal = find("teh", "total", effectiveYear);
  const cehTotal = find("ceh", "total", effectiveYear);
  const cehPublic = find("ceh", "public", effectiveYear);
  const cehPrivate = find("ceh", "private", effectiveYear);
  const mohPublic = find("moh", "public", effectiveYear);
  const mohShareOfPublicCeh = mohPublic !== null && cehPublic ? (mohPublic / cehPublic) * 100 : null;
  const publicShareOfCeh = cehPublic !== null && cehTotal ? (cehPublic / cehTotal) * 100 : null;

  const trendData = useMemo(() => {
    if (!mnha) return [];
    return years
      .slice()
      .sort((a, b) => a - b)
      .map((yr) => ({
        year: yr,
        "Total health expenditure (TEH)": find("teh", "total", yr),
        "Current health expenditure (CEH)": find("ceh", "total", yr),
        "MOH expenditure": find("moh", "public", yr),
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mnha, years]);
  const trendSeries: Series[] = [
    { key: "Total health expenditure (TEH)", label: "Total health expenditure (TEH)", color: "#2a78d6" },
    { key: "Current health expenditure (CEH)", label: "Current health expenditure (CEH)", color: "#1baf7a" },
    { key: "MOH expenditure", label: "MOH expenditure", color: "#eb6834" },
  ];

  const splitTrendData = useMemo(() => {
    if (!mnha) return [];
    return years
      .slice()
      .sort((a, b) => a - b)
      .map((yr) => {
        const pub = find("ceh", "public", yr);
        const total = find("ceh", "total", yr);
        return { year: yr, "Public share of CEH (%)": pub !== null && total ? Math.round((pub / total) * 1000) / 10 : null };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mnha, years]);
  const splitTrendSeries: Series[] = [{ key: "Public share of CEH (%)", label: "Public share of CEH (%)", color: "#4a3aa7" }];

  const tableRows = useMemo(
    () => (mnha ? [...mnha].sort((a, b) => b.year - a.year || a.variable.localeCompare(b.variable) || a.sector.localeCompare(b.sector)) : []),
    [mnha]
  );

  return (
    <div>
      <PageHeader
        title="Healthcare Financing"
        subtitle="National health expenditure — total, current, public/private split and MOH's own spend — from Malaysia's National Health Accounts (MNHA). National level only; no state breakdown exists in the open catalogue."
      />
      <div className="space-y-8 p-6 lg:p-10">
        {years.length > 0 && (
          <div className="mb-4 flex flex-wrap items-end gap-4 rounded-lg border border-line-grid bg-surface p-4">
            <div>
              <label htmlFor="financing-year" className="block text-xs font-medium uppercase tracking-wide text-ink-muted">
                Year
              </label>
              <select
                id="financing-year"
                value={effectiveYear ?? ""}
                onChange={(e) => setYear(Number(e.target.value))}
                className="mt-1 rounded-md border border-line-axis px-2 py-1.5 text-sm"
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <section>
          <KPISummarySection
            title={`National health expenditure — ${effectiveYear ?? "…"}`}
            headingId="fin-kpis"
            columns={4}
            items={[
              { label: "Total health expenditure (TEH)", value: fmtRM(tehTotal) },
              { label: "Current health expenditure (CEH)", value: fmtRM(cehTotal) },
              { label: "MOH expenditure", value: fmtRM(mohPublic) },
              { label: "Public share of CEH", value: fmtPct(publicShareOfCeh) },
            ]}
          />
          <p className="mt-2 max-w-3xl text-xs text-ink-muted">
            TEH includes capital expenditure (e.g. new hospital construction); CEH excludes it — the two are not
            interchangeable. MOH expenditure is {fmtPct(mohShareOfPublicCeh)} of total public CEH — the remainder is
            other public bodies (e.g. social security, other ministries, state/local government health spend), not
            MOH itself; MOH's own figure must never be summed with the CEH totals, which already include it.
          </p>
          <SourceNote sourceKey="mnha" year={effectiveYear ?? undefined} />
        </section>

        <section aria-labelledby="fin-trend">
          <h2 id="fin-trend" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Expenditure over time
          </h2>
          {trendData.length > 0 ? (
            <LineChartCard title="Health expenditure (RM)" data={trendData} xKey="year" series={trendSeries} height={340} />
          ) : (
            <InsufficientData reason="No national health expenditure trend data available." />
          )}
          <SourceNote sourceKey="mnha" />
        </section>

        <section aria-labelledby="fin-split">
          <h2 id="fin-split" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Public vs. private share of current health expenditure
          </h2>
          <p className="mb-3 max-w-3xl text-sm text-ink-secondary">
            Share of CEH funded by public sources (government, social security) versus private sources (out-of-pocket,
            private insurance, employers) — a key financing-equity indicator, since a rising private share can signal
            greater household financial risk.
          </p>
          {splitTrendData.length > 0 ? (
            <LineChartCard title="Public share of CEH (%)" data={splitTrendData} xKey="year" series={splitTrendSeries} unit="%" />
          ) : (
            <InsufficientData reason="No public/private CEH split data available." />
          )}
          {cehPrivate !== null && cehPublic !== null && (
            <p className="mt-2 text-xs text-ink-muted">
              {effectiveYear}: public {fmtRM(cehPublic)} vs. private {fmtRM(cehPrivate)}.
            </p>
          )}
          <SourceNote sourceKey="mnha" year={effectiveYear ?? undefined} />
        </section>

        <section aria-labelledby="fin-table">
          <h2 id="fin-table" className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Browse the underlying data
          </h2>
          {tableRows.length > 0 ? (
            <DataTable columns={tableColumns} rows={tableRows as unknown as Record<string, unknown>[]} pageSize={15} />
          ) : (
            <InsufficientData reason="Data still loading or unavailable." />
          )}
          <SourceNote sourceKey="mnha" />
        </section>
      </div>
    </div>
  );
}
