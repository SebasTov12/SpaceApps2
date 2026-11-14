"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { ImageSource, Map as MapLibreMap, Marker, StyleSpecification } from "maplibre-gl";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Bbox } from "@/lib/sites";

export type MapMode = "single" | "swipe" | "change";

type NisarMapProps = {
  bbox: Bbox;
  /** Capa principal (fecha seleccionada, o mapa de cambio). */
  layerUrl: string;
  /** Capa "antes" del modo comparación. */
  beforeUrl?: string;
  mode: MapMode;
  opacity: number;
  pick: { lon: number; lat: number } | null;
  onPick: (point: { lon: number; lat: number }) => void;
  /** Cambia para pedir que el mapa vuelva a encuadrar el sitio. */
  recenterKey: number;
};

const baseStyle: StyleSpecification = {
  version: 8,
  sources: {
    imagery: {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 18,
      attribution: "Imágenes © Esri, Maxar, Earthstar Geographics",
    },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#0b151e" } },
    { id: "imagery", type: "raster", source: "imagery", paint: { "raster-saturation": -0.45, "raster-brightness-max": 0.78, "raster-contrast": 0.05 } },
  ],
};

const corners = ([west, south, east, north]: Bbox): [[number, number], [number, number], [number, number], [number, number]] => [
  [west, north], [east, north], [east, south], [west, south],
];

const outline = (bbox: Bbox) => ({
  type: "Feature" as const,
  properties: {},
  geometry: { type: "LineString" as const, coordinates: [...corners(bbox), corners(bbox)[0]] },
});

function addNisarLayer(map: MapLibreMap, url: string, bbox: Bbox, opacity: number) {
  map.addSource("nisar", { type: "image", url, coordinates: corners(bbox) });
  map.addLayer({ id: "nisar", type: "raster", source: "nisar", paint: { "raster-opacity": opacity, "raster-fade-duration": 250, "raster-resampling": "linear" } });
  map.addSource("aoi", { type: "geojson", data: outline(bbox) });
  map.addLayer({ id: "aoi", type: "line", source: "aoi", paint: { "line-color": "#79d3d3", "line-width": 1.5, "line-dasharray": [3, 2], "line-opacity": 0.85 } });
}

function updateNisarLayer(map: MapLibreMap | null, url: string, bbox: Bbox, opacity: number) {
  if (!map || !map.getSource("nisar")) return;
  (map.getSource("nisar") as ImageSource).updateImage({ url, coordinates: corners(bbox) });
  map.setPaintProperty("nisar", "raster-opacity", opacity);
  const aoi = map.getSource("aoi") as { setData?: (data: unknown) => void } | undefined;
  aoi?.setData?.(outline(bbox));
}

