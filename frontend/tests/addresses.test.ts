// The public address lives in one place (frontend/.env, read by index.html) - no page, script or config may hard-code
// the old GitHub Pages address, or moving the site again would silently leave stale links behind.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

describe("site address", () => {
  const sources = [join(ROOT, "index.html"), ...files(join(ROOT, "src"))].filter((f) => /\.(html|tsx?|css)$/.test(f));

  it("is not hard-coded to the GitHub Pages address in the app", () => {
    const offenders = sources.filter((f) => readFileSync(f, "utf-8").includes("paulineyeohsq.github.io"));
    expect(offenders).toEqual([]);
  });

  it("feeds the social-preview image from VITE_SITE_URL, which is set", () => {
    expect(readFileSync(join(ROOT, "index.html"), "utf-8")).toContain("%VITE_SITE_URL%/og-image.png");
    expect(readFileSync(join(ROOT, ".env"), "utf-8")).toMatch(/^VITE_SITE_URL=https:\/\/my-heo\.netlify\.app$/m);
  });
});
