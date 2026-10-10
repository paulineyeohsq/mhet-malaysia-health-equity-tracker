// Consistency checks between the published data files (public/data, produced by scripts/transform_data.py) and the
// code that reads them. Runs under Node, so it lives outside src/ (which is type-checked for the browser only).
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PAGE_DATA_FILES } from "../src/lib/pageDataFiles";
import { INVENTORY_MAP, type InventoryFile } from "../src/lib/inventoryMap";

const DATA = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "data");
const readJson = <T,>(name: string): T => JSON.parse(readFileSync(join(DATA, name), "utf-8")) as T;

describe("route -> data file map (drives the per-page 'data as of' line)", () => {
  const names = Array.from(new Set(Object.values(PAGE_DATA_FILES).flat()));

  it.each(names)("%s exists in public/data", (name) => {
    expect(existsSync(join(DATA, name))).toBe(true);
  });

  it.each(names)("%s is mapped to inventory datasets", (name) => {
    expect(INVENTORY_MAP[name]?.length).toBeGreaterThan(0);
  });

  it("every file has a latest data year stamped in the inventory", () => {
    const inv = readJson<InventoryFile>("dataset_inventory.json");
    const missing = names.filter((n) => typeof inv.data_files?.[n] !== "number");
    expect(missing).toEqual([]);
  });

  it("every inventory id the map points at exists", () => {
    const inv = readJson<InventoryFile>("dataset_inventory.json");
    const ids = new Set(inv.datasets.map((d) => d.id));
    const bad = Object.entries(INVENTORY_MAP).flatMap(([file, list]) => list.filter((id) => !ids.has(id)).map((id) => `${file} -> ${id}`));
    expect(bad).toEqual([]);
  });
});

interface AccessRow {
  state: string;
  year: number;
  staff_all: number | null;
  hospital_beds: number | null;
  population_used_for_rate: number | null;
  staff_per_100k: number | null;
  beds_per_100k: number | null;
  staff_per_100k_pooled: number | null;
  beds_per_100k_pooled: number | null;
  pool_label: string | null;
}

describe("Klang Valley pooled staff and bed rates", () => {
  const rows = readJson<AccessRow[]>("healthcare_access_state.json");
  const KV = ["Selangor", "W.P. Kuala Lumpur", "W.P. Putrajaya"];
  const round1 = (x: number) => Math.round(x * 10) / 10;

  it("leaves every state's own rate unchanged and outside the pool the pooled rate equals it", () => {
    for (const r of rows.filter((r) => !KV.includes(r.state))) {
      expect(r.pool_label).toBeNull();
      expect(r.staff_per_100k_pooled).toBe(r.staff_per_100k);
      expect(r.beds_per_100k_pooled).toBe(r.beds_per_100k);
    }
  });

  it("pools the three units as (sum of staff) / (sum of population) x 100,000, identical on all three rows", () => {
    const years = Array.from(new Set(rows.map((r) => r.year)));
    for (const year of years) {
      const members = KV.map((s) => rows.find((r) => r.state === s && r.year === year)!);
      const staff = members.map((m) => m.staff_all);
      const pop = members.map((m) => m.population_used_for_rate);
      const complete = staff.every((v) => v !== null) && pop.every((v) => v !== null);
      const pooled = new Set(members.map((m) => m.staff_per_100k_pooled));
      expect(pooled.size).toBe(1); // same value on all three
      const value = [...pooled][0];
      if (complete) {
        const expected = round1(((staff as number[]).reduce((a, b) => a + b, 0) / (pop as number[]).reduce((a, b) => a + b, 0)) * 100000);
        expect(value).toBe(expected);
      } else {
        expect(value).toBeNull(); // no population denominator -> no rate, never a guess
      }
    }
  });

  it("does the same for beds (2022 only)", () => {
    const members = KV.map((s) => rows.find((r) => r.state === s && r.year === 2022)!);
    const beds = members.map((m) => m.hospital_beds as number);
    const pop = members.map((m) => m.population_used_for_rate as number);
    const expected = round1((beds.reduce((a, b) => a + b, 0) / pop.reduce((a, b) => a + b, 0)) * 100000);
    expect(members.every((m) => m.beds_per_100k_pooled === expected)).toBe(true);
  });

  it("removes the artefact that made one territory look nine times better staffed than Selangor", () => {
    const y = 2022;
    const own = rows.filter((r) => r.year === y && r.staff_per_100k !== null).map((r) => r.staff_per_100k as number);
    const pooledUnique = new Map<string, number>();
    for (const r of rows.filter((r) => r.year === y && r.staff_per_100k_pooled !== null)) {
      pooledUnique.set(r.pool_label ?? r.state, r.staff_per_100k_pooled as number);
    }
    const ratio = (vals: number[]) => Math.max(...vals) / Math.min(...vals);
    expect(ratio(own)).toBeGreaterThan(8);
    expect(ratio([...pooledUnique.values()])).toBeLessThan(2.5);
  });
});

