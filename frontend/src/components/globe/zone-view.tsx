"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowLeft, Box, ExternalLink, Layers, Database, Info, MapPin, MousePointerClick, Radar, TrendingUp, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TimeSeriesChart from "@/components/time-series-chart";
import TerritorialImpact from "./territorial-impact";
import ZoneSimple from "./zone-simple";
import { POINT_EVENT } from "./saro-guide";
import type { LegendKind, SaroAction } from "@/lib/saro-brain";
import type { MapMode, Scene3D } from "@/components/nisar-map";
import { levelInfo, trendSentence } from "@/lib/insights";
import { useI18n } from "@/lib/i18n";
import { riskKinds, riskZones, type RiskZone } from "@/lib/risk-zones";
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
    simple: "Vista simple", analysis: "Análisis", now: "Qué está pasando", history: "Qué pasó aquí", todo: "Qué hacer",
    watch: (n: number) => `${n} puntos a vigilar marcados en el mapa: allí el cambio reciente es más rápido.`,
    noData: "Zona de interés: aún sin capas NISAR procesadas. La vista muestra la imagen satelital del lugar.",
    noDataNow: "Sin serie de datos todavía para calcular la tendencia en esta zona.",
    withData: "Zonas con datos", clickMap: "Toca el mapa para ver la evolución de un punto",
    asf: "Escenas NISAR reales en ASF", demo: "DEMO", real: "NISAR", accel: "Aceleración detectada",
    trend: "Tendencia", early: "Ritmo inicial", recent: "Ritmo reciente", p30: "Proyección 30 días", p90: "Proyección 90 días",
    compare: "Antes · después", opacity: "Opacidad de la capa", loading: "Acercando a la zona…",
    explore: "Explorar el lugar", view3d: "Vista 3D a ras de suelo", view2d: "Vista desde arriba", s2: "Sentinel-2 2024", esri: "Alta resolución",
    s2Hint: "Mosaico Sentinel-2 sin nubes más reciente (2024, 10 m)", esriHint: "Imagen de alta resolución de Esri (fecha variable)",
    street: "Street View", streetHint: "Abre Google Street View en este punto (si hay cobertura)",
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
    simple: "Simple view", analysis: "Analysis", now: "What is happening", history: "What happened here", todo: "What to do",
    watch: (n: number) => `${n} watch points on the map: recent change is fastest there.`,
    noData: "Zone of interest: no NISAR layers processed yet. The view shows the satellite image of the place.",
    noDataNow: "No data series yet to compute a trend for this zone.",
    withData: "Zones with data", clickMap: "Tap the map to see a point over time",
    asf: "Real NISAR scenes at ASF", demo: "DEMO", real: "NISAR", accel: "Acceleration detected",
    trend: "Trend", early: "Early rate", recent: "Recent rate", p30: "30-day projection", p90: "90-day projection",
    compare: "Before · after", opacity: "Layer opacity", loading: "Zooming into the zone…",
    explore: "Explore the place", view3d: "3D ground-level view", view2d: "Top-down view", s2: "Sentinel-2 2024", esri: "High resolution",
    s2Hint: "Latest cloud-free Sentinel-2 mosaic (2024, 10 m)", esriHint: "Esri high-resolution imagery (variable date)",
    street: "Street View", streetHint: "Opens Google Street View at this point (where covered)",
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

/** Vista 3D según el tipo de lugar: montañas con relieve marcado, ciudades con edificios, llanuras casi planas. */
function sceneFor(kind: RiskZone["kind"]): Scene3D {
  switch (kind) {
    case "subsidence": return { exaggeration: 1, buildings: true, pitch: 62, zoom: 15.2 };
    case "flood": return { exaggeration: 1.1, buildings: false, pitch: 55, zoom: 12.6 };
    case "volcano": return { exaggeration: 1.25, buildings: false, pitch: 70, zoom: 12.4 };
    case "deforestation": return { exaggeration: 1.2, buildings: false, pitch: 62, zoom: 13 };
    case "glacier": return { exaggeration: 1.3, buildings: false, pitch: 66, zoom: 12.2 };
    default: return { exaggeration: 1.45, buildings: false, pitch: 70, zoom: 13.6 };
  }
}

