"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import type { ImageSource, Map as MapLibreMap, Marker, StyleSpecification } from "maplibre-gl";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useI18n } from "@/lib/i18n";
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
  /** Arranca en proyección de globo sobre este punto y vuela hasta el sitio (transición desde el planeta). */
  intro?: { lat: number; lon: number; screen?: () => { x: number; y: number; r: number } | null };
  /** Se llama cuando el mapa ya se colocó igual que el planeta y empieza el vuelo (para el fundido). */
  onReady?: () => void;
  /** Vista 3D a ras de suelo: relieve, cámara inclinada y colores naturales. */
  terrain?: boolean;
  /** Imagen de fondo: Esri (alta resolución) o Sentinel-2 sin nubes 2024 (EOX). */
  basemap?: "esri" | "s2";
  /** Puntos a vigilar (tendencia más rápida). */
  hotspots?: { lat: number; lon: number; value: number }[];
  /** Posición del deslizador antes/después controlada desde fuera (0–100). */
  splitValue?: number;
  /** Margen del encuadre (p. ej. para dejar libre el panel lateral). */
  padding?: { top: number; right: number; bottom: number; left: number };
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
    s2: {
      type: "raster",
      tiles: ["https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg"],
      tileSize: 256,
      maxzoom: 15,
      attribution: "Sentinel-2 cloudless 2024 © EOX IT Services GmbH (datos Copernicus Sentinel modificados, CC BY-NC-SA 4.0)",
    },
    dem: {
      type: "raster-dem",
      tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
      encoding: "terrarium",
      tileSize: 256,
      maxzoom: 14,
      attribution: "Relieve: Mapzen Terrain Tiles (AWS Open Data)",
    },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#0b151e" } },
    { id: "imagery", type: "raster", source: "imagery", paint: { "raster-saturation": -0.45, "raster-brightness-max": 0.78, "raster-contrast": 0.05, "raster-saturation-transition": { duration: 900 }, "raster-brightness-max-transition": { duration: 900 } } as never },
    { id: "s2", type: "raster", source: "s2", layout: { visibility: "none" }, paint: { "raster-saturation": -0.2, "raster-brightness-max": 0.9 } },
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

const EMPTY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

