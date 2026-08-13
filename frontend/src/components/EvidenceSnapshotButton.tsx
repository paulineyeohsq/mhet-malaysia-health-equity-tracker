import { useState } from "react";
import { buildEvidenceSnapshotPdf, type EvidenceStat } from "../lib/evidenceSnapshot";
import type { SOURCES } from "../lib/sources";

/**
 * Sibling to ChartToolbar's buttons — triggers a one-page citable PDF
 * (chart + stats + citations + caveat) for the chart currently rendered
 * inside `chartRef`. See lib/evidenceSnapshot.ts for the PDF layout.
 */
export default function EvidenceSnapshotButton({
  chartRef,
  title,
  subtitle,
  stats,
  sourceKeys,
  caveat,
}: {
  chartRef: React.RefObject<HTMLDivElement | null>;
  title: string;
  subtitle?: string;
  stats: EvidenceStat[];
  sourceKeys: (keyof typeof SOURCES)[];
  caveat: string;
}) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    const svg = chartRef.current?.querySelector("svg");
    if (!svg) return;
    setPending(true);
    try {
      await buildEvidenceSnapshotPdf({ title, subtitle, chartSvg: svg, stats, sourceKeys, caveat });
    } catch {
      // Rasterization/PDF generation failed (e.g. unsupported browser) — no partial download triggered.
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="rounded border border-line-axis px-2 py-1 text-xs font-medium text-ink-secondary hover:border-series-1 hover:text-series-1 disabled:opacity-50"
    >
      {pending ? "Preparing PDF…" : "Export citable PDF"}
    </button>
  );
}
