import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * A right-hand settings panel for controls that would otherwise clutter the page (score weights, long indicator lists).
 * Behaves like a modal dialog: focus moves in, Tab stays inside, Escape or the backdrop closes it, and focus returns to
 * whatever opened it. Only mounted while open, so the page keeps its own state.
 */
export default function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>("button, [href], input, select, textarea")?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')).filter(
        (el) => !el.hasAttribute("disabled")
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener.current?.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60]">
      <button type="button" aria-label="Close settings" tabIndex={-1} onClick={onClose} className="absolute inset-0 h-full w-full cursor-default bg-black/30" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute right-0 top-0 flex h-full w-[460px] max-w-full flex-col border-l border-line-grid bg-surface shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-line-grid px-4 py-3">
          <h2 id={titleId} className="text-sm font-semibold text-ink-primary">
            {title}
          </h2>
          <button type="button" onClick={onClose} className="rounded border border-line-axis px-2 py-1 text-xs font-medium text-ink-secondary hover:border-series-1 hover:text-series-1">
            Done
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <div className="border-t border-line-grid px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}
