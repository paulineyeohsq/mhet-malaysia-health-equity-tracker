"""
build_geo_lookup.py — Build the standard Malaysian geographic dimension
table required by the dashboard (state + district, with codes and
centroid coordinates for map interaction / labelling).

Source of truth: DOSM's own open administrative boundary files
(dosm-malaysia/data-open on GitHub), shipped in data/raw/geo/. We do NOT
fabricate any boundary or coordinate — centroids are computed
geometrically from the official polygons using shapely.

Output:
  data/processed/geo_lookup.csv       (state_code, state_name, district_code,
                                        district_name, latitude, longitude)
  data/processed/geo/state.geojson    (copy-through, for the choropleth map)
  data/processed/geo/district.geojson (copy-through, for the choropleth map)
"""
import csv
import json
import shutil
from pathlib import Path

from shapely.geometry import shape

ROOT = Path(__file__).resolve().parents[1]
RAW_GEO = ROOT / "data" / "raw" / "geo"
OUT_DIR = ROOT / "data" / "processed"
OUT_GEO_DIR = OUT_DIR / "geo"
OUT_GEO_DIR.mkdir(parents=True, exist_ok=True)


def centroid_of(feature):
    geom = shape(feature["geometry"])
    c = geom.centroid
    return round(c.y, 5), round(c.x, 5)  # lat, lon


def main():
    state_geo = json.loads((RAW_GEO / "administrative_1_state.geojson").read_text())
    district_geo = json.loads((RAW_GEO / "administrative_2_district.geojson").read_text())

    state_centroids = {}
    for feat in state_geo["features"]:
        props = feat["properties"]
        lat, lon = centroid_of(feat)
        state_centroids[props["state"]] = {
            "code_state": props["code_state"],
            "lat": lat,
            "lon": lon,
        }

    rows = []
    # State-level rows (district fields blank) — lets the lookup double as
    # the single source of truth for BOTH map resolutions.
    for state_name, info in sorted(state_centroids.items(), key=lambda x: x[1]["code_state"]):
        rows.append({
            "state_code": info["code_state"],
            "state_name": state_name,
            "district_code": "",
            "district_name": "",
            "latitude": info["lat"],
            "longitude": info["lon"],
        })

    for feat in district_geo["features"]:
        props = feat["properties"]
        lat, lon = centroid_of(feat)
        rows.append({
            "state_code": props["code_state"],
            "state_name": props["state"],
            "district_code": props["code_district"],
            "district_name": props["district"],
            "latitude": lat,
            "longitude": lon,
        })

    out_csv = OUT_DIR / "geo_lookup.csv"
    with open(out_csv, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=[
            "state_code", "state_name", "district_code", "district_name",
            "latitude", "longitude",
        ])
        w.writeheader()
        w.writerows(rows)

    # Copy-through boundary files (simplify not needed at this dataset's size)
    shutil.copy(RAW_GEO / "administrative_1_state.geojson", OUT_GEO_DIR / "state.geojson")
    shutil.copy(RAW_GEO / "administrative_2_district.geojson", OUT_GEO_DIR / "district.geojson")

    print(f"Wrote {len(rows)} geo_lookup rows ({len(state_centroids)} states, "
          f"{len(rows) - len(state_centroids)} districts) -> {out_csv}")


if __name__ == "__main__":
    main()
