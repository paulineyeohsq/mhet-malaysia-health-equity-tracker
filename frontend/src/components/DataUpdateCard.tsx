import { useEffect, useRef, useState } from "react";
import { useData } from "../lib/useData";
import type { InventoryFile } from "../lib/inventoryMap";
import {
  checkForUpdates,
  isActiveRun,
  nextScheduledRun,
  progressOf,
  requestUpdate,
  RefreshError,
  type Progress,
  type RefreshState,
} from "../lib/refreshApi";

const POLL_MS = 20_000;
const GIVE_UP_MS = 90 * 60_000;
const MAX_LISTED = 8;

const when = (d: Date) =>
  d.toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * Home-page card: when the data was last refreshed, when the next automatic refresh is, and a button to check whether any
 * publisher has released something newer since. If so, and on-demand updates are enabled on the server, a second button
 * starts the same refresh the weekly schedule runs, and the card follows it through to "published".
 */
export default function DataUpdateCard() {
  const { data: inventory } = useData<InventoryFile>("dataset_inventory.json");
  const [state, setState] = useState<RefreshState | null>(null);
  const [busy, setBusy] = useState<"checking" | "starting" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress>({ phase: "idle" });
  const [watching, setWatching] = useState(false);
  const finishedSeenAt = useRef<number | null>(null);
  // Progress is shown only for a run this visitor is following (one they started, or one found already running);
  // otherwise the "latest run" is just old history and must not be presented as news.
  const tracking = useRef(false);
  const trackFrom = useRef(0);

  function observe(s: RefreshState): Progress {
    setState(s);
    const upd = s.update;
    if (isActiveRun(upd)) {
      if (!tracking.current) trackFrom.current = Date.now();
      tracking.current = true;
    }
    if (!tracking.current) {
      const idle: Progress = { phase: "idle" };
      setProgress(idle);
      return idle;
    }
    // Just after a start, GitHub may still report the previous run for a few seconds.
    if (!upd || (!isActiveRun(upd) && Date.parse(upd.createdAt) < trackFrom.current - 30_000)) {
      const starting: Progress = { phase: "refreshing", text: "Starting the update…" };
      setProgress(starting);
      return starting;
    }
    const finished = upd.status === "completed";
    if (finished && finishedSeenAt.current === null) finishedSeenAt.current = Date.now();
    if (!finished) finishedSeenAt.current = null;
    const p = progressOf(s.update, s.deploy, finishedSeenAt.current === null ? 0 : Date.now() - finishedSeenAt.current);
    setProgress(p);
    return p;
  }

  // While an update is running, look at it every 20 seconds until it is published (or has failed).
  useEffect(() => {
    if (!watching) return;
    const startedAt = Date.now();
    const id = setInterval(() => {
      checkForUpdates()
        .then((s) => {
          const p = observe(s);
          if (p.phase === "done" || p.phase === "failed" || Date.now() - startedAt > GIVE_UP_MS) setWatching(false);
        })
        .catch(() => {
          /* a missed poll is fine; the next one tries again */
        });
    }, POLL_MS);
    return () => clearInterval(id);
  }, [watching]);

  async function handleCheck() {
    setBusy("checking");
    setError(null);
    setNote(null);
    try {
      const s = await checkForUpdates();
      const p = observe(s);
      if (p.phase === "refreshing" || p.phase === "publishing") setWatching(true);
    } catch (e) {
      setError(e instanceof RefreshError ? e.message : "Something went wrong while checking. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function handleUpdate() {
    setBusy("starting");
    setError(null);
    setNote(null);
    try {
      const s = await requestUpdate();
      observe(s);
      switch (s.status) {
        case "started":
        case "already-running":
          tracking.current = true;
          trackFrom.current = Date.now();
          setProgress({ phase: "refreshing", text: "Starting the update…" });
          setWatching(true);
          break;
        case "cooldown":
          setNote(`An update already ran recently. Another can be started after ${s.cooldownUntil ? when(new Date(s.cooldownUntil)) : "a few hours"} (Malaysia time).`);
          break;
        case "up-to-date":
          setNote("Nothing newer was found, so no update was needed.");
          break;
        case "not-configured":
          setNote("On-demand updates are not switched on for this site. The dashboard refreshes itself every Monday.");
          break;
        default:
          setError("The update could not be started. Please try again later.");
      }
    } catch (e) {
      setError(e instanceof RefreshError ? e.message : "Something went wrong while starting the update. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  const running = progress.phase === "refreshing" || progress.phase === "publishing";
  const next = nextScheduledRun();
  const newer = state?.newer ?? [];
  const canStart = Boolean(state?.canUpdate) && newer.length > 0 && !running && progress.phase !== "done" && !state?.cooldownUntil;

  return (
    <section aria-labelledby="data-update-heading" className="rounded-lg border border-line-axis bg-plane p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 id="data-update-heading" className="text-sm font-semibold uppercase tracking-wide text-ink-secondary">
            Is the data up to date?
          </h2>
          <p className="mt-1 text-sm text-ink-secondary">
            {inventory?.last_refreshed ? (
              <>
                Last refreshed from the publishers on <span className="font-medium text-ink-primary">{inventory.last_refreshed}</span>.{" "}
              </>
            ) : null}
            The dashboard re-fetches every source automatically each Monday (next: {when(next)}, Malaysia time). If a publisher
            releases something in between, check here.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleCheck()}
            disabled={busy !== null || running}
            className="rounded-md border border-series-1 px-3 py-1.5 text-sm font-medium text-series-1 hover:bg-seq-100 disabled:opacity-60"
          >
            {busy === "checking" ? "Checking the publishers…" : "Check for newer data"}
          </button>
          {canStart && (
            <button
              type="button"
              onClick={() => void handleUpdate()}
              disabled={busy !== null}
              className="rounded-md bg-series-1 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {busy === "starting" ? "Starting…" : "Update the dashboard now"}
            </button>
          )}
        </div>
      </div>

      <div aria-live="polite" className="mt-3 space-y-2 text-sm">
        {error && (
          <p role="alert" className="text-status-critical">
            {error}
          </p>
        )}
        {note && <p className="text-ink-secondary">{note}</p>}

        {state && !running && progress.phase !== "done" && newer.length === 0 && (
          <p className="text-ink-primary">
            Everything is up to date: none of the {state.total - state.unchecked} sources checked has newer data than this dashboard.
            {state.unchecked > 0 ? ` (${state.unchecked} could not be checked right now.)` : ""}
          </p>
        )}

        {state && newer.length > 0 && progress.phase !== "done" && (
          <div>
            <p className="text-ink-primary">
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-900">
                {newer.length} source{newer.length === 1 ? " has" : "s have"} newer data
              </span>{" "}
              than this dashboard.
            </p>
            <ul className="mt-1 list-disc pl-5 text-xs text-ink-secondary">
              {newer.slice(0, MAX_LISTED).map((n) => (
                <li key={n.id}>
                  {n.name} <span className="text-ink-muted">({n.reason})</span>
                </li>
              ))}
              {newer.length > MAX_LISTED && <li>and {newer.length - MAX_LISTED} more</li>}
            </ul>
            {!state.canUpdate && !running && (
              <p className="mt-2 text-xs text-ink-secondary">The next automatic refresh will pick these up on Monday.</p>
            )}
            {state.cooldownUntil && !running && state.canUpdate && (
              <p className="mt-2 text-xs text-ink-secondary">
                An update ran recently. The button comes back after {when(new Date(state.cooldownUntil))} (Malaysia time), or wait for Monday.
              </p>
            )}
          </div>
        )}

        {progress.phase !== "idle" && (
          <p className={progress.phase === "failed" ? "text-status-critical" : "text-ink-primary"}>
            {running && <span aria-hidden="true">⏳ </span>}
            {progress.phase === "done" && <span aria-hidden="true">✓ </span>}
            {"text" in progress ? progress.text : ""}
            {progress.phase === "failed" && progress.url && (
              <>
                {" "}
                <a href={progress.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  See the run
                </a>
              </>
            )}
          </p>
        )}
        {progress.phase === "done" && (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md bg-series-1 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
          >
            Reload to see the new data
          </button>
        )}
      </div>
    </section>
  );
}
