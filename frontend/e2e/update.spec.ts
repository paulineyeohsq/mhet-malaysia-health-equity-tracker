import { expect, test, type Page, type Route } from "@playwright/test";

// The "Is the data up to date?" card on the home page. The /refresh function is replaced by scripted answers, and time
// is faked so the 20-second progress polling runs instantly.

const base = {
  checkedAt: "2026-10-09T08:00:00Z",
  total: 58,
  unchecked: 2,
  canUpdate: true,
  update: null as null | Record<string, unknown>,
  deploy: null as null | Record<string, unknown>,
  cooldownUntil: null as string | null,
};
const newer = [
  { id: "death_state", name: "Deaths by state", reason: "file replaced (Fri, 09 Oct 2026 00:01:49 GMT)" },
  { id: "pekab40_screenings_state", name: "PeKa B40 screenings", reason: "file updated Fri, 09 Oct 2026 00:01:49 GMT" },
];
const run = (status: string, conclusion: string | null, createdAt: string) => ({ status, conclusion, createdAt, url: "https://github.com/x/actions/runs/1" });

/** Answers /refresh from a script: each GET/POST takes the next entry (the last one repeats). */
async function script(page: Page, steps: { method?: string; status?: number; body: unknown }[]) {
  const seen: string[] = [];
  let i = 0;
  await page.route("**/refresh", async (route: Route) => {
    const method = route.request().method();
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" } });
    seen.push(method);
    const step = steps[Math.min(i++, steps.length - 1)];
    await route.fulfill({
      status: step.status ?? 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(step.body),
    });
  });
  return seen;
}

