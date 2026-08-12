import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import type { Layer, StyleFunction, LeafletMouseEvent, Path } from "leaflet";
import type { Feature, Geometry } from "geojson";

export interface ChoroplethDatum {
  name: string; // state or district name, must match geojson `state`/`district` property
  value: number | null;
}

/**
 * Generic Malaysia choropleth (state or district resolution) driven by the
 * official DOSM boundary GeoJSON files in /data/geo/. Colour is a single-hue
 * sequential ramp (per dataviz skill: sequential = one hue, light->dark);
 * null/no-data areas render in a flat neutral grey with a hatch-free "no
 * data" fill rather than being silently omitted.
 */
const SEQ_RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#2a78d6", "#1c5cab", "#0d366b"];
const NO_DATA = "#e1e0d9";

function colorFor(value: number | null, min: number, max: number) {
  if (value === null || Number.isNaN(value)) return NO_DATA;
  if (max === min) return SEQ_RAMP[3];
  const t = (value - min) / (max - min);
  const idx = Math.min(SEQ_RAMP.length - 1, Math.max(0, Math.round(t * (SEQ_RAMP.length - 1))));
  return SEQ_RAMP[idx];
}

function FitBounds({ geojson }: { geojson: GeoJSON.FeatureCollection }) {
  const map = useMap();
  useEffect(() => {
    if (!geojson.features.length) return;
    const layer = L.geoJSON(geojson);
    try {
      map.fitBounds(layer.getBounds(), { padding: [12, 12] });
    } catch {
      /* ignore */
    }
  }, [geojson, map]);
  return null;
}

export default function ChoroplethMap({
  geojson,
  data,
  nameProperty,
  onSelect,
  selectedName,
  unitLabel,
}: {
  geojson: GeoJSON.FeatureCollection;
  data: ChoroplethDatum[];
  nameProperty: "state" | "district";
  onSelect?: (name: string) => void;
  selectedName?: string | null;
  unitLabel?: string;
}) {
  const byName = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const d of data) m.set(d.name, d.value);
    return m;
  }, [data]);

  const { min, max } = useMemo(() => {
    const vals = data.map((d) => d.value).filter((v): v is number => v !== null && !Number.isNaN(v));
    if (!vals.length) return { min: 0, max: 1 };
    return { min: Math.min(...vals), max: Math.max(...vals) };
  }, [data]);

  const style: StyleFunction<Feature<Geometry>> = (feature) => {
    const name = (feature?.properties as Record<string, string> | undefined)?.[nameProperty] ?? "";
    const value = byName.has(name) ? byName.get(name)! : null;
    const isSelected = selectedName && name === selectedName;
    return {
      fillColor: colorFor(value, min, max),
      fillOpacity: value === null ? 0.35 : 0.85,
      color: isSelected ? "#0b0b0b" : "#ffffff",
      weight: isSelected ? 2 : 0.8,
    };
  };

  const onEachFeature = (feature: Feature<Geometry>, layer: Layer) => {
    const name = (feature.properties as Record<string, string> | undefined)?.[nameProperty] ?? "Unknown";
    const value = byName.has(name) ? byName.get(name) : null;
    const displayVal = value === null || value === undefined ? "No data" : `${value}${unitLabel ? " " + unitLabel : ""}`;
    layer.bindTooltip(`<strong>${name}</strong><br/>${displayVal}`, { sticky: true });
    layer.on({
      click: () => onSelect?.(name),
      mouseover: (e: LeafletMouseEvent) => (e.target as Path).setStyle({ weight: 2, color: "#0b0b0b" }),
      mouseout: (e: LeafletMouseEvent) => {
        if (name !== selectedName) (e.target as Path).setStyle({ weight: 0.8, color: "#ffffff" });
      },
    });
  };

  const keyRef = useRef(0);
  keyRef.current += 1;

  return (
    <div className="h-[480px] w-full overflow-hidden rounded-lg border border-line-grid">
      <MapContainer
        center={[4.2, 108.5]}
        zoom={5.5}
        scrollWheelZoom={false}
        style={{ background: "#fcfcfb" }}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
          attribution="&copy; OpenStreetMap contributors &copy; CARTO"
        />
        <GeoJSON key={`geo-${data.length}-${min}-${max}`} data={geojson} style={style} onEachFeature={onEachFeature} />
        <FitBounds geojson={geojson} />
      </MapContainer>
    </div>
  );
}
