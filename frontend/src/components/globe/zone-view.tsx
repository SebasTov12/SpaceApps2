"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowLeft, Box, Database, Info, MapPin, MapPinned, MousePointerClick, Radar, Sparkles, TrendingUp } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import TimeSeriesChart from "@/components/time-series-chart";
import TerritorialImpact from "./territorial-impact";
import ZoneSimple from "./zone-simple";
import { HAZARD_POINT_SELECT, hazardPointId, loadHazardPoints, pointCountry, type HazardPoint } from "@/lib/hazard-points";
import { POINT_EVENT, ZONE_CHAT_OPEN_EVENT, ZONE_DETAILS_OPEN_EVENT } from "./saro-guide";
import { TOUR_EVENT, type LegendKind, type SaroAction, type TourKey } from "@/lib/saro-brain";
import type { MapMode, Scene3D } from "@/components/nisar-map";
import { levelInfo } from "@/lib/insights";
import { ProtectedTerms, useI18n } from "@/lib/i18n";
import { riskKindLabel, riskKinds, riskZones, type RiskZone } from "@/lib/risk-zones";
import { sectorImpacts } from "@/lib/sector-impacts";
import {
  formatCoord, loadAvailability, loadManifest, loadTimeSeries, longDate, radarExplainer, seriesAt, shortDate, strongestChange,
  type AttentionLevel, type Availability, type Bbox, type SiteManifest, type TimeSeries,
} from "@/lib/sites";
import { GLOBE_SELECT, SITE_EVENT, closeZone, focusZone, globeState } from "./globe-state";

const NisarMap = dynamic(() => import("@/components/nisar-map"), { ssr: false, loading: () => <div className="map-loading" /> });

const copy = {
  es: {
    back: "Volver al planeta", close: "Cerrar zona", zones: "Zonas de riesgo", zonesHint: "Elige una zona para acercar el planeta",
    showDetails: "Abrir análisis y datos", hideDetails: "Cerrar análisis y datos",
    simple: "Vista simple", analysis: "Análisis", now: "Qué está pasando", history: "Qué pasó aquí", todo: "Qué hacer",
    watch: (n: number) => `${n} puntos a vigilar marcados en el mapa: allí el cambio reciente es más rápido.`,
    noData: "Zona de interés: aún sin capas NISAR procesadas. La vista muestra la imagen satelital del lugar.",
    noDataNow: "Sin serie de datos todavía para calcular la tendencia en esta zona.",
    withData: "Zonas con datos", clickMap: "Toca el mapa para ver la evolución de un punto",
    noPointSeries: "No hay una serie temporal disponible en esta coordenada. El marcador solo indica el lugar seleccionado.",
    areaNote: "Área de la escena/capa · no es el límite exacto de la afectación",
    asf: "Escenas NISAR reales en ASF", demo: "DEMO", real: "NISAR", accel: "Aceleración detectada",
    trend: "Tendencia", early: "Ritmo inicial", recent: "Ritmo reciente", p30: "Proyección 30 días", p90: "Proyección 90 días",
    compare: "Antes · después", opacity: "Opacidad de la capa", loading: "Acercando a la zona…",
    explore: "Explorar el lugar", view3d: "Activar vista 3D a ras de suelo", view2d: "Volver a vista desde arriba",
    street: "Abrir esta ubicación en Google Maps", streetHint: "Abre esta ubicación en Google Maps y Street View, si hay cobertura",
    watchTitle: "Señales de extracción", suspicious: "Cambio sospechoso", conf: "confianza",
    watchNote: "SAROS detecta el cambio en el terreno; no identifica responsables ni dice si es legal. Requiere verificación en campo.",
    lost: "Bosque perdido", recent30: "Últimos 30 días", pits: "Piscinas nuevas", river: "Agua en el área", ha: "ha",
    cross: "Cruce con capas oficiales (demo)", title: "Título minero", protectedA: "Área protegida", territory: "Territorio", riverL: "Río",
    titleOut: "fuera de títulos", titlePart: "parcialmente fuera", none: "no",
    notify: "A quién avisar", notifyList: ["Autoridad ambiental regional (CAR)", "Parques Nacionales, si toca un área protegida", "Consejo comunitario o cabildo del territorio", "Fiscalía o Policía ambiental, ante un posible delito ambiental"],
    impact: "Cómo afectaría a la región", impactIntro: "Si el cambio del terreno continúa, estos sectores son los más expuestos:", reinforce: "Cómo reforzar",
    impactNote: "Escenario ilustrativo (DEMO): muestra exposición posible, no daños confirmados ni probabilidades. SAROS no predice terremotos.",
  },
  en: {
    back: "Back to the planet", close: "Close zone", zones: "Risk zones", zonesHint: "Pick a zone to zoom the planet",
    showDetails: "Open analysis and data", hideDetails: "Close analysis and data",
    simple: "Simple view", analysis: "Analysis", now: "What is happening", history: "What happened here", todo: "What to do",
    watch: (n: number) => `${n} watch points on the map: recent change is fastest there.`,
    noData: "Zone of interest: no NISAR layers processed yet. The view shows the satellite image of the place.",
    noDataNow: "No data series yet to compute a trend for this zone.",
    withData: "Zones with data", clickMap: "Tap the map to see a point over time",
    noPointSeries: "No time series is available at these coordinates. The marker only shows the selected location.",
    areaNote: "Scene/layer footprint · not the exact event boundary",
    asf: "Real NISAR scenes at ASF", demo: "DEMO", real: "NISAR", accel: "Acceleration detected",
    trend: "Trend", early: "Early rate", recent: "Recent rate", p30: "30-day projection", p90: "90-day projection",
    compare: "Before · after", opacity: "Layer opacity", loading: "Zooming into the zone…",
    explore: "Explore the place", view3d: "Enable 3D ground-level view", view2d: "Return to top-down view",
    street: "Open this location in Google Maps", streetHint: "Opens this location in Google Maps and Street View, where covered",
    watchTitle: "Extraction signals", suspicious: "Suspicious change", conf: "confidence",
    watchNote: "SAROS detects ground change; it does not identify who is responsible or whether it is legal. Field verification required.",
    lost: "Forest lost", recent30: "Last 30 days", pits: "New ponds", river: "Water in the area", ha: "ha",
    cross: "Cross-check with official layers (demo)", title: "Mining title", protectedA: "Protected area", territory: "Territory", riverL: "River",
    titleOut: "outside titles", titlePart: "partly outside", none: "no",
    notify: "Who to notify", notifyList: ["Regional environmental authority", "National Parks, if it touches a protected area", "Community council or indigenous authority", "Prosecutors or environmental police for a possible crime"],
    impact: "How it could affect the region", impactIntro: "If the ground change continues, these sectors are the most exposed:", reinforce: "How to reinforce",
    impactNote: "Illustrative scenario (DEMO): shows possible exposure, not confirmed damage or probabilities. SAROS does not predict earthquakes.",
  },
};