function addNisarLayer(map: MapLibreMap, url: string, bbox: Bbox, opacity: number) {
  map.addSource("nisar", { type: "image", url: url || EMPTY_PNG, coordinates: corners(bbox) });
  // fundido largo: los cambios de fecha se ven progresivos
  map.addLayer({ id: "nisar", type: "raster", source: "nisar", paint: { "raster-opacity": opacity, "raster-fade-duration": 650, "raster-resampling": "linear" } });
  map.addSource("hotspots", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({ id: "hotspots-glow", type: "circle", source: "hotspots", paint: { "circle-radius": 18, "circle-color": "#f43f5e", "circle-opacity": 0.18, "circle-blur": 0.6 } });
  map.addLayer({ id: "hotspots-core", type: "circle", source: "hotspots", paint: { "circle-radius": 5, "circle-color": "#ffffff", "circle-stroke-color": "#f43f5e", "circle-stroke-width": 2.5 } });
  map.addSource("aoi", { type: "geojson", data: outline(bbox) });
  map.addLayer({ id: "aoi", type: "line", source: "aoi", paint: { "line-color": "#79d3d3", "line-width": 1.5, "line-dasharray": [3, 2], "line-opacity": 0.85 } });
}

function updateNisarLayer(map: MapLibreMap | null, url: string, bbox: Bbox, opacity: number) {
  if (!map || !map.getSource("nisar")) return;
  (map.getSource("nisar") as ImageSource).updateImage({ url: url || EMPTY_PNG, coordinates: corners(bbox) });
  map.setPaintProperty("nisar", "raster-opacity", opacity);
  const aoi = map.getSource("aoi") as { setData?: (data: unknown) => void } | undefined;
  aoi?.setData?.(outline(bbox));
}

export default function NisarMap({ bbox, layerUrl, beforeUrl, mode, opacity, pick, onPick, recenterKey, intro, hotspots, splitValue, padding, onReady, terrain = false, basemap = "esri" }: NisarMapProps) {
  const { t } = useI18n();
  const mainRef = useRef<HTMLDivElement>(null);
  const afterRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const afterMapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onPickRef = useRef(onPick);
  const [ready, setReady] = useState(false);
  // Deslizador antes/después con movimiento gradual: la línea persigue al objetivo con inercia
  const [split, setSplit] = useState(96);
  const splitShown = useRef(96);
  const splitTarget = useRef(50);
  const splitFrame = useRef(0);
  const animateSplit = useCallback(() => {
    cancelAnimationFrame(splitFrame.current);
    const tick = () => {
      const diff = splitTarget.current - splitShown.current;
      splitShown.current += diff * 0.07; // avance pausado, sin saltos
      if (Math.abs(diff) < 0.04) splitShown.current = splitTarget.current;
      setSplit(splitShown.current);
      if (splitShown.current !== splitTarget.current) splitFrame.current = requestAnimationFrame(tick);
    };
    splitFrame.current = requestAnimationFrame(tick);
  }, []);
  const moveSplitTo = useCallback((value: number) => {
    splitTarget.current = Math.min(96, Math.max(4, value));
    animateSplit();
  }, [animateSplit]);
  // al entrar en modo comparación, la línea se abre sola desde la derecha hasta el centro
  useEffect(() => {
    if (mode !== "swipe") return;
    splitShown.current = 96;
    moveSplitTo(50);
    return () => cancelAnimationFrame(splitFrame.current);
  }, [mode, moveSplitTo]);
  const [failed, setFailed] = useState(false);
  const initial = useRef({ bbox, layerUrl, beforeUrl, opacity, mode, intro });
  const flewIn = useRef(false);
  const paddingRef = useRef(padding ?? { top: 40, right: 40, bottom: 40, left: 40 });
  useEffect(() => {
    paddingRef.current = padding ?? { top: 40, right: 40, bottom: 40, left: 40 };
  }, [padding]);
  // posición del deslizador controlada desde el panel
  useEffect(() => {
    if (splitValue === undefined || mode !== "swipe") return;
    moveSplitTo(splitValue);
  }, [splitValue, mode, moveSplitTo]);

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
      // con "intro" el mapa nace como globo sobre la zona y luego vuela hasta ella
      const style: StyleSpecification = start.intro ? { ...baseStyle, projection: { type: "globe" } } : baseStyle;
      const view = start.intro
        ? { center: [start.intro.lon, start.intro.lat] as [number, number], zoom: 1.7 }
        : { bounds: start.bbox, fitBoundsOptions: { padding: 40 } };
      const common = { style, ...view, attributionControl: false as const, maxZoom: 16, maxPitch: 80 };
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
        after.jumpTo({ center: main.getCenter(), zoom: main.getZoom(), bearing: main.getBearing(), pitch: main.getPitch(), padding: main.getPadding() });
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

  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  });

  // Encuadrar el sitio al cambiarlo o al pulsar "Centrar"
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const intro = initial.current.intro;
    const first = !flewIn.current && !!intro;
    flewIn.current = true;
    if (first && intro) {
      // El mapa nace con el mismo tamaño y posición que el planeta 3D: el fundido entre ambos no se nota
      const globe = intro.screen?.();
      if (globe && globe.r > 20) {
        const rect = map.getContainer().getBoundingClientRect();
        const dx = globe.x - (rect.left + rect.width / 2);
        const dy = globe.y - (rect.top + rect.height / 2);
        const zoom = Math.log2((2 * Math.PI * globe.r * Math.cos((intro.lat * Math.PI) / 180)) / 512);
        map.jumpTo({
          center: [intro.lon, intro.lat], zoom: Math.max(0, zoom),
          padding: { left: Math.max(0, 2 * dx), right: Math.max(0, -2 * dx), top: Math.max(0, 2 * dy), bottom: Math.max(0, -2 * dy) },
        });
      }
      onReadyRef.current?.();
    }
    // vuelo continuo: arranca con velocidad (sigue el movimiento de la cámara 3D) y frena suave al llegar
    map.fitBounds(bbox, {
      padding: paddingRef.current, duration: first ? 3800 : 1600, curve: 1.42, essential: true,
      easing: first ? (x: number) => 1 - Math.pow(1 - x, 2.4) : undefined,
    });
  }, [ready, bbox, recenterKey]);

  // Vista 3D a ras de suelo: relieve exagerado, cámara inclinada y colores naturales
  const terrainOn = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    const after = afterMapRef.current;
    if (!ready || !map || terrainOn.current === terrain) return;
    terrainOn.current = terrain;
    for (const m of [map, after]) {
      if (!m) continue;
      try {
        m.setTerrain(terrain ? { source: "dem", exaggeration: 1.5 } : null);
      } catch {
        /* sin relieve: la vista inclinada sigue funcionando */
      }
      m.setPaintProperty("imagery", "raster-saturation", terrain ? 0 : -0.45);
      m.setPaintProperty("imagery", "raster-brightness-max", terrain ? 1 : 0.78);
    }
    const target = pick ?? { lon: (bbox[0] + bbox[2]) / 2, lat: (bbox[1] + bbox[3]) / 2 };
    if (terrain) {
      map.flyTo({ center: [target.lon, target.lat], zoom: 14.2, pitch: 74, bearing: map.getBearing() - 35, padding: paddingRef.current, duration: 4200, curve: 1.3, essential: true });
    } else {
      map.fitBounds(bbox, { padding: paddingRef.current, pitch: 0, bearing: 0, duration: 2200, essential: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, terrain]);

  // Imagen de fondo
  useEffect(() => {
    if (!ready) return;
    for (const m of [mapRef.current, afterMapRef.current]) {
      if (!m?.getLayer("s2")) continue;
      m.setLayoutProperty("s2", "visibility", basemap === "s2" ? "visible" : "none");
    }
  }, [ready, basemap]);

  // Puntos a vigilar
  useEffect(() => {
    if (!ready) return;
    const data = {
      type: "FeatureCollection" as const,
      features: (hotspots ?? []).map((h) => ({ type: "Feature" as const, properties: { value: h.value }, geometry: { type: "Point" as const, coordinates: [h.lon, h.lat] } })),
    };
    for (const map of [mapRef.current, afterMapRef.current]) {
      (map?.getSource("hotspots") as { setData?: (d: unknown) => void } | undefined)?.setData?.(data);
    }
  }, [ready, hotspots]);

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
    const move = (clientX: number) => moveSplitTo(((clientX - box.left) / box.width) * 100);
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
            aria-label={t.compare}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(split)}
            onPointerDown={dragSplit}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") moveSplitTo(splitTarget.current - 6);
              if (event.key === "ArrowRight") moveSplitTo(splitTarget.current + 6);
            }}
          >
            <span>‹</span><span>›</span>
          </div>
          <span className="swipe-tag swipe-before">{t.beforeTag}</span>
          <span className="swipe-tag swipe-after">{t.afterTag}</span>
        </div>
      )}
      {failed && <div className="map-fallback">{t.mapFailed}</div>}
    </div>
  );
}