describe("Life expectancy files (read from DOSM's dashboard)", () => {
  interface StateRow { state: string; year: number; sex: string; life_expectancy: number }
  interface NationalRow { year: number; sex: string; ethnicity: string; life_expectancy: number }
  const state = readJson<StateRow[]>("life_expectancy_state.json");
  const national = readJson<NationalRow[]>("life_expectancy_national.json");

  it("has every one of the 16 states for each sex in a single year, Selangor / KL / Putrajaya separate", () => {
    expect(new Set(state.map((r) => r.year)).size).toBe(1);
    for (const sex of ["both", "male", "female"]) {
      const names = state.filter((r) => r.sex === sex).map((r) => r.state);
      expect(new Set(names).size).toBe(16);
      expect(names).toEqual(expect.arrayContaining(["Selangor", "W.P. Kuala Lumpur", "W.P. Putrajaya"]));
    }
  });

  it("holds plausible values, with women living longer than men in every state", () => {
    expect(state.every((r) => r.life_expectancy > 50 && r.life_expectancy < 95)).toBe(true);
    for (const s of new Set(state.map((r) => r.state))) {
      const get = (sex: string) => state.find((r) => r.state === s && r.sex === sex)!.life_expectancy;
      expect(get("female")).toBeGreaterThan(get("male"));
    }
  });

  it("has a national series that ends in the same year as the state figures", () => {
    const stateYear = state[0].year;
    expect(Math.max(...national.map((r) => r.year))).toBe(stateYear);
    expect(national.some((r) => r.ethnicity === "overall" && r.sex === "both" && r.year === stateYear)).toBe(true);
  });
});

describe("Population page slices of the electoral files", () => {
  interface Elec { state: string; year: number; sex: string; population_thousands: number | null; dun?: string; parlimen: string }
  for (const [full, slice] of [["population_dun.json", "population_dun_latest.json"], ["population_parlimen.json", "population_parlimen_latest.json"]] as const) {
    it(`${slice} is exactly the latest year, both sexes, of ${full}`, () => {
      const all = readJson<Elec[]>(full);
      const latest = Math.max(...all.map((r) => r.year));
      const expected = all.filter((r) => r.year === latest && r.sex === "both");
      expect(readJson<Elec[]>(slice)).toEqual(expected);
      expect(expected.length).toBeGreaterThan(100);
    });
  }
});

describe("Published inventory", () => {
  it("does not ship a list of datasets the dashboard does not have", () => {
    const inv = readJson<Record<string, unknown>>("dataset_inventory.json");
    expect(Object.keys(inv)).not.toContain("identified_but_not_yet_ingested");
    expect(JSON.stringify(inv)).not.toMatch(/identified_not_ingested/);
  });
});

describe("Public clinic counts (MOH facility registry)", () => {
  interface ClinicState {
    state: string; year: number; as_of: string; clinics_total: number; health_clinics: number; rural_clinics: number;
    community_clinics: number; mch_clinics: number; dental_clinics_total: number; population_used_for_rate: number | null;
    clinics_per_100k: number | null; clinics_per_100k_pooled: number | null; pool_label: string | null;
  }
  interface ClinicDistrict { state: string; district: string; clinics_total: number; dental_clinics_total: number }
  const states = readJson<ClinicState[]>("clinics_state.json");
  const districts = readJson<ClinicDistrict[]>("clinics_district.json");
  const KV = ["Selangor", "W.P. Kuala Lumpur", "W.P. Putrajaya"];

  it("has all 16 states, one snapshot year and the registry's own as-of date", () => {
    expect(states).toHaveLength(16);
    expect(new Set(states.map((r) => r.year)).size).toBe(1);
    expect(states[0].as_of.startsWith(String(states[0].year))).toBe(true);
  });

  it("district counts add up to the state counts, and the types add up to the clinics", () => {
    for (const s of states) {
      const d = districts.filter((x) => x.state === s.state);
      expect(d.reduce((a, x) => a + x.clinics_total, 0)).toBe(s.clinics_total);
      expect(d.reduce((a, x) => a + x.dental_clinics_total, 0)).toBe(s.dental_clinics_total);
      expect(s.health_clinics + s.rural_clinics + s.community_clinics + s.mch_clinics).toBe(s.clinics_total);
    }
  });

  it("per-100,000 rates are the count over the state population, and the Klang Valley three are pooled", () => {
    for (const s of states) {
      if (s.population_used_for_rate) {
        expect(s.clinics_per_100k).toBeCloseTo((s.clinics_total / s.population_used_for_rate) * 100000, 1);
      }
    }
    const kv = states.filter((s) => KV.includes(s.state));
    expect(new Set(kv.map((s) => s.clinics_per_100k_pooled)).size).toBe(1);
    expect(kv.every((s) => s.pool_label !== null)).toBe(true);
    const others = states.filter((s) => !KV.includes(s.state));
    expect(others.every((s) => s.pool_label === null && s.clinics_per_100k_pooled === s.clinics_per_100k)).toBe(true);
  });
});

