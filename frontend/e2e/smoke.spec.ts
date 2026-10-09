import { expect, test, type Page } from "@playwright/test";
import { LEGACY_REDIRECTS, ROUTES } from "./routes";

/** Collects everything that would show up as a problem to a visitor: console errors, uncaught exceptions, failed
 * or erroring requests, and requests that leave this site. */
function watch(page: Page) {
  const problems: string[] = [];
  const origin = "http://localhost:4173";
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console.error: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`uncaught: ${e.message}`));
  page.on("requestfailed", (r) => problems.push(`request failed: ${r.url()} (${r.failure()?.errorText})`));
  page.on("response", (r) => {
    if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`);
  });
  page.on("request", (r) => {
    if (!r.url().startsWith(origin) && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) {
      problems.push(`third-party request: ${r.url()}`);
    }
  });
  return problems;
}

async function expectNoHorizontalOverflow(page: Page) {
  const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(scroll, `page is ${scroll}px wide in a ${inner}px window`).toBeLessThanOrEqual(inner + 1);
}

for (const route of ROUTES) {
  test(`/${route || ""} loads cleanly`, async ({ page }) => {
    const problems = watch(page);
    await page.goto(`/#/${route}`);
    await expect(page.locator("main h1").first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500); // let charts and maps settle

    await expect(page.getByText("This page couldn't load")).toHaveCount(0);
    await expect(page.getByText("Page not found")).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    expect(problems, problems.join("\n")).toEqual([]);
  });
}

test("an unknown URL shows the not-found page with a way home", async ({ page }) => {
  const problems = watch(page);
  await page.goto("/#/definitely-not-a-page");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await page.getByRole("link", { name: "Back to Home" }).click();
  await expect(page).toHaveURL(/#\/$/);
  expect(problems, problems.join("\n")).toEqual([]);
});

test("a page whose code fails to load shows the friendly fallback, and the nav still works", async ({ page }) => {
  await page.route(/assets\/Trends-[^/]*\.js/, (route) => route.abort());
  await page.goto("/#/");
  await expect(page.locator("main h1").first()).toBeVisible();
  await page.evaluate(() => {
    window.location.hash = "#/trends";
  });
  await expect(page.getByRole("alert")).toContainText("This page couldn't load");
  await expect(page.getByRole("button", { name: "Reload page" })).toBeVisible();
  // leaving the broken page recovers without a reload
  await page.evaluate(() => {
    window.location.hash = "#/methodology";
  });
  await expect(page.getByRole("heading", { name: "Methodology", level: 1 })).toBeVisible();
});

test("Research Opportunities makes no AI request until a button is clicked", async ({ page }) => {
  const chatRequests: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/chat")) chatRequests.push(r.url());
  });
  await page.goto("/#/research-opportunities");
  await expect(page.locator("main h1").first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  expect(chatRequests).toEqual([]);
  await expect(page.getByText("Nothing requested yet")).toBeVisible();
});

test("a failed AI request shows a plain message and a retry button", async ({ page }) => {
  await page.route("**/chat", (route) => route.abort());
  await page.goto("/#/research-opportunities");
  await page.getByRole("button", { name: "Suggest a research question" }).click();
  const alert = page.getByRole("alert").filter({ hasText: "Couldn't reach the AI service" });
  await expect(alert).toBeVisible();
  await expect(alert.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByText("Failed to fetch")).toHaveCount(0);
});

test.describe("mobile navigation", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 1440) >= 1024, "phone layout only");

  test("opens, lists every page, closes on Escape and after choosing a page", async ({ page }) => {
    await page.goto("/#/");
    const menuButton = page.getByRole("button", { name: "Menu" });
    const menu = page.locator("#mobile-menu");
    await expect(menuButton).toHaveAttribute("aria-expanded", "false");
    await expect(menu).toBeHidden();

    await menuButton.click();
    await expect(menuButton).toHaveAttribute("aria-expanded", "true");
    await expect(menu.getByRole("link")).toHaveCount(13);

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(menuButton).toBeFocused();

    await menuButton.click();
    await menu.getByRole("link", { name: "Health Topics" }).click();
    await expect(page).toHaveURL(/#\/topics\/outcomes$/);
    await expect(menu).toBeHidden();
  });

  test("the desktop sidebar is not shown on a phone", async ({ page }) => {
    await page.goto("/#/");
    await expect(page.locator("header").filter({ hasText: "Not for clinical or individual-level decision-making." })).toBeHidden();
  });
});

test.describe("desktop navigation", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "desktop layout only");

  test("shows the sidebar with all 13 links and no mobile menu button", async ({ page }) => {
    await page.goto("/#/");
    await expect(page.getByRole("button", { name: "Menu" })).toBeHidden();
    await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link")).toHaveCount(13);
  });
});

test("the Klang Valley toggle switches the staff headline between pooled and each territory on its own", async ({ page }) => {
  // Relative on purpose: the exact ratios change whenever the publisher releases new data, but listing each territory
  // on its own must always make the gap larger than pooling them (W.P. Putrajaya's rate is an artefact of its tiny population).
  const ratio = async () => {
    const tile = page.locator("main").getByText("Widest healthcare-staff ratio (public sector)").locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]");
    const text = await tile.innerText();
    return Number(/([\d.]+)×/.exec(text)?.[1]);
  };
  await page.goto("/#/");
  await expect(page.getByLabel(/Pooled as one Klang Valley unit/)).toBeChecked();
  // the tile shows a dash until the data has loaded: wait for a real number before taking the baseline
  await expect.poll(ratio).not.toBeNaN();
  const pooled = await ratio();
  await page.getByLabel("Each territory on its own").check();
  await expect(page.getByText("Showing each territory's own rate")).toBeVisible();
  await expect.poll(async () => (await ratio()) > pooled * 2).toBe(true);
  // remembered across a reload
  await page.reload();
  await expect(page.getByLabel("Each territory on its own")).toBeChecked();
  await page.getByLabel(/Pooled as one Klang Valley unit/).check();
  await expect.poll(ratio).toBe(pooled);
});

