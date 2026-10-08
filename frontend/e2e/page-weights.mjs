// Page-weight report: for each route, loads the page cold in headless Chromium and totals what it downloaded.
// Text responses (HTML/JS/CSS/JSON/SVG) are counted gzip-compressed, as GitHub Pages serves them; images are counted as-is.
//
//   npm run build && npx vite preview --port 4173 &
//   node e2e/page-weights.mjs http://localhost:4173/ > weights.json
import { gzipSync } from "node:zlib";
import { chromium } from "@playwright/test";

const ROUTES = ["", "population", "map", "determinants", "matrix", "trends", "socioeconomic", "health-outcomes", "healthcare-access", "financing", "environment", "analytics", "state-matrix", "priority-areas", "research-opportunities", "explorer", "data-gaps", "methodology"];
const base = process.argv[2] ?? "http://localhost:4173/";
const TEXT = /^(text\/|application\/(javascript|json|xml)|image\/svg)/;

const browser = await chromium.launch();
const rows = [];
for (const route of ROUTES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); // fresh context = cold cache
  const page = await ctx.newPage();
  const items = [];
  page.on("response", async (r) => {
    try {
      const body = await r.body();
      const type = r.headers()["content-type"] ?? "";
      items.push({ url: r.url().replace(base, ""), raw: body.length, sent: TEXT.test(type) ? gzipSync(body).length : body.length });
    } catch {
      /* redirects / aborted */
    }
  });
  await page.goto(`${base}#/${route}`);
  await page.locator("main h1").first().waitFor();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  const total = items.reduce((s, i) => s + i.sent, 0);
  const js = items.filter((i) => i.url.endsWith(".js")).reduce((s, i) => s + i.sent, 0);
  const data = items.filter((i) => i.url.includes("data/")).reduce((s, i) => s + i.sent, 0);
  const images = items.filter((i) => /\.(png|jpg|svg)$/.test(i.url)).reduce((s, i) => s + i.sent, 0);
  rows.push({ route: `/${route}`, requests: items.length, totalKB: Math.round(total / 1024), jsKB: Math.round(js / 1024), dataKB: Math.round(data / 1024), imagesKB: Math.round(images / 1024) });
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(rows, null, 1));
