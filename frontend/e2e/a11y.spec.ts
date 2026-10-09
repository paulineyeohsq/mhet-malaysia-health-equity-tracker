import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ROUTES } from "./routes";

// WCAG 2.0/2.1 level A and AA rules, run by axe-core on every page at both viewport sizes. This includes colour
// contrast for text. (Contrast for chart marks and map fills is covered by unit tests in tests/contrast.test.ts.)
for (const route of ROUTES) {
  test(`/${route} has no axe violations (WCAG 2.1 A/AA)`, async ({ page }) => {
    await page.goto(`/#/${route}`);
    await expect(page.locator("main h1").first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.help} - ${v.nodes.length} node(s), e.g. ${v.nodes[0]?.html.slice(0, 140)}`);
    expect(summary, summary.join("\n")).toEqual([]);
  });
}

test("every chart has an accessible name and a text summary", async ({ page }) => {
  const missing: string[] = [];
  for (const route of ROUTES) {
    await page.goto(`/#/${route}`);
    await expect(page.locator("main h1").first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(400);
    const bad = await page.evaluate(() =>
      Array.from(document.querySelectorAll("main .recharts-wrapper")).flatMap((chart) => {
        const fig = chart.closest('[role="img"]');
        const label = fig?.getAttribute("aria-label")?.trim();
        const describedBy = fig?.getAttribute("aria-describedby");
        const summary = describedBy ? document.getElementById(describedBy)?.textContent?.trim() : "";
        return label && summary ? [] : [`${label ?? "(no accessible name)"}`];
      })
    );
    for (const b of bad) missing.push(`/${route}: ${b}`);
  }
  expect(missing, missing.join("\n")).toEqual([]);
});

test("maps are named regions with a text summary", async ({ page }) => {
  await page.goto("/#/map");
  const region = page.getByRole("region", { name: /^Map of .* by state$/ });
  await expect(region).toBeVisible();
  const describedBy = await region.getAttribute("aria-describedby");
  await expect(page.locator(`#${describedBy}`)).toContainText("have a value. Highest:");
});

test("Population Explorer: every dropdown and search box has a name, in every mode, and axe is clean", async ({ page }) => {
  await page.goto("/#/population");
  await expect(page.locator("main h1").first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  const unnamed = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll("main select, main input"))
        .filter((el) => {
          const input = el as HTMLInputElement | HTMLSelectElement;
          return !(input.labels && input.labels.length > 0) && !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby");
        })
        .map((el) => `${el.tagName.toLowerCase()}#${el.id}`)
    );
  expect(await unnamed()).toEqual([]);
  // the controls that appear only in some modes: walk every option of each mode switch
  for (const id of ["eth-level", "age-geo", "group-field"]) {
    const select = page.locator(`#${id}`);
    const values = await select.locator("option").evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value));
    for (const v of values) {
      await select.selectOption(v);
      expect(await unnamed(), `after choosing ${v} in #${id}`).toEqual([]);
    }
  }
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]).include("main").analyze();
  const bad = results.violations.filter((v) => ["label", "select-name", "duplicate-id", "duplicate-id-aria"].includes(v.id));
  expect(bad.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 100)}`)).toEqual([]);
});

test("the 'Ask MY-HEO' label is associated with its select", async ({ page }) => {
  await page.goto("/#/");
  const select = page.getByLabel("Ask MY-HEO");
  await expect(select).toBeVisible();
  expect(await select.evaluate((el) => el.tagName)).toBe("SELECT");
});

test.describe("chat drawer keyboard behaviour", () => {
  test("a closed drawer cannot be tabbed into; opening focuses the question box; Escape closes and returns focus", async ({ page }) => {
    await page.goto("/#/");
    const drawer = page.getByRole("complementary", { name: "MY-HEO Assistant", includeHidden: true });
    await expect(drawer).toHaveAttribute("inert", "");
    // Tab through the whole page: focus must never land inside the closed (invisible) drawer.
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press("Tab");
      const inDrawer = await page.evaluate(() => Boolean(document.activeElement?.closest("aside")));
      expect(inDrawer, `focus entered the closed drawer on Tab press ${i + 1}`).toBe(false);
    }

    const toggle = page.getByRole("button", { name: "Open MY-HEO Assistant" });
    await toggle.click();
    await expect(page.getByRole("textbox", { name: "Your question" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveAttribute("inert", "");
    await expect(page.getByRole("button", { name: "Open MY-HEO Assistant" })).toBeFocused();
  });
});
