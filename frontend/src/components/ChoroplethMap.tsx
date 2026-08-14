import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import type { Layer, StyleFunction, LeafletMouseEvent, Path } from "leaflet";
import type { Feature, Geometry } from "geojson";
import ChartToolbar from "./ChartToolbar";
import DataTable, { toCSV, downloadCSV, type Column } from "./DataTable";
import { useChat, buildExplainPrompt } from "../lib/chatContext";

export interface ChoroplethDatum {
  name: string; // state or district name, must match geojson `state`/`district` property
  value: number | null;
}

/**
 * Optional 3-bucket overlay config (e.g. the poverty-tier overlay). Buckets
 * a value against `breaks` instead of the default continuous min/max ramp.
 * This is always a dashboard-defined bucketing of a real field, never a
 * separate/invented data source — the caller is responsible for disclosing
 * that in the surrounding UI.
 */
export interface TierConfig {
  breaks: [number, number];
  labels: [string, string, string];
  colors: [string, string, string];
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

function tierIndexFor(value: number | null, breaks: [number, number]): number | null {
  if (value === null || Number.isNaN(value)) return null;
  if (value <= breaks[0]) return 0;
  if (value <= breaks[1]) return 1;
  return 2;
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
  tiers,
}: {
  geojson: GeoJSON.FeatureCollection;
  data: ChoroplethDatum[];
  nameProperty: "state" | "district";
  onSelect?: (name: string) => void;
  selectedName?: string | null;
  unitLabel?: string;
  tiers?: TierConfig;
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
    const tierIdx = tiers ? tierIndexFor(value, tiers.breaks) : null;
    return {
      fillColor: tiers ? (tierIdx !== null ? tiers.colors[tierIdx] : NO_DATA) : colorFor(value, min, max),
      fillOpacity: value === null ? 0.35 : 0.85,
      color: isSelected ? "#0b0b0b" : "#ffffff",
      weight: isSelected ? 2 : 0.8,
    };
  };

  const onEachFeature = (feature: Feature<Geometry>, layer: Layer) => {
    const name = (feature.properties as Record<string, string> | undefined)?.[nameProperty] ?? "Unknown";
    const value = byName.has(name) ? byName.get(name) : null;
    const displayVal = value === null || value === undefined ? "No data" : `${value}${unitLabel ? " " + unitLabel : ""}`;
    const tierIdx = tiers && typeof value === "number" ? tierIndexFor(value, tiers.breaks) : null;
    const tierSuffix = tierIdx !== null && tiers ? ` (${tiers.labels[tierIdx]})` : "";
    layer.bindTooltip(`<strong>${name}</strong><br/>${displayVal}${tierSuffix}`, { sticky: true });
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

  // Table toggle + CSV export. PNG export is deliberately not offered here
  // (unlike BarRankingCard/LineChartCard): the map mixes in cross-origin
  // raster tiles from an external CDN, which taints a <canvas> on export
  // without a dedicated screenshot library — rather than ship a button that
  // silently fails, this component sticks to what a zero-dependency
  // approach can actually deliver (table + CSV).
  const [showTable, setShowTable] = useState(false);
  const { explain } = useChat();
  const tableColumns: Column[] = [
    { key: "name", label: nameProperty === "district" ? "District" : "State" },
    { key: "value", label: unitLabel ? `Value (${unitLabel})` : "Value", numeric: true },
  ];

  function handleExportCSV() {
    const csv = toCSV(tableColumns, data as unknown as Record<string, unknown>[]);
    downloadCSV(`${nameProperty}_map.csv`, csv);
  }

  function handleExplain() {
    const rows = data as unknown as Record<string, unknown>[];
    const csv = toCSV(tableColumns, rows.slice(0, 60));
    const mapTitle = `${nameProperty === "district" ? "District" : "State"} map${unitLabel ? ` (${unitLabel})` : ""}`;
    explain(buildExplainPrompt(mapTitle, csv, rows.length));
  }

  return (
    <div>
      <ChartToolbar
        showingTable={showTable}
        onToggleTable={() => setShowTable((v) => !v)}
        onExportCSV={handleExportCSV}
        onExplain={handleExplain}
      />
      {showTable ? (
        <DataTable columns={tableColumns} rows={data as unknown as Record<string, unknown>[]} searchable pageSize={20} />
      ) : (
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
            <GeoJSON
              key={`geo-${data.length}-${min}-${max}-${tiers ? tiers.breaks.join(",") : "ramp"}`}
              data={geojson}
              style={style}
              onEachFeature={onEachFeature}
            />
            <FitBounds geojson={geojson} />
          </MapContainer>
        </div>
      )}
      {!showTable && tiers && (
        <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-ink-secondary">
          {tiers.labels.map((label, i) => (
            <span key={label} className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded-sm"
                style={{ backgroundColor: tiers.colors[i] }}
                aria-hidden="true"
              />
              {label}
              {i === 0 && ` (≤ ${fmtBreak(tiers.breaks[0])})`}
              {i === 1 && ` (${fmtBreak(tiers.breaks[0])}–${fmtBreak(tiers.breaks[1])})`}
              {i === 2 && ` (> ${fmtBreak(tiers.breaks[1])})`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function fmtBreak(v: number): string {
  return v.toLocaleString(undefined, { maximumFractionDigits: 1 });
}