export default function NisarMap({ bbox, layerUrl, beforeUrl, mode, opacity, pick, onPick, recenterKey }: NisarMapProps) {
  const mainRef = useRef<HTMLDivElement>(null);
  const afterRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const afterMapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onPickRef = useRef(onPick);
  const [ready, setReady] = useState(false);
  const [split, setSplit] = useState(50);
  const [failed, setFailed] = useState(false);
  const initial = useRef({ bbox, layerUrl, beforeUrl, opacity, mode });

  useEffect(() => {
    onPickRef.current = onPick;
  });

  // Crear los dos mapas una sola vez
  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    import("maplibre-gl").then(({ Map, Marker, NavigationControl, ScaleControl, AttributionControl, setWorkerUrl }) => {
      if (cancelled || !mainRef.current || !afterRef.current) return;
      // copiado por scripts/copy-maplibre-worker.mjs (predev / prebuild)
      setWorkerUrl("/maplibre-gl-worker.mjs");
      const start = initial.current;
      const common = { style: baseStyle, bounds: start.bbox, fitBoundsOptions: { padding: 40 }, attributionControl: false as const, maxZoom: 16 };
      let main: MapLibreMap;
      try {
        main = new Map({ container: mainRef.current, ...common });
      } catch {
        setFailed(true);
        return;
      }
      const after = new Map({ container: afterRef.current, ...common, interactive: false });
      main.addControl(new NavigationControl({ showCompass: false }), "top-right");
      main.addControl(new ScaleControl({ unit: "metric" }), "bottom-right");
      main.addControl(new AttributionControl({ compact: true }), "bottom-right");

      const marker = new Marker({ color: "#e8b36b" });
      markerRef.current = marker;

      // "ready" cuando ambos mapas cargaron su estilo; después los efectos sincronizan capas
      let loaded = 0;
      const markLoaded = () => {
        loaded += 1;
        if (loaded === 2) setReady(true);
      };
      // "style.load" no espera a las teselas del fondo: la capa NISAR aparece aunque el mapa base tarde
      main.once("style.load", () => {
        const showBefore = start.mode === "swipe" && start.beforeUrl;
        addNisarLayer(main, showBefore ? start.beforeUrl! : start.layerUrl, start.bbox, start.opacity);
        markLoaded();
      });
      after.once("style.load", () => {
        addNisarLayer(after, start.layerUrl, start.bbox, start.opacity);
        markLoaded();
      });
      main.on("move", () => {
        after.jumpTo({ center: main.getCenter(), zoom: main.getZoom(), bearing: main.getBearing(), pitch: main.getPitch() });
      });
      main.on("click", (event) => onPickRef.current({ lon: event.lngLat.lng, lat: event.lngLat.lat }));
      main.getCanvas().style.cursor = "crosshair";

      mapRef.current = main;
      afterMapRef.current = after;
      cleanup = () => {
        marker.remove();
        main.remove();
        after.remove();
      };
    }).catch(() => setFailed(true));
    return () => {
      cancelled = true;
      cleanup();
      mapRef.current = null;
      afterMapRef.current = null;
    };
  }, []);

  // Capas según el modo: en "swipe" el mapa de abajo muestra "antes" y el de arriba "después"
  useEffect(() => {
    if (!ready) return;
    const bottomUrl = mode === "swipe" && beforeUrl ? beforeUrl : layerUrl;
    updateNisarLayer(mapRef.current, bottomUrl, bbox, opacity);
    updateNisarLayer(afterMapRef.current, layerUrl, bbox, opacity);
  }, [ready, mode, layerUrl, beforeUrl, bbox, opacity]);

  // Encuadrar el sitio al cambiarlo o al pulsar "Centrar"
  useEffect(() => {
    if (!ready) return;
    mapRef.current?.fitBounds(bbox, { padding: 40, duration: 1600, essential: true });
  }, [ready, bbox, recenterKey]);

  // Marcador del punto seleccionado
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker || !ready) return;
    if (pick) marker.setLngLat([pick.lon, pick.lat]).addTo(map);
    else marker.remove();
  }, [pick, ready]);

  const dragSplit = (event: ReactPointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!box) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (clientX: number) => setSplit(Math.min(96, Math.max(4, ((clientX - box.left) / box.width) * 100)));
    move(event.clientX);
    const handle = event.currentTarget;
    const onMove = (e: PointerEvent) => move(e.clientX);
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  };

  return (
    <div className={`nisar-map mode-${mode}`}>
      <div ref={mainRef} className="nisar-map-canvas" />
      <div ref={afterRef} className="nisar-map-canvas nisar-map-after" style={{ clipPath: `inset(0 0 0 ${split}%)` }} aria-hidden="true" />
      {mode === "swipe" && (
        <div className="swipe-handle" style={{ left: `${split}%` }}>
          <div
            className="swipe-grip"
            role="slider"
            tabIndex={0}
            aria-label="Comparar antes y después"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(split)}
            onPointerDown={dragSplit}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") setSplit((value) => Math.max(4, value - 4));
              if (event.key === "ArrowRight") setSplit((value) => Math.min(96, value + 4));
            }}
          >
            <span>‹</span><span>›</span>
          </div>
          <span className="swipe-tag swipe-before">Antes</span>
          <span className="swipe-tag swipe-after">Después</span>
        </div>
      )}
      {failed && <div className="map-fallback">No se pudo iniciar el mapa (WebGL no disponible).</div>}
    </div>
  );
}