test("Priority Areas explains its weights and equity gap, and scores every indicator it lists", async ({ page }) => {
  await page.goto("/#/priority-areas");
  await expect(page.getByText("Where do these weights come from?")).toBeVisible();
  await expect(page.getByText("Where does the equity gap come from?")).toBeVisible();
  for (const group of ["Health burden (proxy)", "Socioeconomic disadvantage", "Healthcare access gap", "Equity gap (inequality inside the state)"]) {
    await expect(page.getByRole("heading", { name: group, level: 3 })).toBeVisible();
  }
  const boxes = page.locator('input[type="checkbox"]');
  expect(await boxes.count()).toBeGreaterThanOrEqual(19);
  const insight = page.getByText(/ranks as the top potential priority area/);
  await expect(insight).toContainText("indicators across 4 components");
  // untick one indicator: the count in the headline drops by one
  const before = Number(/from (\d+) indicator/.exec(await insight.innerText())?.[1]);
  await boxes.first().uncheck();
  await expect.poll(async () => Number(/from (\d+) indicator/.exec(await insight.innerText())?.[1])).toBe(before - 1);
  // every state has a rank range and the table has one row per state with a score
  await expect(page.locator("table").first().locator("tbody tr")).toHaveCount(16);
});

test.describe("consolidated pages", () => {
  for (const [legacy, now] of Object.entries(LEGACY_REDIRECTS)) {
    test(`the old /${legacy} URL still works and lands on /${now}`, async ({ page }) => {
      await page.goto(`/#/${legacy}`);
      await expect(page).toHaveURL(new RegExp(`#/${now}$`));
      await expect(page.locator("main h1").first()).toBeVisible();
    });
  }

  test("Health Topics: a dropdown switches between the four dashboards and keeps the data-as-of line", async ({ page }) => {
    await page.goto("/#/topics");
    await expect(page).toHaveURL(/#\/topics\/outcomes$/);
    await expect(page.locator("main h1").first()).toContainText("Health Outcomes");
    const select = page.getByLabel("Health topic");
    await expect(select.locator("option")).toHaveText(["Health Outcomes", "Healthcare Access", "Healthcare Financing", "Environment"]);
    for (const [label, path, h1] of [
      ["Healthcare Access", "access", "Healthcare Access"],
      ["Healthcare Financing", "financing", "Financing"],
      ["Environment", "environment", "Environment"],
    ]) {
      await select.selectOption({ label });
      await expect(page).toHaveURL(new RegExp(`#/topics/${path}$`));
      await expect(page.locator("main h1").first()).toContainText(h1);
      await expect(page.getByText(/Data as of/).first()).toBeVisible();
    }
    // the Klang Valley control still appears for the access topic (it is looked up by the page's original path)
    await select.selectOption({ label: "Healthcare Access" });
    await expect(page.getByLabel("Each territory on its own")).toBeVisible();
  });

  test("Health Outcomes: the life expectancy view ranks every state and keeps Klang Valley separate", async ({ page }) => {
    await page.goto("/#/topics/outcomes");
    await page.getByLabel("Indicator category").selectOption({ label: "Life Expectancy at Birth" });
    await expect(page.getByRole("heading", { name: /Life expectancy at birth by state/ })).toBeVisible();
    await expect(page.getByText("Highest state")).toBeVisible();
    await expect(page.getByText("Gap, highest to lowest")).toBeVisible();
    await expect(page.getByRole("heading", { name: /national trend by ethnic group/ })).toBeVisible();
    await page.getByLabel("Sex", { exact: true }).selectOption({ label: "Female" });
    await expect(page.getByRole("heading", { name: /\(female\)/ })).toBeVisible();
    await expect(page.getByText(/always shown separately/)).toBeVisible();
  });

  test("Patterns & Inequality: a toggle switches between trend, matrix and inequality views", async ({ page }) => {
    await page.goto("/#/patterns");
    await expect(page).toHaveURL(/#\/patterns\/trends$/);
    const group = page.getByRole("radiogroup", { name: "View as" });
    await expect(group.getByRole("radio")).toHaveCount(3);
    await expect(group.getByRole("radio", { name: "Trend over time" })).toHaveAttribute("aria-checked", "true");
    await group.getByRole("radio", { name: "Indicator matrix" }).click();
    await expect(page).toHaveURL(/#\/patterns\/matrix$/);
    await expect(group.getByRole("radio", { name: "Indicator matrix" })).toHaveAttribute("aria-checked", "true");
    await group.getByRole("radio", { name: "Inequality gap" }).click();
    await expect(page).toHaveURL(/#\/patterns\/inequality$/);
    await expect(page.locator("main h1").first()).toHaveText("Socioeconomic Inequality");
  });

  test("an unknown topic or view falls back to the first option", async ({ page }) => {
    await page.goto("/#/topics/nonsense");
    await expect(page).toHaveURL(/#\/topics\/outcomes$/);
    await page.goto("/#/patterns/nonsense");
    await expect(page).toHaveURL(/#\/patterns\/trends$/);
  });

  test('"Ask MY-HEO" shortcuts still carry their filters through the redirect', async ({ page }) => {
    await page.goto("/#/");
    await page.getByLabel("Ask MY-HEO").selectOption({ label: "Which state has the highest maternal mortality rate?" });
    await expect(page).toHaveURL(/#\/topics\/outcomes$/);
    await expect(page.locator("#metric-select")).toHaveValue("maternal_mortality");
  });
});
