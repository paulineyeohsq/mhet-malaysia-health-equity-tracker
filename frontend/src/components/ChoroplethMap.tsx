import { useEffect, useMemo, useState } from "react";
import { MapContainer, GeoJSON, AttributionControl, useMap } from "react-leaflet";
import L from "leaflet";
import type { Layer, StyleFunction, LeafletMouseEvent, Path } from "leaflet";
import type { Feature, Geometry } from "geojson";
import ChartToolbar from "./ChartToolbar";
import DataTable, { type Column } from "./DataTable";
import { toCSV, downloadCSV } from "../lib/csv";
import { useChat, buildExplainPrompt } from "../lib/chatCore";
import { SEQ_RAMP, NO_DATA, MAP_BACKGROUND, outlineFor } from "../lib/mapColors";

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

/**
 * Fits the map to the boundary data, and keeps it fitted when its container changes size.
 * Fitting only once left the map stuck at world-zoom (a Malaysia a few pixels wide in a
 * large box) whenever it was created while its container was tiny or hidden — a collapsed
 * layout, a hidden pane or tab, a window opened narrow and then widened — because
 * fitBounds computed its zoom for the tiny size and nothing ever re-ran it. Containers
 * under MIN_FIT_PX are skipped (no meaningful fit exists); the observer fires again once
 * the container has a real size.
 */
const MIN_FIT_PX = 80;
function FitBounds({ geojson }: { geojson: GeoJSON.FeatureCollection }) {
  const map = useMap();
  useEffect(() => {
    if (!geojson.features.length) return;
    const bounds = L.geoJSON(geojson).getBounds();
    const fit = () => {
      map.invalidateSize();
      const size = map.getSize();
      if (size.x < MIN_FIT_PX || size.y < MIN_FIT_PX) return;
      try {
        // reset:true forces a full re-projection. Without it, when the container grows but the
        // fitted view happens to be unchanged, Leaflet's SVG layer keeps the size it had for the
        // tiny container (every state drawn as an empty path).
        // `reset` is honoured by Leaflet's setView (which fitBounds forwards its options to) and is in
        // ZoomPanOptions, but is missing from the FitBoundsOptions typings - hence the assertion.
        map.fitBounds(bounds, { padding: [12, 12], animate: false, reset: true } as L.FitBoundsOptions);
      } catch {
        /* ignore */
      }
    };
    fit();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(fit, 120);
    });
    observer.observe(map.getContainer());
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
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
  label,
}: {
  geojson: GeoJSON.FeatureCollection;
  data: ChoroplethDatum[];
  nameProperty: "state" | "district";
  onSelect?: (name: string) => void;
  selectedName?: string | null;
  unitLabel?: string;
  tiers?: TierConfig;
  /** What the map shows, for its accessible name (e.g. "Absolute poverty rate"). */
  label?: string;
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
    const fillColor = tiers ? (tierIdx !== null ? tiers.colors[tierIdx] : NO_DATA) : colorFor(value, min, max);
    return {
      fillColor,
      fillOpacity: value === null ? 0.35 : 0.85,
      // Outline is chosen per region so its edge contrasts with its own fill (white on dark steps, near-black on pale).
      color: isSelected ? "#0b0b0b" : outlineFor(fillColor),
      weight: isSelected ? 3 : 1,
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
        if (name !== selectedName) (e.target as Path).setStyle(style(feature as unknown as Parameters<typeof style>[0]) as L.PathOptions);
      },
    });
  };

  // Table toggle + CSV export. PNG export is deliberately not offered for the
  // map: Leaflet draws it as live SVG/DOM layers rather than a canvas, so a
  // faithful image would need a dedicated screenshot library - rather than ship
  // a button that silently fails, this component sticks to what a
  // zero-dependency approach can actually deliver (table + CSV).
  const [showTable, setShowTable] = useState(false);
  const { explain } = useChat();

  // Text alternative for the drawing: how many areas have a value, the extremes, and how many are blank.
  const mapSummary = useMemo(() => {
    const withValue = data.filter((d): d is ChoroplethDatum & { value: number } => d.value !== null && !Number.isNaN(d.value));
    if (withValue.length === 0) return "No area has a value for this selection.";
    const sorted = [...withValue].sort((a, b) => a.value - b.value);
    const fmtV = (v: number) => `${v}${unitLabel ? " " + unitLabel : ""}`;
    const blank = data.length - withValue.length;
    return (
      `${withValue.length} ${nameProperty}s have a value. Highest: ${sorted[sorted.length - 1].name}, ${fmtV(sorted[sorted.length - 1].value)}. ` +
      `Lowest: ${sorted[0].name}, ${fmtV(sorted[0].value)}.` +
      (blank > 0 ? ` ${blank} have no data.` : "") +
      " Use View as table for every value."
    );
  }, [data, nameProperty, unitLabel]);
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
        <div
          role="region"
          aria-label={`Map of ${label ?? "values"} by ${nameProperty}`}
          aria-describedby="choropleth-summary"
          className="h-[480px] w-full overflow-hidden rounded-lg border border-line-grid"
        >
          <p id="choropleth-summary" className="sr-only">
            {mapSummary}
          </p>
          <MapContainer
            center={[4.2, 108.5]}
            zoom={5.5}
            scrollWheelZoom={false}
            zoomSnap={0.25}
            style={{ background: MAP_BACKGROUND }}
            attributionControl={false}
          >
            {/* No basemap on purpose. This map used to draw raster tiles from a third-party server (CARTO, then
                OpenStreetMap). Public tile servers are not meant for production traffic - CARTO started answering
                every request with an "API KEY REQUIRED" placeholder image, and OSM's tile policy limits heavy use -
                and each tile request also exposed the visitor's IP address to that server. The DOSM boundary
                polygons alone already show where each state/district is, so the map now depends on nothing outside
                this site. Attribution for the boundary data stays visible via the control below. */}
            <AttributionControl prefix={false} position="bottomright" />
            <GeoJSON
              key={`geo-${data.length}-${min}-${max}-${tiers ? tiers.breaks.join(",") : "ramp"}`}
              data={geojson}
              attribution="Boundaries: DOSM open data"
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