describe("NHMS 2011 in the state panel", () => {
  interface Row { state: string; year: number; overall_diabetes_prevalence_pct: number | null; [k: string]: unknown }
  const rows = readJson<Row[]>("nhms_ncd_state.json");

  it("adds 2011 for 14 states, leaving Sabah and W.P. Labuan empty (the survey reports them combined)", () => {
    const r2011 = rows.filter((r) => r.year === 2011);
    expect(r2011).toHaveLength(14);
    expect(r2011.map((r) => r.state)).not.toContain("Sabah");
    expect(r2011.map((r) => r.state)).not.toContain("W.P. Labuan");
  });

  it("carries values the report states in its own text", () => {
    const get = (s: string) => rows.find((r) => r.state === s && r.year === 2011)!;
    expect(get("Perlis").overall_diabetes_prevalence_pct).toBe(24.8);
    expect(get("Kedah").overall_diabetes_prevalence_pct).toBe(22.5);
    expect(get("W.P. Putrajaya").overall_diabetes_prevalence_pct).toBe(8.8);
  });

  it("leaves every value of the earlier survey years exactly as before", () => {
    const johor2019 = rows.find((r) => r.state === "Johor" && r.year === 2019)!;
    expect(johor2019["raised_blood_glucose_prevalence_pct"]).toBe(19.7);
    expect(rows.filter((r) => r.year === 2015).length).toBeGreaterThan(10);
    expect(rows.filter((r) => r.year === 2023).length).toBe(16);
  });
});

describe("NHMS 2025 older persons (national)", () => {
  interface Row { table: string; indicator: string; dimension: string; category: string; n: number | null; prevalence_pct: number | null; ci_lower: number | null; ci_upper: number | null; suppressed: boolean }
  const rows = readJson<Row[]>("nhms_older_persons_2025_national.json");

  it("has a Malaysia-level row for every indicator and no state breakdown", () => {
    const indicators = Array.from(new Set(rows.map((r) => r.indicator)));
    expect(indicators.length).toBeGreaterThanOrEqual(20);
    for (const i of indicators) {
      expect(rows.filter((r) => r.indicator === i && r.dimension === "All older persons")).toHaveLength(1);
    }
    expect(rows.some((r) => /state|negeri/i.test(r.dimension))).toBe(false);
  });

  it("keeps every published prevalence inside its own interval, and suppressed cells empty", () => {
    for (const r of rows) {
      if (r.prevalence_pct === null) {
        expect(r.suppressed).toBe(true);
        continue;
      }
      expect(r.ci_lower!).toBeLessThanOrEqual(r.prevalence_pct + 0.051);
      expect(r.ci_upper!).toBeGreaterThanOrEqual(r.prevalence_pct - 0.051);
    }
  });
});

describe("PeKa B40 files", () => {
  interface Daily { state: string; date: string; screenings: number | null }
  interface Weekly { state: string; week_start: string; days: number; screenings: number | null }
  const daily = readJson<Daily[]>("pekab40_screenings_daily_state.json");
  const weekly = readJson<Weekly[]>("pekab40_screenings_weekly_state.json");

  it("the daily file holds a rolling 366-day window per state", () => {
    const dates = Array.from(new Set(daily.map((r) => r.date))).sort();
    expect(dates).toHaveLength(366);
  });

  it("weekly sums add up to the daily counts for the weeks the daily window fully covers", () => {
    const start = Array.from(new Set(daily.map((r) => r.date))).sort()[0];
    const weeklySum = weekly.filter((w) => w.week_start >= start && w.days === 7).reduce((s, w) => s + (w.screenings ?? 0), 0);
    const dailySumForThoseWeeks = daily
      .filter((d) => weekly.some((w) => w.state === d.state && w.days === 7 && w.week_start >= start && d.date >= w.week_start && d.date < addDays(w.week_start, 7)))
      .reduce((s, d) => s + (d.screenings ?? 0), 0);
    expect(weeklySum).toBe(dailySumForThoseWeeks);
  });

  it("only the first/last week of a state's history can be partial", () => {
    const partial = weekly.filter((w) => w.days < 7);
    const lastWeek = weekly.reduce((m, w) => (w.week_start > m ? w.week_start : m), "");
    expect(partial.every((w) => w.week_start === lastWeek)).toBe(true);
  });
});

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