/** Qué significa cada color, según el tipo de capa (lo muestra Saro con una tarjeta animada). */
const EXPLAIN: Record<LegendKind, [string, string][]> = {
  deformation: [["#b8322a", "Rojo: el suelo se aleja del satélite (baja o se desliza)"], ["#f3f6f4", "Blanco: sin cambio"], ["#245f9e", "Azul: el suelo se acerca (sube)"]],
  forest: [["#2f7d3a", "Verde: bosque en pie"], ["#9a6b3d", "Café: suelo sin árboles"], ["#10141f", "Muy oscuro: agua quieta"]],
  mining: [["#2f7d3a", "Verde: bosque en pie"], ["#9a6b3d", "Café: bosque talado alrededor"], ["#10141f", "Manchas oscuras junto al río: piscinas mineras"]],
  flood: [["#10141f", "Muy oscuro: agua"], ["#6fa8e8", "Si la mancha crece entre pasadas, la inundación aumenta"]],
  velocity: [["#bfe9f2", "Claro: hielo lento"], ["#245f9e", "Intenso: hielo que se mueve rápido"]],
};

const MAP_DELAY = 250;   // ms: el mapa empieza a cargar oculto mientras la cámara 3D se acerca
const MIN_APPROACH = 950; // ms: la zambullida empieza cuando la cámara ya llegó cerca
const HAZE_PEAK = 480;    // ms tras la zambullida: la bruma tapa el cambio y aparece el mapa

/** El relieve y el encuadre varían por lugar; los edificios se cargan por coordenadas en todo el mapa. */
function sceneFor(kind: RiskZone["kind"]): Scene3D {
  switch (kind) {
    case "subsidence": return { exaggeration: 1, pitch: 62, zoom: 15.2 };
    case "flood": return { exaggeration: 1.1, pitch: 55, zoom: 13.4 };
    case "volcano": return { exaggeration: 1.25, pitch: 70, zoom: 13.4 };
    case "deforestation": return { exaggeration: 1.2, pitch: 62, zoom: 13.4 };
    case "glacier": return { exaggeration: 1.3, pitch: 66, zoom: 13.4 };
    default: return { exaggeration: 1.45, pitch: 70, zoom: 13.6 };
  }
}

function zoneBbox(zone: RiskZone): Bbox {
  return [zone.lon - 0.18, zone.lat - 0.14, zone.lon + 0.18, zone.lat + 0.14];
}