function zoneBbox(zone: RiskZone): Bbox {
  return [zone.lon - 0.18, zone.lat - 0.14, zone.lon + 0.18, zone.lat + 0.14];
}

/** Vista de una zona: el planeta se acerca y da paso al mapa satelital de la zona, con el panel de información. */
export default function ZoneView() {
  const { lang, t } = useI18n();
  const c = copy[lang];
  const en = lang === "en";
  const wrapper = useRef<HTMLDivElement>(null);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [mapVisible, setMapVisible] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [diving, setDiving] = useState(false);
  const openedAt = useRef(0);
  const readyHandled = useRef(false);
  const revealTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [terrain, setTerrain] = useState(false);
  const [annotate, setAnnotate] = useState<{ nonce: number; points: { lat: number; lon: number; label: string; sub?: string }[] } | null>(null);
  const [explain, setExplain] = useState<{ nonce: number; kind: LegendKind } | null>(null);
  const activeRef = useRef<SiteManifest | null>(null);
  const [basemap, setBasemap] = useState<"esri" | "s2">("esri");
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

  const zone = riskZones.find((z) => z.id === zoneId) ?? null;
  const siteId = zone?.siteId ?? null;

  useEffect(() => {
    const update = () => setWide(window.innerWidth > 900);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Abrir / cerrar: acercamiento 3D y después el mapa de la zona
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onSelect = (event: Event) => {
      const id = (event as CustomEvent<string | null>).detail;
      clearTimeout(timer);
      setZoneId(id);
      setTab("simple");
      setMapVisible(false);
      setMapReady(false);
      setDiving(false);
      setTerrain(false);
      setAnnotate(null);
      setExplain(null);
      revealTimers.current.forEach(clearTimeout);
      revealTimers.current = [];
      readyHandled.current = false;
      openedAt.current = performance.now();
      globeState.zoom = id ? 1 : 0;
      globeState.dive = 0;
      globeState.selected = id;
      const stage = wrapper.current?.closest(".earth-stage") as HTMLElement | null;
      if (stage) {
        stage.dataset.zoomed = id ? "true" : "false";
        stage.dataset.mapview = "false";
        window.dispatchEvent(new CustomEvent("saros:mapview", { detail: false }));
      }
      if (id) {
        const hero = document.getElementById("inicio");
        if (hero) {
          const target = hero.offsetTop + (hero.offsetHeight - window.innerHeight) * 0.92;
          if (window.scrollY < target - 4) window.scrollTo({ top: target, behavior: "smooth" });
        }
        timer = setTimeout(() => setMapVisible(true), MAP_DELAY);
      }
    };
    const onSite = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (id) focusZone(id);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && globeState.zoom > 0) closeZone();
    };
    window.addEventListener(GLOBE_SELECT, onSelect);
    window.addEventListener(SITE_EVENT, onSite);
    window.addEventListener("keydown", onKey);
    loadAvailability().then(setAvailability).catch(() => setAvailability(null));
    return () => {
      clearTimeout(timer);
      window.removeEventListener(GLOBE_SELECT, onSelect);
      window.removeEventListener(SITE_EVENT, onSite);
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
  const assessment = active?.assessment;
  const level: AttentionLevel = assessment?.level ?? (zone?.event ? "moderada" : "baja");
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
      if (action.type === "legend") setExplain({ nonce: Date.now(), kind: action.kind });
      if (action.type === "hotspots" && m?.assessment?.hotspots.length) {
        const unit = m.assessment.rate.unit.replace(/\/mes$/, "");
        const showValue = m.change === "deformation";
        setAnnotate({
          nonce: Date.now(),
          points: m.assessment.hotspots.map((h) => ({
            lat: h.lat, lon: h.lon, label: action.label,
            sub: showValue ? `${h.value > 0 ? "+" : "−"}${Math.abs(h.value).toFixed(1)} ${unit} recientes` : action.sub,
          })),
        });
      }
    };
    window.addEventListener(POINT_EVENT, onPoint);
    return () => window.removeEventListener(POINT_EVENT, onPoint);
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
            <li key={z.id}><button type="button" onClick={() => focusZone(z.id)}>{z.place[lang]} · {riskKinds[z.kind][lang]}</button></li>
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
          <motion.div key={`map-${zone.id}`} className="zone-stage-map" data-ready={mapReady}
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
              scene={sceneFor(zone.kind)}
              basemap={basemap}
              hotspots={assessment?.hotspots}
              annotate={annotate}
              splitValue={split}
              padding={padding}
            />
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
              <button type="button" aria-pressed={terrain} className={terrain ? "is-active" : undefined} onClick={() => setTerrain((v) => !v)}>
                <Box size={15} /> {terrain ? c.view2d : c.view3d}
              </button>
              <button type="button" aria-pressed={basemap === "s2"} className={basemap === "s2" ? "is-active" : undefined} onClick={() => setBasemap((b) => (b === "s2" ? "esri" : "s2"))}
                title={basemap === "s2" ? c.esriHint : c.s2Hint}>
                <Layers size={15} /> {basemap === "s2" ? c.esri : c.s2}
              </button>
              <a href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${(pick ?? zone).lat.toFixed(5)},${(pick ?? zone).lon.toFixed(5)}`} target="_blank" rel="noopener noreferrer" title={c.streetHint}>
                <ExternalLink size={15} /> {c.street}
              </a>
            </div>
            {active && mode === "swipe" && <div className="swipe-dates"><span>{sd(active.dates[0])} · {t.before}</span><span>{sd(active.dates[dateIndex])} · {t.after}</span></div>}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {zone && (
          <motion.button key="back" type="button" className="zone-back" onClick={closeZone}
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0, transition: { delay: 0.4 } }} exit={{ opacity: 0 }}>
            <ArrowLeft size={16} /> {c.back}
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {zone && (
          <motion.aside
            key="zone-panel"
            className="zone-panel"
            role="dialog"
            aria-label={`${zone.name[lang]} · ${zone.place[lang]}`}
            initial={{ opacity: 0, x: wide ? 60 : 0, y: wide ? 0 : 60, filter: "blur(10px)" }}
            animate={{ opacity: 1, x: 0, y: 0, filter: "blur(0px)", transition: { delay: 0.5, duration: 0.7, ease: [0.22, 1, 0.36, 1] } }}
            exit={{ opacity: 0, x: wide ? 60 : 0, y: wide ? 0 : 60, filter: "blur(8px)", transition: { duration: 0.35 } }}
          >
            <span className="zone-grab" aria-hidden="true" />
            <header className="zone-head">
              <span className="zone-kind" style={{ color: riskKinds[zone.kind].color }}>{riskKinds[zone.kind][lang]}</span>
              <div className="zone-head-actions">
                <button type="button" className="zone-close" onClick={closeZone} aria-label={c.close}><X size={17} /></button>
              </div>
            </header>
            <h2 className="zone-title">{zone.name[lang]}</h2>
            <p className="zone-place"><MapPin size={13} /> {zone.place[lang]} · {formatCoord(zone.lat, zone.lon)}</p>
            <TerritorialImpact key={zone.id} zoneId={zone.id} observation={active ? { date: active.dates[dateIndex], value: currentValue ?? null, unit, demo: isDemo } : undefined} />
            <div className="zone-level" style={{ "--level": levelInfo[level].color } as React.CSSProperties}>
              <i />{levelInfo[level].label[lang]}
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
                    trend={assessment && active ? trendSentence(assessment, active.change, zone.kind, lang) : null}
                    noData={!siteId ? (
                      <div className="zs-card">
                        <p className="zone-nodata">{c.noData}</p>
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
                    {!active ? <p className="zone-muted">{siteId ? c.loading : c.noDataNow}</p> : (
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
                        </div>

                        {assessment && (
                          <div className="zone-trend">
                            <strong><TrendingUp size={13} /> {c.trend}</strong>
                            <dl>
                              <div><dt>{c.early}</dt><dd>{assessment.rate.early} {en ? assessment.rate.unitEn : assessment.rate.unit}</dd></div>
                              <div><dt>{c.recent}</dt><dd>{assessment.rate.recent} {en ? assessment.rate.unitEn : assessment.rate.unit}</dd></div>
                              <div><dt>{c.p30}</dt><dd>{assessment.projection.d30} {assessment.projection.unit}</dd></div>
                              <div><dt>{c.p90}</dt><dd>{assessment.projection.d90} {assessment.projection.unit}</dd></div>
                            </dl>
                            <p className="zone-muted">{en ? assessment.basisEn : assessment.basis}</p>
                          </div>
                        )}

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
