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
  await expect(page.getByRole("heading", { name: "Data Governance & Terms", level: 1 })).toBeVisible();
});

test("Data Governance & Terms has six numbered sections and the project contact", async ({ page }) => {
  await page.goto("/#/methodology");
  await expect(page.getByRole("heading", { name: "Data Governance & Terms", level: 1 })).toBeVisible();
  await expect(page.locator("main section h2")).toHaveText([
    "1. Purpose and research question",
    "2. Data sources",
    "3. Limitations",
    "4. Privacy",
    "5. Contact & Feedback",
    "6. Glossary",
  ]);
  await expect(page.getByRole("link", { name: "pauline.yeoh@monash.edu" })).toHaveAttribute("href", "mailto:pauline.yeoh@monash.edu");
  await expect(page.getByText("Developed as part of the MERCi initiative.")).toBeVisible();
  // on phones the navigation sits behind the Menu button, so check the link only where it is always shown
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Data Governance & Terms" })).toBeVisible();
  }
});

test.describe("plain-language copy", () => {
  // Words that belong in code, not in what a visitor reads. (The privacy section may still name Google, who processes AI questions.)
  const TECH = /Netlify|Gemini|serverless|Recharts|D3|JSON|\.json|pipeline|API|\.py|sandbox|client-side/i;
  for (const route of ROUTES) {
    test(`/${route || ""}: no development or tech-stack wording`, async ({ page }) => {
      await page.goto(`/#/${route}`);
      await expect(page.locator("main h1").first()).toBeVisible();
      await page.waitForLoadState("networkidle");
      const text = await page.locator("main").innerText();
      expect(text.match(TECH)?.[0] ?? null).toBeNull();
    });
  }

  test("assistant and sidebar carry the short, user-facing notices", async ({ page }) => {
    await page.goto("/#/");
    await page.getByRole("button", { name: "Open MY-HEO Assistant" }).first().click();
    await expect(page.getByText("Ask a question about the health data. Please do not submit personal or confidential information.")).toBeVisible();
    if ((page.viewportSize()?.width ?? 0) >= 1024) {
      await expect(page.getByText("Source: Official DOSM & MOH data.")).toBeVisible();
    }
  });

  test("a dataset that cannot be loaded says so in plain words", async ({ page }) => {
    await page.route(/life_expectancy_state\.json/, (route) => route.fulfill({ status: 500, body: "boom" }));
    await page.goto("/#/explorer");
    await page.getByLabel("Dataset", { exact: true }).selectOption({ label: "Life Expectancy at Birth — State" });
    await expect(page.getByText("Data for this section is currently unavailable.")).toBeVisible();
    await expect(page.locator("main")).not.toContainText(/HTTP|500|Failed to load/);
  });
});

test("Population page: the big electoral files are fetched only when their section is near, as small slices", async ({ page }) => {
  const requested: string[] = [];
  page.on("request", (r) => {
    const m = r.url().match(/\/data\/(population_(?:dun|parlimen)[a-z_]*\.json)/);
    if (m) requested.push(m[1]);
  });
  await page.goto("/#/population");
  await expect(page.locator("main h1").first()).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(requested).toEqual([]);
  await page.locator("#pop-electoral").scrollIntoViewIfNeeded();
  await expect(page.getByRole("heading", { name: /State assembly \(DUN\) constituencies/ })).toBeVisible();
  await expect(page.getByText(/No DUN constituency data/)).toHaveCount(0);
  expect(requested.sort()).toEqual(["population_dun_latest.json", "population_parlimen_latest.json"]);
});