/** Vista de una zona: el planeta se acerca y da paso al mapa satelital de la zona, con el panel de información. */
export default function ZoneView() {
  const { lang, globalLang, t } = useI18n();
  const c = copy[lang];
  const en = lang === "en";
  const wrapper = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [hazardPoints, setHazardPoints] = useState<HazardPoint[]>([]);
  const [modelPoints, setModelPoints] = useState<HazardPoint[]>([]);
  const [mapVisible, setMapVisible] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [diving, setDiving] = useState(false);
  const openedAt = useRef(0);
  const readyHandled = useRef(false);
  const revealTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [terrain, setTerrain] = useState(false);
  const [annotate, setAnnotate] = useState<{ nonce: number; points: { lat: number; lon: number; label: string; sub?: string }[]; active?: number } | null>(null);
  const [explain, setExplain] = useState<{ nonce: number; kind: LegendKind } | null>(null);
  const activeRef = useRef<SiteManifest | null>(null);
  const [tab, setTab] = useState<"simple" | "analysis">("simple");
  const [manifest, setManifest] = useState<SiteManifest | null>(null);
  const [series, setSeries] = useState<TimeSeries | null>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [dateIndex, setDateIndex] = useState(0);
  const [mode, setMode] = useState<MapMode>("single");
  const [split, setSplit] = useState(50);
  const [opacity, setOpacity] = useState(0.8);
  const [pick, setPick] = useState<{ lon: number; lat: number } | null>(null);
  const [wide, setWide] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const zone = useMemo(() => {
    const curated = riskZones.find((item) => item.id === zoneId);
    if (curated || !zoneId) return curated ?? null;
    const point = globeState.hazardFocus;
    if (!point || point.id !== zoneId) return null;
    const kind = Object.prototype.hasOwnProperty.call(riskKinds, point.kind) ? point.kind as RiskZone["kind"]
      : point.kind === "flood" || point.kind === "storm" ? "flood"
        : point.kind === "volcano" ? "volcano"
          : point.kind === "earthquake" ? "earthquake"
            : point.kind === "wildfire" || point.kind === "drought" ? "wildfire"
              : point.kind === "deforestation" ? "deforestation"
                : point.kind === "mining" ? "mining"
                  : point.kind === "subsidence" ? "subsidence"
                    : point.kind === "glacier" ? "glacier" : "landslide";
    return {
      id: point.id, kind, lat: point.lat, lon: point.lon, country: point.country,
      name: { es: point.place, en: point.place }, place: { es: point.place, en: point.place },
    } satisfies RiskZone;
  }, [zoneId]);
  const siteId = zone?.siteId ?? null;

  useLayoutEffect(() => {
    if (zoneId) panelRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [zoneId]);

  useEffect(() => {
    const update = () => setWide(window.innerWidth > 900);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    const closeDetails = () => setDetailsOpen(false);
    window.addEventListener(ZONE_CHAT_OPEN_EVENT, closeDetails);
    return () => window.removeEventListener(ZONE_CHAT_OPEN_EVENT, closeDetails);
  }, []);

  // Abrir / cerrar: acercamiento 3D y después el mapa de la zona
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onSelect = (event: Event) => {
      const id = (event as CustomEvent<string | null>).detail;
      clearTimeout(timer);
      setZoneId(id);
      setDetailsOpen(false);
      setTab("simple");
      setMapVisible(false);
      setMapReady(false);
      if (id) {
        // Reutiliza la llegada de Saru al entrar en la zona, sin mover el scroll del planeta.
        window.dispatchEvent(new CustomEvent("saros:saru-arrival"));
      }
      setDiving(false);
      setTerrain(false);
      setPick(null);
      setAnnotate(null);
      setExplain(null);
      revealTimers.current.forEach(clearTimeout);
      revealTimers.current = [];
      readyHandled.current = false;
      openedAt.current = performance.now();
      globeState.zoom = id ? 1 : 0;
      if (id) globeState.planetZoom = 0;
      globeState.dive = 0;
      globeState.selected = id;
      const stage = wrapper.current?.closest(".earth-stage") as HTMLElement | null;
      if (stage) {
        stage.dataset.zoomed = id ? "true" : "false";
        stage.dataset.mapview = "false";
        window.dispatchEvent(new CustomEvent("saros:mapview", { detail: false }));
      }
      if (id) {
        timer = setTimeout(() => setMapVisible(true), MAP_DELAY);
      }
    };
    const onSite = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (id) focusZone(id);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (globeState.zoom > 0) closeZone();
      }
    };
    const onHazardPoint = (event: Event) => {
      const point = (event as CustomEvent<HazardPoint | null>).detail;
      if (!point) return;
      const id = hazardPointId(point);
      globeState.hazardFocus = {
        ...point, id,
        place: point.place || point.type || `${point.lat.toFixed(3)}, ${point.lon.toFixed(3)}`,
        country: pointCountry(point),
      };
      focusZone(id);
    };
    window.addEventListener(GLOBE_SELECT, onSelect);
    window.addEventListener(SITE_EVENT, onSite);
    window.addEventListener(HAZARD_POINT_SELECT, onHazardPoint);
    window.addEventListener("keydown", onKey);
    loadAvailability().then(setAvailability).catch(() => setAvailability(null));
    loadHazardPoints().then((data) => {
      const points = data?.points ?? [];
      setHazardPoints(points.filter((point) => point.kind !== "model_assessment"));
      setModelPoints(points.filter((point) => point.kind === "model_assessment"));
    });
    return () => {
      clearTimeout(timer);
      window.removeEventListener(GLOBE_SELECT, onSelect);
      window.removeEventListener(SITE_EVENT, onSite);
      window.removeEventListener(HAZARD_POINT_SELECT, onHazardPoint);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    Promise.all([loadManifest(siteId), loadTimeSeries(siteId)]).then(([m, ts]) => {
      if (cancelled) return;
      setManifest(m);
      setSeries(ts);
      setDateIndex(m.dates.length - 1);
      setMode("single");
      setSplit(50);
      setPick(strongestChange(ts, m.change));
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  const active = manifest && manifest.id === siteId ? manifest : null;
  const pointSeries = useMemo(() => (series && pick && active ? seriesAt(series, pick.lon, pick.lat) : null), [series, pick, active]);
  const sd = (iso: string) => shortDate(iso, lang);
  const isDemo = active?.source.mode !== "real";
  const metric = (en && active?.en?.metric) || active?.metric || "";
  const unit = (en && active?.en?.unit) || active?.unit || "";
  const explainer = active ? radarExplainer[lang][active.change] : null;
  const lastIndex = active ? active.dates.length - 1 : 0;
  const layerUrl = active ? (mode === "change" ? active.changeLayer.url : active.layers[dateIndex]?.url) : "";
  const legend = active ? (mode === "change" ? active.changeLegend : active.legend) : null;
  const real = availability?.sites.find((s) => s.id === siteId);
  const currentValue = pointSeries?.[dateIndex];
  const assessment = active?.source.mode === "real" ? active.assessment : undefined;
  const modelAssessment = zone ? modelPoints
    .map((point) => ({ point, distance: Math.hypot((point.lat - zone.lat) * 111, (point.lon - zone.lon) * 111 * Math.cos(zone.lat * Math.PI / 180)) }))
    .filter(({ distance }) => distance <= 1)
    .sort((a, b) => a.distance - b.distance)[0]?.point.model_assessment ?? null : null;
  const nearbyHazards = zone ? hazardPoints
    .map((point) => ({ point, distanceKm: Math.hypot((point.lat - zone.lat) * 111, (point.lon - zone.lon) * 111 * Math.cos(zone.lat * Math.PI / 180)) }))
    .filter(({ distanceKm }) => distanceKm <= 25)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 3) : [];
  // El modo 3D funciona para cualquier punto backend. Aumenta el detalle al
  // nivel de ciudad cuando la coordenada es precisa; conserva más contexto
  // cuando el punto es un centroide administrativo aproximado.
  const selectedHazard = globeState.hazardFocus?.id === zoneId ? globeState.hazardFocus : null;
  const activeScene = selectedHazard
    ? { exaggeration: 1.25, pitch: selectedHazard.location_precision === "municipality_centroid" ? 58 : 66,
        zoom: selectedHazard.location_precision === "municipality_centroid" ? 14.6 : 15.2 }
    : zone ? sceneFor(zone.kind) : sceneFor("landslide");
  const level: AttentionLevel = modelAssessment?.priority === "P1" ? "alta" : modelAssessment?.priority === "P2" ? "moderada" : "baja";
  const colombia = zone?.country === "CO";
  // El mapa ya tiene imagen: la cámara se zambulle, sube la bruma y en su punto máximo aparece el mapa
  const onMapReady = useCallback(() => {
    if (readyHandled.current) return;
    readyHandled.current = true;
    const wait = Math.max(0, MIN_APPROACH - (performance.now() - openedAt.current));
    revealTimers.current.push(setTimeout(() => {
      globeState.dive = 1;
      setDiving(true);
      revealTimers.current.push(setTimeout(() => {
        setMapReady(true);
        const stage = wrapper.current?.closest(".earth-stage") as HTMLElement | null;
        if (stage) stage.dataset.mapview = "true";
        // el planeta termina de desvanecerse y se pausa
        revealTimers.current.push(setTimeout(() => window.dispatchEvent(new CustomEvent("saros:mapview", { detail: true })), 1200));
      }, HAZE_PEAK));
    }, wait));
  }, []);
  useEffect(() => () => revealTimers.current.forEach(clearTimeout), []);
  // precargar el mapa (y MapLibre) cuando la página ya está quieta: abrir una zona es inmediato
  useEffect(() => {
    const id = setTimeout(() => { void import("@/components/nisar-map"); void import("maplibre-gl"); }, 2500);
    return () => clearTimeout(id);
  }, []);
  // si el mapa no llega a estar listo (red lenta o error), igual se muestra
  useEffect(() => {
    if (!mapVisible || mapReady) return;
    const fallback = setTimeout(onMapReady, 2600);
    return () => clearTimeout(fallback);
  }, [mapVisible, mapReady, onMapReady]);
  // Saro pide señalar puntos o explicar colores
  useEffect(() => {
    activeRef.current = active;
  });
  useEffect(() => {
    const onPoint = (event: Event) => {
      const action = (event as CustomEvent<SaroAction | null>).detail;
      if (!action) return;
      const m = activeRef.current;
      const selected = globeState.hazardFocus?.id === zoneId ? globeState.hazardFocus : null;
      const hotspots = m?.assessment?.hotspots ?? selected?.model_assessment?.hotspots ?? [];
      if (action.type === "legend") setExplain({ nonce: Date.now(), kind: action.kind });
      if (action.type === "point" && hotspots.length) {
        const unit = m?.assessment?.rate.unit.replace(/\/mes$/, "") ?? "";
        const showValue = m ? m.change === "deformation" && m.extraction?.kind !== "mining" : true;
        setAnnotate((prev) => ({
          nonce: prev?.nonce ?? Date.now(),
          active: action.index,
          points: hotspots.map((h, i) => ({
            lat: h.lat, lon: h.lon,
            label: i === action.index ? action.label : `Punto ${i + 1}`,
            sub: i === action.index ? action.sub : (showValue ? `${h.value < 0 ? "−" : "+"}${Math.abs(h.value).toFixed(1)} ${unit}` : undefined),
          })),
        }));
      }
      if (action.type === "hotspots" && hotspots.length) {
        const unit = m?.assessment?.rate.unit.replace(/\/mes$/, "") ?? "";
        const showValue = m ? m.change === "deformation" : true;
        setAnnotate({
          nonce: Date.now(),
          points: hotspots.map((h) => ({
            lat: h.lat, lon: h.lon, label: action.label,
            sub: showValue ? `${h.value < 0 ? "−" : "+"}${Math.abs(h.value).toFixed(1)} ${unit}` : action.sub,
          })),
        });
      }
    };
    window.addEventListener(POINT_EVENT, onPoint);
    return () => window.removeEventListener(POINT_EVENT, onPoint);
  }, [zoneId]);
  // Saru resalta la parte del panel de la que habla: la desplaza a la vista y la ilumina
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onTour = (event: Event) => {
      const key = (event as CustomEvent<TourKey | null>).detail;
      const panel = document.querySelector<HTMLElement>(".zone-panel");
      panel?.querySelectorAll(".is-tour").forEach((el) => el.classList.remove("is-tour"));
      if (!key || !panel) return;
      const el = panel.querySelector<HTMLElement>(`[data-tour="${key}"]`);
      if (!el) return;
      const panelBounds = panel.getBoundingClientRect();
      const itemBounds = el.getBoundingClientRect();
      if (itemBounds.top < panelBounds.top + 12) panel.scrollBy({ top: itemBounds.top - panelBounds.top - 24, behavior: "smooth" });
      else if (itemBounds.bottom > panelBounds.bottom - 12) panel.scrollBy({ top: itemBounds.bottom - panelBounds.bottom + 24, behavior: "smooth" });
      el.classList.add("is-tour");
      clearTimeout(timer);
      timer = setTimeout(() => el.classList.remove("is-tour"), 5200);
    };
    window.addEventListener(TOUR_EVENT, onTour);
    return () => { window.removeEventListener(TOUR_EVENT, onTour); clearTimeout(timer); };
  }, []);

  // la tarjeta de colores se va sola
  useEffect(() => {
    if (!explain) return;
    const id = window.setTimeout(() => setExplain(null), 11000);
    return () => window.clearTimeout(id);
  }, [explain]);

  const impacts = useMemo(() => (zone ? sectorImpacts(zone.id, zone.kind) : []), [zone]);
  const mapBbox = active?.bbox ?? (zone ? zoneBbox(zone) : null);
  // el mapa ocupa solo el área visible (a la izquierda del panel o encima de la hoja)
  const padding = wide ? { top: 80, right: 60, bottom: 70, left: 60 } : { top: 60, right: 24, bottom: 30, left: 24 };

  return (
    <div ref={wrapper} className="zone-layer">
      <nav id="zonas" className="zone-nav" aria-label={c.zones}>
        <p>{c.zonesHint}</p>
        <ul>
          {riskZones.map((z) => (
            <li key={z.id}><button type="button" onClick={() => focusZone(z.id)}>{z.place[lang]} · <span translate={z.kind === "subsidence" && globalLang === "pt" ? "no" : undefined}>{riskKindLabel(z.kind, lang, globalLang)}</span></button></li>
          ))}
        </ul>
      </nav>

      {/* Bruma atmosférica: tapa el paso del planeta 3D al mapa durante la zambullida */}
      <AnimatePresence>
        {zone && diving && (
          <motion.div key={`haze-${zone.id}`} className="zone-haze" aria-hidden="true"
            initial={{ opacity: 0 }} animate={{ opacity: [0, 0.92, 0] }} exit={{ opacity: 0 }}
            transition={{ duration: 1.7, times: [0, 0.3, 1], ease: "easeInOut" }} />
        )}
      </AnimatePresence>

      {/* Mapa de la zona: se precarga oculto y aparece cuando ya tiene imagen */}
      <AnimatePresence>
        {zone && mapVisible && mapBbox && (siteId ? active : true) && (
          <motion.div key={`map-${zone.id}`} className="zone-stage-map" data-ready={mapReady} data-sheet-open={detailsOpen}
            initial={{ opacity: 0, scale: 1.08, filter: "blur(18px) saturate(0.6)" }}
            animate={mapReady ? { opacity: 1, scale: 1, filter: "blur(0px) saturate(1)" } : { opacity: 0, scale: 1.08, filter: "blur(18px) saturate(0.6)" }}
            exit={{ opacity: 0, scale: 1.04, filter: "blur(12px) saturate(0.6)", transition: { duration: 0.6 } }}
            transition={{ duration: 1.25, ease: [0.22, 1, 0.36, 1] }}>
            <NisarMap
              bbox={mapBbox}
              layerUrl={layerUrl}
              beforeUrl={active?.layers[0]?.url}
              mode={active ? mode : "single"}
              opacity={opacity}
              pick={active ? pick : { lon: zone.lon, lat: zone.lat }}
              onPick={active ? setPick : () => undefined}
              recenterKey={0}
              intro={{ lat: zone.lat, lon: zone.lon }}
              onReady={onMapReady}
              reveal={mapReady}
              terrain={terrain}
              scene={activeScene}
              hotspots={assessment?.hotspots ?? selectedHazard?.model_assessment?.hotspots}
              annotate={annotate}
              onZoomOut={closeZone}
              splitValue={split}
              padding={padding}
            />
            <button type="button" className="zone-back-floating" onClick={closeZone} aria-label={c.back} title={c.back}><ArrowLeft size={18} /></button>
            <div className="zone-area-note" role="note"><Info size={12} />{c.areaNote}</div>
            <div className="zone-saru-slot" aria-label={lang === "es" ? "Saru, guía de la ubicación" : "Saru, location guide"} />
            <AnimatePresence>
              {explain && active && legend && (
                <motion.div key={explain.nonce} className="sp-explain" initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }} transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
                  <button type="button" className="sp-explain-x" onClick={() => setExplain(null)} aria-label={en ? "Cerrar" : "Cerrar"}>×</button>
                  <strong>{en ? "How to read the map" : "Cómo leer el mapa"}</strong>
                  <div className="sp-scale"><span className="sp-bar" style={{ background: `linear-gradient(90deg, ${legend.colors.join(",")})` }} /><span className="sp-scan" /></div>
                  <ul>{EXPLAIN[explain.kind].map(([color, textEs], i) => <li key={i} style={{ "--d": `${0.25 + i * 0.18}s` } as React.CSSProperties}><i style={{ background: color }} />{textEs}</li>)}</ul>
                </motion.div>
              )}
            </AnimatePresence>
            {active && legend && (
              <div className="zone-legend">
                <strong>{mode === "change" ? `${t.changeFrom} ${sd(active.dates[0])} → ${sd(active.dates[lastIndex])}` : metric}</strong>
                <span className="legend-bar" style={{ background: `linear-gradient(90deg, ${legend.colors.join(",")})` }} />
                <span className="legend-ends"><i>{legend.range[0]} {unit}</i><i>{legend.range[1]} {unit}</i></span>
              </div>
            )}
            <div className="zone-explore" role="toolbar" aria-label={c.explore}>
              <button type="button" aria-label={terrain ? c.view2d : c.view3d} title={terrain ? c.view2d : c.view3d}
                aria-pressed={terrain} className={terrain ? "is-active" : undefined} onClick={() => setTerrain((v) => !v)}>
                <Box size={18} />
              </button>
              <a href={`https://www.google.com/maps/search/?api=1&query=${(pick ?? zone).lat.toFixed(5)},${(pick ?? zone).lon.toFixed(5)}`}
                target="_blank" rel="noopener noreferrer" aria-label={c.street} title={c.streetHint}>
                <MapPinned size={18} />
              </a>
            </div>
            {active && mode === "swipe" && <div className="swipe-dates"><span>{sd(active.dates[0])} · {t.before}</span><span>{sd(active.dates[dateIndex])} · {t.after}</span></div>}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {zone && (
          <motion.aside
            key="zone-panel"
            className={`zone-panel${detailsOpen ? " is-open" : ""}`}
            ref={panelRef}
            role="dialog"
            aria-label={`${zone.name[lang]} · ${zone.place[lang]}`}
            initial={{ opacity: 0, x: wide ? 60 : 0, y: wide ? 0 : 60, filter: "blur(10px)" }}
            animate={{ opacity: 1, x: 0, y: 0, filter: "blur(0px)", transition: { delay: 0.5, duration: 0.7, ease: [0.22, 1, 0.36, 1] } }}
            exit={{ opacity: 0, x: wide ? 60 : 0, y: wide ? 0 : 60, filter: "blur(8px)", transition: { duration: 0.35 } }}
          >
            <button type="button" className="zone-grab" aria-expanded={detailsOpen} aria-label={detailsOpen ? c.hideDetails : c.showDetails} title={detailsOpen ? c.hideDetails : c.showDetails} onClick={() => setDetailsOpen((open) => {
              const next = !open;
              if (next) window.dispatchEvent(new CustomEvent(ZONE_DETAILS_OPEN_EVENT));
              return next;
            })}>
              <span aria-hidden="true" />
            </button>
            <header className="zone-head">
              <span className="zone-kind" translate={zone.kind === "subsidence" && globalLang === "pt" ? "no" : undefined} style={{ color: riskKinds[zone.kind].color }}>{riskKindLabel(zone.kind, lang, globalLang)}</span>
              <div className="zone-head-actions">
                <button type="button" className="zone-close" onClick={closeZone} aria-label={c.back} title={c.back}><ArrowLeft size={18} /></button>
              </div>
            </header>
            <h2 className="zone-title">{zone.name[lang]}</h2>
            <p className="zone-place"><MapPin size={13} /> {zone.place[lang] !== zone.name[lang] ? `${zone.place[lang]} · ` : ""}{formatCoord(zone.lat, zone.lon)}</p>
            <TerritorialImpact key={zone.id} zoneId={zone.id} lat={zone.lat} lon={zone.lon} observation={active ? { date: active.dates[dateIndex], value: currentValue ?? null, unit, demo: isDemo } : undefined} />
            <div className="zone-level" data-tour="level" style={{ "--level": modelAssessment ? levelInfo[level].color : "#8993ad" } as React.CSSProperties}>
              <i />{modelAssessment ? `${modelAssessment.priority} · ${lang === "es" ? "prioridad exploratoria" : "exploratory priority"}` : (lang === "es" ? "Sin evaluación del modelo" : "No model assessment")}
              {assessment?.accelerating && <b><AlertTriangle size={12} /> {c.accel}</b>}
            </div>

            <div className="zone-tabs" role="tablist">
              {(["simple", "analysis"] as const).map((value) => (
                <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? "is-active" : undefined} onClick={() => setTab(value)}>
                  {value === "simple" ? c.simple : c.analysis}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={`${zone.id}-${tab}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3 }}>
                {tab === "simple" ? (
                  <ZoneSimple
                    zone={zone} active={active} level={level} colombia={colombia} siteId={siteId} lang={lang} impacts={impacts}
                    modelAssessment={modelAssessment} nearbyHazards={nearbyHazards}
                    noData={!siteId ? (
                      <div className="zs-card">
                        <p className="zone-nodata"><ProtectedTerms text={c.noData} /></p>
                        <p className="zone-sub">{c.withData}</p>
                        <div className="zone-chips">
                          {riskZones.filter((z) => z.siteId && z.country === "CO").map((z) => (
                            <button key={z.id} type="button" onClick={() => focusZone(z.id)}>
                              <i style={{ background: riskKinds[z.kind].color }} />{riskKinds[z.kind][lang]} · {z.place[lang].split(",")[0]}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  />
                ) : (
                  <div className="zone-analysis">
                    {!active ? <p className="zone-muted">{siteId ? c.loading : c.noDataNow}</p> : active.source.mode === "demo" ? <p className="zone-nodata">{lang === "es" ? "Esta serie y sus capas son DEMO; no se muestran como mediciones ni predicciones reales." : "This series and its layers are DEMO; they are not presented as real measurements or predictions."}</p> : (
                      <>
                        <div className="zone-modes" role="radiogroup" aria-label={t.mapView}>
                          {([["single", t.viewSingle], ["swipe", t.viewSwipe], ["change", t.viewChange]] as const).map(([value, label]) => (
                            <button key={value} type="button" role="radio" aria-checked={mode === value} className={mode === value ? "is-active" : undefined} onClick={() => setMode(value)}>{label}</button>
                          ))}
                        </div>
                        {mode === "swipe" && (
                          <label className="zone-slider">
                            <span>{c.compare}</span>
                            <input type="range" min={4} max={96} step={0.5} value={split} onChange={(event) => setSplit(Number(event.target.value))}
                              style={{ "--range-progress": `${split}%` } as React.CSSProperties} />
                            <span className="zone-slider-ends"><i>{sd(active.dates[0])}</i><i>{sd(active.dates[dateIndex])}</i></span>
                          </label>
                        )}
                        <div className="zone-timeline">
                          <div className="zone-timeline-head">
                            <strong>{t.timeSeries}</strong>
                            <span>{sd(active.dates[dateIndex])} · {active.dates[dateIndex].slice(0, 4)}</span>
                          </div>
                          <input type="range" min={0} max={lastIndex} value={dateIndex} disabled={mode === "change"} aria-label={t.selectDate}
                            aria-valuetext={longDate(active.dates[dateIndex], lang)} onChange={(event) => setDateIndex(Number(event.target.value))}
                            style={{ "--range-progress": `${(dateIndex / Math.max(1, lastIndex)) * 100}%` } as React.CSSProperties} />
                        </div>
                        <label className="zone-slider">
                          <span>{c.opacity} · {Math.round(opacity * 100)}%</span>
                          <input type="range" min={0.2} max={1} step={0.05} value={opacity} onChange={(event) => setOpacity(Number(event.target.value))}
                            style={{ "--range-progress": `${((opacity - 0.2) / 0.8) * 100}%` } as React.CSSProperties} />
                        </label>

                        <div className="zone-point">
                          <div className="zone-point-head">
                            <span><MousePointerClick size={13} /> {pick ? formatCoord(pick.lat, pick.lon) : c.clickMap}</span>
                            <strong>{currentValue === null || currentValue === undefined ? "—" : currentValue.toFixed(1)} <small>{unit}</small></strong>
                          </div>
                          {pointSeries && (
                            <TimeSeriesChart dates={active.dates} values={pointSeries} unit={unit} activeIndex={dateIndex}
                              onSelect={(i) => { setDateIndex(i); if (mode === "change") setMode("single"); }} />
                          )}
                          {pick && !pointSeries && <p className="zone-muted zone-point-note">{c.noPointSeries}</p>}
                          {pick && pointSeries && (currentValue === null || currentValue === undefined) && <p className="zone-muted zone-point-note">{c.noPointSeries}</p>}
                        </div>

                        {assessment && (
                          <div className="zone-trend">
                            <strong><TrendingUp size={13} /> {c.trend}</strong>
                            <dl>
                              <div><dt>{c.early}</dt><dd>{assessment.rate.early} {en ? assessment.rate.unitEn : assessment.rate.unit}</dd></div>
                              <div><dt>{c.recent}</dt><dd>{assessment.rate.recent} {en ? assessment.rate.unitEn : assessment.rate.unit}</dd></div>
                            </dl>
                            <p className="zone-muted">{lang === "es" ? "Ritmo observado en la serie; el modelo no ha generado un pronóstico para esta ubicación." : "Observed rate in the series; the model has not generated a forecast for this location."}</p>
                          </div>
                        )}

                        <div className="zone-trend">
                          <strong><Sparkles size={13} /> {lang === "es" ? "Modelo SAROS" : "SAROS model"}</strong>
                          {modelAssessment ? <>
                            <p><b>{modelAssessment.priority}</b> · {modelAssessment.anomaly_index.toFixed(1)} / 100</p>
                            <p>{modelAssessment.recommendation}</p>
                            <p className="zone-muted">{lang === "es" ? "Priorización exploratoria; no es una probabilidad ni una alerta." : "Exploratory prioritization; not a probability or alert."}</p>
                          </> : <p className="zone-muted">{lang === "es" ? "Sin resultado del modelo para esta ubicación." : "No model result for this location."}</p>}
                        </div>

                        {explainer && (
                          <div className="zone-explain">
                            <strong><Info size={13} /> {explainer.title}</strong>
                            <p>{explainer.body}</p>
                          </div>
                        )}
                        <footer className="zone-source">
                          <span><Radar size={12} /> {active.source.product} · {(en && active.source.noteEn) || active.source.note}</span>
                          {real && real.total > 0 && <span className="zone-asf"><Database size={12} /> {c.asf}: {real.maturities.map((m) => `${m.count} ${m.maturity}`).join(" · ")}</span>}
                          <span className={`zone-flag-inline notranslate ${isDemo ? "" : "is-real"}`} translate="no">{isDemo ? c.demo : c.real}</span>
                        </footer>
                      </>
                    )}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
