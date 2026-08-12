/**
 * Per project safeguard #15: when data cannot support an analysis, say so
 * explicitly rather than silently omitting or faking it.
 */
export default function InsufficientData({ reason }: { reason?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line-axis bg-plane p-4 text-sm text-ink-secondary">
      <span className="font-medium text-ink-primary">Insufficient data available for this level of analysis.</span>
      {reason && <span> {reason}</span>}
    </div>
  );
}