test("nothing newer: says everything is up to date and offers no update button", async ({ page }) => {
  await script(page, [{ body: { ...base, newer: [] } }]);
  await page.goto("/#/");
  await expect(page.getByRole("heading", { name: "Is the data up to date?" })).toBeVisible();
  await expect(page.getByText(/Last refreshed from the publishers on/)).toBeVisible();
  await expect(page.getByText(/Each Monday \(next:/)).toBeVisible();
  await page.getByRole("button", { name: "Check for newer data" }).click();
  await expect(page.getByText(/Everything is up to date/)).toBeVisible();
  await expect(page.getByText(/none of the 56 sources checked/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Update the dashboard now" })).toHaveCount(0);
});

test("newer data and on-demand updates enabled: update now, follow the progress, reload when published", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-09T08:00:00Z") });
  const seen = await script(page, [
    { body: { ...base, newer } }, // GET: check
    { body: { ...base, newer, status: "started", update: run("queued", null, "2026-10-09T08:00:05Z") } }, // POST
    { body: { ...base, newer, update: run("in_progress", null, "2026-10-09T08:00:06Z") } }, // poll 1
    { body: { ...base, newer, update: run("completed", "success", "2026-10-09T08:00:06Z"), deploy: run("in_progress", null, "2026-10-09T08:14:00Z") } }, // poll 2
    { body: { ...base, newer, update: run("completed", "success", "2026-10-09T08:00:06Z"), deploy: run("completed", "success", "2026-10-09T08:14:00Z") } }, // poll 3
  ]);
  await page.goto("/#/");
  await page.getByRole("button", { name: "Check for newer data" }).click();
  await expect(page.getByText("2 sources have newer data")).toBeVisible();
  await expect(page.getByText("Deaths by state")).toBeVisible();
  await page.getByRole("button", { name: "Update the dashboard now" }).click();
  await expect(page.getByText("Starting the update")).toBeVisible();
  await page.clock.fastForward(20_000);
  await expect(page.getByText("Refreshing the data from the publishers")).toBeVisible();
  await page.clock.fastForward(20_000);
  await expect(page.getByText("The new data is being published")).toBeVisible();
  await page.clock.fastForward(20_000);
  await expect(page.getByText("The dashboard has been updated")).toBeVisible();
  await expect(page.getByRole("button", { name: "Reload to see the new data" })).toBeVisible();
  expect(seen[0]).toBe("GET");
  expect(seen[1]).toBe("POST");
  expect(seen.filter((m) => m === "POST")).toHaveLength(1);
});

test("newer data but on-demand updates are not enabled: explains the Monday refresh, no button", async ({ page }) => {
  await script(page, [{ body: { ...base, newer, canUpdate: false } }]);
  await page.goto("/#/");
  await page.getByRole("button", { name: "Check for newer data" }).click();
  await expect(page.getByText("2 sources have newer data")).toBeVisible();
  await expect(page.getByText(/will pick these up on Monday/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Update the dashboard now" })).toHaveCount(0);
});

test("the card explains what actually happens: checks first, unusual changes held for review", async ({ page }) => {
  await script(page, [{ body: { ...base, newer: [] } }]);
  await page.goto("/#/");
  await expect(page.getByText(/runs its automated checks and,\s+if they all pass, publishes the new data by itself/)).toBeVisible();
  await expect(page.getByText(/Anything that looks unusual is held back for a person to\s+review/)).toBeVisible();
});

test("a refresh held for review is shown as waiting, not as published or as nothing to do", async ({ page }) => {
  const pr = { url: "https://github.com/x/pull/9", createdAt: "2026-10-12T02:30:00Z" };
  await script(page, [{ body: { ...base, newer: [], reviewPending: pr } }]);
  await page.goto("/#/");
  await page.getByRole("button", { name: "Check for newer data" }).click();
  await expect(page.getByText("Waiting for review")).toBeVisible();
  await expect(page.getByText(/has not gone live yet and the dashboard still shows its previous data/)).toBeVisible();
  await expect(page.getByRole("link", { name: "See what is proposed" })).toHaveAttribute("href", pr.url);
});

test("a recent update: the button waits for the cooldown", async ({ page }) => {
  await script(page, [{ body: { ...base, newer, cooldownUntil: "2026-10-09T11:00:00Z", update: run("completed", "success", "2026-10-09T08:00:00Z") } }]);
  await page.goto("/#/");
  await page.getByRole("button", { name: "Check for newer data" }).click();
  await expect(page.getByText(/An update ran recently/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Update the dashboard now" })).toHaveCount(0);
});

test("an old finished run is not presented as news", async ({ page }) => {
  await script(page, [{ body: { ...base, newer: [], update: run("completed", "success", "2026-09-01T02:00:00Z"), deploy: run("completed", "success", "2026-09-01T02:20:00Z") } }]);
  await page.goto("/#/");
  await page.getByRole("button", { name: "Check for newer data" }).click();
  await expect(page.getByText(/Everything is up to date/)).toBeVisible();
  await expect(page.getByText("The dashboard has been updated")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reload to see the new data" })).toHaveCount(0);
});

test("a failed update says the previous data is unchanged", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-09T08:00:00Z") });
  await script(page, [
    { body: { ...base, newer } },
    { body: { ...base, newer, status: "started", update: run("queued", null, "2026-10-09T08:00:05Z") } },
    { body: { ...base, newer, update: run("completed", "failure", "2026-10-09T08:00:06Z") } },
  ]);
  await page.goto("/#/");
  await page.getByRole("button", { name: "Check for newer data" }).click();
  await page.getByRole("button", { name: "Update the dashboard now" }).click();
  await expect(page.getByText("Starting the update")).toBeVisible();
  await page.clock.fastForward(20_000);
  await expect(page.getByText(/did not finish, so the dashboard still has its previous data/)).toBeVisible();
});

test("service errors are shown in plain words", async ({ page }) => {
  await script(page, [{ status: 502, body: { error: "Couldn't reach the data sources to check them. Please try again shortly." } }]);
  await page.goto("/#/");
  await page.getByRole("button", { name: "Check for newer data" }).click();
  await expect(page.getByRole("alert")).toContainText("Couldn't reach the data sources");
  await expect(page.getByText("Failed to fetch")).toHaveCount(0);

  await page.unroute("**/refresh");
  await page.route("**/refresh", (route) => route.abort());
  await page.getByRole("button", { name: "Check for newer data" }).click();
  await expect(page.getByRole("alert")).toContainText("Couldn't reach the update service");
});

test("nothing is requested from the update service until the button is pressed", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/refresh")) calls.push(r.method());
  });
  await page.goto("/#/");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  expect(calls).toEqual([]);
});