test("Map page: only the boundary file for the chosen geography is fetched", async ({ page }) => {
  const geo: string[] = [];
  page.on("request", (r) => {
    const m = r.url().match(/\/geo\/(state|district)\.geojson/);
    if (m) geo.push(m[1]);
  });
  await page.goto("/#/map");
  await expect(page.getByRole("region", { name: /^Map of .* by state$/ })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(Array.from(new Set(geo))).toEqual(["state"]);
  await page.getByLabel("Geography").selectOption("district");
  await expect(page.getByRole("region", { name: /^Map of .* by district$/ })).toBeVisible();
  expect(Array.from(new Set(geo)).sort()).toEqual(["district", "state"]);
});

test("Data Gaps: grouped and searchable, with every dataset still reachable", async ({ page }) => {
  await page.goto("/#/data-gaps");
  const groups = page.locator("#limitations-heading").locator("xpath=ancestor::section").locator(":scope > div > details");
  await expect(groups).toHaveCount(6);
  await expect(page.getByRole("status")).toContainText(/datasets in 6 groups, and 6 known gaps/);
  // nothing is lost: opening every group shows every dataset (the number the status line reports)
  await page.getByRole("button", { name: "Open all groups" }).click();
  const total = Number((await page.getByRole("status").innerText()).match(/(\d+) datasets in/)![1]);
  await expect(page.locator("#limitations-heading").locator("xpath=ancestor::section").locator("li")).toHaveCount(total);
  // searching narrows both the datasets and the gaps
  await page.getByLabel("Search the gaps and datasets").fill("life expectancy");
  await expect(page.getByRole("status")).toContainText(/\d+ of \d+ datasets match/);
  await expect(page.locator("#limitations-heading").locator("xpath=ancestor::section").locator("li")).toHaveCount(1);
  await page.getByLabel("Search the gaps and datasets").fill("causes of death");
  await expect(page.locator("#not-ingested-heading + div li")).toHaveCount(1);
  await page.getByLabel("Search the gaps and datasets").fill("zzzz");
  await expect(page.getByText(/No dataset matches/)).toBeVisible();
});

test("Data Gaps lists only what has no machine-readable source", async ({ page }) => {
  await page.goto("/#/data-gaps");
  const list = page.locator("#not-ingested-heading + div li");
  await expect(list).toHaveCount(6);
  await expect(list.filter({ hasText: "Life Expectancy" })).toHaveCount(0);
  await expect(list.filter({ hasText: "Causes of Death" })).toContainText("Re-checked 2026-10-09");
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

test("Priority Areas: settings live in a panel, explanations are collapsed, and every indicator is scored", async ({ page }) => {
  await page.goto("/#/priority-areas");
  // the page itself shows the current settings and the two explanations (collapsed), not 19 checkboxes and 4 sliders
  await expect(page.getByText("Where do the weights come from?")).toBeVisible();
  await expect(page.getByText("Where does the equity gap come from?")).toBeVisible();
  await expect(page.getByText("They are an assumption, not a finding.")).toBeHidden();
  await expect(page.locator('input[type="checkbox"]')).toHaveCount(0);
  await expect(page.locator('input[type="range"]')).toHaveCount(0);
  await page.getByText("Where do the weights come from?").click();
  await expect(page.getByText("They are an assumption, not a finding.")).toBeVisible();

  const insight = page.getByText(/ranks as the top potential priority area/);
  await expect(insight).toContainText("indicators across 4 components");
  const before = Number(/from (\d+) indicator/.exec(await insight.innerText())?.[1]);

  const opener = page.getByRole("button", { name: "Customize the score…" });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Customize the score" });
  await expect(dialog).toBeVisible();
  for (const group of ["Health burden (proxy)", "Socioeconomic disadvantage", "Healthcare access gap", "Equity gap (inequality inside the state)"]) {
    await expect(dialog.getByText(group, { exact: true }).first()).toBeVisible();
  }
  const boxes = dialog.locator('input[type="checkbox"]');
  expect(await boxes.count()).toBeGreaterThanOrEqual(19);
  await expect(dialog.locator('input[type="range"]')).toHaveCount(4);
  await boxes.first().uncheck();
  await expect.poll(async () => Number(/from (\d+) indicator/.exec(await insight.innerText())?.[1])).toBe(before - 1);

  // Tab stays inside the panel; Escape closes it and focus returns to the button that opened it
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();

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

test.describe("progressive disclosure", () => {
  test("source notes show one line and open on demand", async ({ page }) => {
    await page.goto("/#/topics/access");
    await expect(page.locator("main h1").first()).toBeVisible();
    const first = page.locator("details", { hasText: "View source" }).first();
    await expect(first.locator("summary")).toContainText("View source");
    await expect(first.getByRole("link", { name: "Open the dataset" })).toBeHidden();
    await first.locator("summary").click();
    await expect(first.getByRole("link", { name: "Open the dataset" })).toBeVisible();
  });

  test("the staff and bed source notes flag that they carry a note", async ({ page }) => {
    await page.goto("/#/topics/access");
    await expect(page.getByText("⚠ note").first()).toBeVisible();
  });

  test("the correlation caveat keeps its headline visible and the explanation behind a click", async ({ page }) => {
    await page.goto("/#/determinants");
    await expect(page.getByText("Correlation, not causation.").first()).toBeVisible();
    await expect(page.getByText("confounding factors such as urbanisation")).toBeHidden();
    await page.getByText("Correlation, not causation.").first().click();
    await expect(page.getByText("confounding factors such as urbanisation")).toBeVisible();
  });

  test("calculation notes are collapsed", async ({ page }) => {
    await page.goto("/#/topics/access");
    await expect(page.getByText("How are these rates calculated?")).toBeVisible();
    await expect(page.getByText("Rate formula (staff):")).toBeHidden();
    await page.goto("/#/analytics");
    await expect(page.getByText("How is the equity gap calculated?")).toBeVisible();
  });
});

test.describe("overlays do not get in the way", () => {
  test("with the assistant closed nothing is fixed over the page content", async ({ page }) => {
    await page.goto("/#/topics/access");
    await expect(page.locator("main h1").first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    const covering = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .filter((el) => getComputedStyle(el).position === "fixed" && !el.closest("aside[inert]"))
        .map((el) => `${el.tagName}.${el.className}`.slice(0, 80))
    );
    expect(covering).toEqual([]);
  });

  test("the assistant opens from the navigation, never from a floating button", async ({ page }) => {
    await page.goto("/#/");
    const launcher = page.getByRole("button", { name: "Open MY-HEO Assistant" });
    await expect(launcher).toHaveCount(1);
    expect(await launcher.evaluate((el) => getComputedStyle(el).position)).not.toBe("fixed");
  });

  test("on a wide screen the open assistant makes room instead of covering the page; on a narrow one it dims and can be dismissed", async ({ page, viewport }) => {
    await page.goto("/#/topics/outcomes");
    await expect(page.locator("main h1").first()).toBeVisible();
    await page.getByRole("button", { name: "Open MY-HEO Assistant" }).click();
    const drawer = page.getByRole("complementary", { name: "MY-HEO Assistant" });
    await expect(drawer).toBeVisible();
    if ((viewport?.width ?? 0) >= 1280) {
      await expect.poll(async () => page.evaluate(() => document.getElementById("main-content")!.getBoundingClientRect().right)).toBeLessThanOrEqual(1440 - 380 + 1);
      const mainRight = await page.evaluate(() => document.getElementById("main-content")!.getBoundingClientRect().right);
      const drawerLeft = await drawer.evaluate((el) => el.getBoundingClientRect().left);
      expect(mainRight).toBeLessThanOrEqual(drawerLeft + 1);
    } else {
      await page.getByRole("button", { name: "Close the assistant" }).click({ force: true, position: { x: 10, y: 300 } });
      await expect(drawer).toBeHidden();
    }
  });

  test("the map never paints over the sticky phone bar", async ({ page, viewport }) => {
    test.skip((viewport?.width ?? 1440) >= 1024, "phone layout only");
    await page.goto("/#/map");
    await expect(page.locator(".leaflet-container")).toBeVisible();
    // Leaflet's zoom buttons carry z-index 1000. Scroll the page until they sit underneath the sticky bar, then ask what
    // is actually on top at that spot: it must be the bar, not the map.
    const hitInsideMap = await page.evaluate(async () => {
      const zoom = document.querySelector(".leaflet-top.leaflet-left")!.getBoundingClientRect();
      window.scrollTo(0, zoom.top + window.scrollY - 20);
      await new Promise((r) => setTimeout(r, 300));
      const now = document.querySelector(".leaflet-top.leaflet-left")!.getBoundingClientRect();
      const hit = document.elementFromPoint(now.left + 20, now.top + 15);
      return Boolean(hit?.closest(".leaflet-container"));
    });
    expect(hitInsideMap, "a map control is painted over the sticky bar").toBe(false);
  });

});
