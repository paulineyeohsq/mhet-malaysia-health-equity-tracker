import { CHAT_URL } from "./chatConfig";

/** Client for the /refresh function (netlify-chat/netlify/edge-functions/refresh.ts). */

export interface NewerDataset {
  id: string;
  name: string;
  reason: string;
}

export interface RunInfo {
  status: string; // queued | in_progress | completed ...
  conclusion: string | null; // success | failure | cancelled ... once completed
  createdAt: string;
  url: string;
}

export interface RefreshState {
  checkedAt: string;
  total: number;
  newer: NewerDataset[];
  /** Datasets that could not be checked right now (publisher unreachable or no baseline yet). */
  unchecked: number;
  /** false when the server has no GitHub token, so visitors can look but not start an update. */
  canUpdate: boolean;
  update: RunInfo | null;
  deploy: RunInfo | null;
  /** A refresh that looked unusual and is waiting for a person to approve it before it goes live. */
  reviewPending: { url: string; createdAt: string } | null;
  cooldownUntil: string | null;
  /** Only on POST responses. */
  status?: "up-to-date" | "started" | "already-running" | "cooldown" | "not-configured" | "failed";
}

export class RefreshError extends Error {}

async function call(method: "GET" | "POST"): Promise<RefreshState> {
  let res: Response;
  try {
    res = await fetch(`${CHAT_URL}/refresh`, { method });
  } catch {
    throw new RefreshError("Couldn't reach the update service. Check your connection and try again.");
  }
  let data: (Partial<RefreshState> & { error?: string }) | null = null;
  try {
    data = await res.json();
  } catch {
    /* not JSON */
  }
  if (res.status === 429) throw new RefreshError("Too many checks in a short time. Please wait a minute and try again.");
  if (!data || (!res.ok && !data.status)) {
    throw new RefreshError(data?.error ?? "The update service had a problem. Please try again in a moment.");
  }
  return data as RefreshState;
}

export const checkForUpdates = () => call("GET");
export const requestUpdate = () => call("POST");

/** The next scheduled automatic refresh: Mondays 02:00 UTC (10:00 in Malaysia), see .github/workflows/update-data.yml. */
export function nextScheduledRun(now: Date = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 2, 0, 0));
  const daysToMonday = (8 - d.getUTCDay()) % 7; // Monday = 1
  d.setUTCDate(d.getUTCDate() + daysToMonday);
  if (d.getTime() <= now.getTime()) d.setUTCDate(d.getUTCDate() + 7);
  return d;
}

export type Progress =
  | { phase: "idle" }
  | { phase: "refreshing"; text: string }
  | { phase: "publishing"; text: string }
  | { phase: "done"; text: string }
  | { phase: "review"; text: string; url: string }
  | { phase: "failed"; text: string; url?: string };

/** True while a workflow run is queued or running. */
export const isActiveRun = (r: RunInfo | null): boolean => r !== null && (r.status === "queued" || r.status === "in_progress" || r.status === "waiting");
const active = isActiveRun;

/**
 * Turns the latest refresh run and the latest deploy run into one sentence about where things stand.
 * `sinceUpdateFinished` is how long (ms) the page has known the refresh run is complete: a successful refresh that
 * found nothing to publish never starts a deploy, so after a grace period "no deploy" means "nothing to publish".
 */
export function progressOf(
  update: RunInfo | null,
  deploy: RunInfo | null,
  sinceUpdateFinished = 0,
  graceMs = 90_000,
  reviewPending: { url: string; createdAt: string } | null = null
): Progress {
  if (!update) return { phase: "idle" };
  if (active(update)) return { phase: "refreshing", text: "Refreshing the data from the publishers. This usually takes 10 to 15 minutes." };
  if (update.conclusion !== "success") {
    return { phase: "failed", text: "The update did not finish, so the dashboard still has its previous data. It will try again on its own on Monday.", url: update.url };
  }
  const deployIsNewer = deploy !== null && Date.parse(deploy.createdAt) >= Date.parse(update.createdAt);
  if (deployIsNewer && active(deploy)) return { phase: "publishing", text: "The new data is being published. This takes a few minutes." };
  if (deployIsNewer && deploy!.conclusion === "success") return { phase: "done", text: "The dashboard has been updated. Reload the page to see the latest data." };
  if (deployIsNewer) return { phase: "failed", text: "The new data was prepared but publishing it failed, so the site still shows the previous data.", url: deploy!.url };
  // The refresh finished but something looked unusual, so it was held for a person to approve rather than published.
  if (reviewPending && Date.parse(reviewPending.createdAt) >= Date.parse(update.createdAt)) {
    return {
      phase: "review",
      text: "The update found something unusual, so it is waiting for a person to check it before it goes live. The dashboard still shows its previous data.",
      url: reviewPending.url,
    };
  }
  if (sinceUpdateFinished < graceMs) return { phase: "publishing", text: "Checking whether there is anything new to publish…" };
  return { phase: "done", text: "The update finished. Nothing new needed publishing; if you expected a change, the publisher may not have released it yet." };
}
