import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DATASET_GROUPS, groupDatasets, matchesQuery } from "../src/lib/datasetGroups";
import type { InventoryFile } from "../src/lib/inventoryMap";

const inv = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "public", "data", "dataset_inventory.json"), "utf-8")) as InventoryFile;
const shown = inv.datasets.filter((d) => d.status.startsWith("ingested"));

describe("Data Gaps grouping", () => {
  it("puts every dataset in exactly one group and none in 'Other' (a new dataset needs a group on purpose)", () => {
    const groups = groupDatasets(shown);
    expect(groups.find((g) => g.id === "other")?.items.map((d) => d.id) ?? []).toEqual([]);
    const ids = groups.flatMap((g) => g.items.map((d) => d.id));
    expect(ids.length).toBe(shown.length);
    expect(new Set(ids).size).toBe(shown.length);
  });

  it("names only datasets that exist, and no dataset twice", () => {
    const all = DATASET_GROUPS.flatMap((g) => g.ids);
    expect(new Set(all).size).toBe(all.length);
    const known = new Set(inv.datasets.map((d) => d.id));
    expect(all.filter((id) => !known.has(id))).toEqual([]);
  });

  it("searches name, source, resolution, years and limitations without caring about case", () => {
    const d = shown.find((x) => x.id === "life_expectancy")!;
    expect(matchesQuery(d, "LIFE EXPECTANCY")).toBe(true);
    expect(matchesQuery(d, "dashboard")).toBe(true);
    expect(matchesQuery(d, "zzzz-not-there")).toBe(false);
    expect(matchesQuery(d, "   ")).toBe(true);
  });
});
