import { useId } from "react";
import { useLocation } from "react-router-dom";
import { HEALTHCARE_ACCESS_FILE, KLANG_VALLEY_UNITS, useKlangValleyMode } from "../lib/klangValley";
import { PAGE_DATA_FILES } from "../lib/pageDataFiles";

/**
 * Lets the visitor choose how Selangor, W.P. Kuala Lumpur and W.P. Putrajaya are compared on staff and hospital-bed
 * rates: pooled into one Klang Valley unit (default) or each territory on its own. Shown only on pages that use the
 * healthcare-access data; the choice applies app-wide and is remembered in this browser.
 */
export default function KlangValleyToggle() {
  const { pathname } = useLocation();
  const [mode, setMode] = useKlangValleyMode();
  const id = useId();
  if (!PAGE_DATA_FILES[pathname]?.includes(HEALTHCARE_ACCESS_FILE)) return null;

  const option = (value: "pooled" | "separate", label: string) => (
    <label className="flex cursor-pointer items-center gap-1.5">
      <input type="radio" name={`${id}-kv`} value={value} checked={mode === value} onChange={() => setMode(value)} />
      <span>{label}</span>
    </label>
  );

  return (
    <fieldset className="mt-3 text-xs text-ink-secondary">
      <legend className="font-medium text-ink-primary">
        Staff and hospital-bed rates for {KLANG_VALLEY_UNITS.join(", ").replace(/, ([^,]*)$/, " and $1")}
      </legend>
      <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
        {option("pooled", "Pooled as one Klang Valley unit (recommended)")}
        {option("separate", "Each territory on its own")}
      </div>
      {mode === "separate" && (
        <p className="mt-2 max-w-3xl rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-amber-900">
          Showing each territory's own rate. These three share national referral hospitals and federal institutions, so
          W.P. Putrajaya's and W.P. Kuala Lumpur's rates mostly reflect staff and beds serving the wider Klang Valley
          against a small resident population. Rankings and gaps that include them will look much larger than the
          difference in how well residents are actually served.
        </p>
      )}
    </fieldset>
  );
}
