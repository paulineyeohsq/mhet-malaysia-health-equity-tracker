import { describe, expect, it } from "vitest";
import { nextScheduledRun, progressOf, type RunInfo } from "./refreshApi";

const run = (status: string, conclusion: string | null, createdAt: string): RunInfo => ({ status, conclusion, createdAt, url: "https://github.com/x/runs/1" });

describe("nextScheduledRun", () => {
  it("is the coming Monday 02:00 UTC", () => {
    // Fri 9 Oct 2026 -> Mon 12 Oct 2026
    expect(nextScheduledRun(new Date("2026-10-09T08:00:00Z")).toISOString()).toBe("2026-10-12T02:00:00.000Z");
  });
  it("on a Monday before 02:00 UTC it is that same morning", () => {
    expect(nextScheduledRun(new Date("2026-10-12T01:00:00Z")).toISOString()).toBe("2026-10-12T02:00:00.000Z");
  });
  it("on a Monday after 02:00 UTC it is next week", () => {
    expect(nextScheduledRun(new Date("2026-10-12T03:00:00Z")).toISOString()).toBe("2026-10-19T02:00:00.000Z");
  });
  it("on a Sunday it is the next day", () => {
    expect(nextScheduledRun(new Date("2026-10-11T23:00:00Z")).toISOString()).toBe("2026-10-12T02:00:00.000Z");
  });
});

describe("progressOf", () => {
  const t0 = "2026-10-09T08:00:00Z";
  it("is idle with no run", () => {
    expect(progressOf(null, null).phase).toBe("idle");
  });
  it("is refreshing while the update run is queued or running", () => {
    expect(progressOf(run("queued", null, t0), null).phase).toBe("refreshing");
    expect(progressOf(run("in_progress", null, t0), null).phase).toBe("refreshing");
  });
  it("reports a failed or cancelled update without claiming anything changed", () => {
    const p = progressOf(run("completed", "failure", t0), null);
    expect(p.phase).toBe("failed");
    expect(progressOf(run("completed", "cancelled", t0), null).phase).toBe("failed");
  });
  it("is publishing while a deploy started after the update is running", () => {
    expect(progressOf(run("completed", "success", t0), run("in_progress", null, "2026-10-09T08:20:00Z")).phase).toBe("publishing");
  });
  it("ignores an older deploy run", () => {
    const p = progressOf(run("completed", "success", t0), run("completed", "success", "2026-10-08T08:00:00Z"), 1000);
    expect(p.phase).toBe("publishing"); // still inside the grace period, waiting to see whether a deploy follows
  });
  it("is done once the newer deploy succeeded", () => {
    expect(progressOf(run("completed", "success", t0), run("completed", "success", "2026-10-09T08:20:00Z")).phase).toBe("done");
  });
  it("reports a failed deploy", () => {
    expect(progressOf(run("completed", "success", t0), run("completed", "failure", "2026-10-09T08:20:00Z")).phase).toBe("failed");
  });
  it("after the grace period with no new deploy, says nothing needed publishing", () => {
    const p = progressOf(run("completed", "success", t0), run("completed", "success", "2026-10-08T08:00:00Z"), 120_000);
    expect(p.phase).toBe("done");
    expect((p as { text: string }).text).toContain("Nothing new needed publishing");
  });
});
