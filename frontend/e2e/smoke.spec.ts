import { expect, test, type Page } from "@playwright/test";
import { ROUTES } from "./routes";

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
    await expect(menu.getByRole("link")).toHaveCount(18);

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(menuButton).toBeFocused();

    await menuButton.click();
    await menu.getByRole("link", { name: "Healthcare Access" }).click();
    await expect(page).toHaveURL(/#\/healthcare-access$/);
    await expect(menu).toBeHidden();
  });

  test("the desktop sidebar is not shown on a phone", async ({ page }) => {
    await page.goto("/#/");
    await expect(page.locator("header").filter({ hasText: "Not for clinical or individual-level decision-making." })).toBeHidden();
  });
});

test.describe("desktop navigation", () => {
  test.skip(({ viewport }) => (viewport?.width ?? 0) < 1024, "desktop layout only");

  test("shows the sidebar with all 18 pages and no mobile menu button", async ({ page }) => {
    await page.goto("/#/");
    await expect(page.getByRole("button", { name: "Menu" })).toBeHidden();
    await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link")).toHaveCount(18);
  });
});
