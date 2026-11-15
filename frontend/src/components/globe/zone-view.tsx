"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowLeft, Beef, Box, Database, Droplets, Fish, History, House, Info, ListChecks, MapPin, MapPinned, MousePointerClick, Pickaxe, Radar, Route, Store, Trees, TrendingUp, Wheat, type LucideIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TimeSeriesChart from "@/components/time-series-chart";
import TerritorialImpact from "./territorial-impact";
import type { MapMode, Scene3D } from "@/components/nisar-map";
import { adviceNote, levelInfo, recommendations, trendSentence } from "@/lib/insights";
import { ProtectedTerms, useI18n } from "@/lib/i18n";
import { riskKindInfo, riskKindLabel, riskKinds, riskZones, type RiskZone } from "@/lib/risk-zones";
import { exposureNames, sectorImpacts, sectorNames, type SectorKey } from "@/lib/sector-impacts";
import {
  formatCoord, loadAvailability, loadManifest, loadTimeSeries, longDate, radarExplainer, seriesAt, shortDate, strongestChange,
  type AttentionLevel, type Availability, type Bbox, type SiteManifest, type SiteStat, type TimeSeries,
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
    explore: "Explorar el lugar", view3d: "Activar vista 3D a ras de suelo", view2d: "Volver a vista desde arriba",
    street: "Abrir esta ubicación en Google Maps", streetHint: "Abre esta ubicación en Google Maps y Street View, si hay cobertura",
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
    explore: "Explore the place", view3d: "Enable 3D ground-level view", view2d: "Return to top-down view",
    street: "Open this location in Google Maps", streetHint: "Opens this location in Google Maps and Street View, where covered",
    impact: "How it could affect the region", impactIntro: "If the ground change continues, these sectors are the most exposed:", reinforce: "How to reinforce",
    impactNote: "Illustrative scenario (DEMO): shows possible exposure, not confirmed damage or probabilities. SAROS does not predict earthquakes.",
  },
};

const sectorIcons: Record<SectorKey, LucideIcon> = {
  agriculture: Wheat, livestock: Beef, mining: Pickaxe, housing: House, roads: Route, forest: Trees, water: Droplets, commerce: Store, fishing: Fish,
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
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [mapVisible, setMapVisible] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [diving, setDiving] = useState(false);
  const openedAt = useRef(0);
  const readyHandled = useRef(false);
  const revealTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [terrain, setTerrain] = useState(false);
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
  const statText = useCallback((stat: SiteStat) => ({
    label: (en && stat.labelEn) || stat.label, unit: (en && stat.unitEn) || stat.unit, note: (en && stat.noteEn) || stat.note,
  }), [en]);
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
              hotspots={assessment?.hotspots}
              splitValue={split}
              padding={padding}
            />
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
            className="zone-panel"
            role="dialog"
            aria-label={`${zone.name[lang]} · ${zone.place[lang]}`}
            initial={{ opacity: 0, x: wide ? 60 : 0, y: wide ? 0 : 60, filter: "blur(10px)" }}
            animate={{ opacity: 1, x: 0, y: 0, filter: "blur(0px)", transition: { delay: 0.5, duration: 0.7, ease: [0.22, 1, 0.36, 1] } }}
            exit={{ opacity: 0, x: wide ? 60 : 0, y: wide ? 0 : 60, filter: "blur(8px)", transition: { duration: 0.35 } }}
          >
            <span className="zone-grab" aria-hidden="true" />
            <header className="zone-head">
              <span className="zone-kind" translate={zone.kind === "subsidence" && globalLang === "pt" ? "no" : undefined} style={{ color: riskKinds[zone.kind].color }}>{riskKindLabel(zone.kind, lang, globalLang)}</span>
              <div className="zone-head-actions">
                <button type="button" className="zone-close" onClick={closeZone} aria-label={c.back} title={c.back}><ArrowLeft size={18} /></button>
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
                  <div className="zone-simple">
                    <section>
                      <h3><TrendingUp size={14} /> {c.now}</h3>
                      <p>{assessment && active ? trendSentence(assessment, active.change, zone.kind, lang) : (siteId ? c.loading : riskKindInfo[zone.kind][lang])}</p>
                      {!siteId && <p className="zone-muted">{c.noDataNow}</p>}
                      {assessment && assessment.hotspots.length > 0 && <p className="zone-muted">{c.watch(assessment.hotspots.length)}</p>}
                    </section>
                    {impacts.length > 0 && (
                      <section>
                        <h3><Wheat size={14} /> {c.impact}</h3>
                        <p className="zone-muted">{c.impactIntro}</p>
                        <ul className="zone-sectors">
                          {impacts.map((item) => {
                            const Icon = sectorIcons[item.sector];
                            return (
                              <li key={item.sector} style={{ "--exp": exposureNames[item.exposure].color } as React.CSSProperties}>
                                <header><Icon size={16} /><strong>{sectorNames[item.sector][lang]}</strong><em>{exposureNames[item.exposure][lang]}</em></header>
                                <p>{item.effect[lang]}</p>
                                <p className="zone-reinforce"><b>{c.reinforce}:</b> {item.reinforce[lang]}</p>
                              </li>
                            );
                          })}
                        </ul>
                        <p className="zone-muted"><ProtectedTerms text={c.impactNote} /></p>
                      </section>
                    )}
                    {zone.event && (
                      <section>
                        <h3><History size={14} /> {c.history}</h3>
                        <p><b>{longDate(zone.event.date, lang)}</b> — {zone.event[lang]}</p>
                      </section>
                    )}
                    <section>
                      <h3><ListChecks size={14} /> {c.todo}</h3>
                      <ul className="zone-advice">
                        {recommendations(zone.kind, level, colombia, lang).map((item) => <li key={item}>{item}</li>)}
                      </ul>
                      <p className="zone-muted">{adviceNote[lang]}</p>
                    </section>
                    {active && (
                      <div className="zone-stats">
                        {active.stats.slice(0, 2).map((stat) => {
                          const st = statText(stat);
                          return <div key={stat.label}><small>{st.label}</small><strong>{stat.value}<span>{st.unit}</span></strong></div>;
                        })}
                      </div>
                    )}
                    {!siteId && (
                      <>
                        <p className="zone-nodata"><ProtectedTerms text={c.noData} /></p>
                        <p className="zone-sub">{c.withData}</p>
                        <div className="zone-chips">
                          {riskZones.filter((z) => z.siteId && z.country === "CO").map((z) => (
                            <button key={z.id} type="button" onClick={() => focusZone(z.id)}>
                              <i style={{ background: riskKinds[z.kind].color }} />{riskKinds[z.kind][lang]} · {z.place[lang].split(",")[0]}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
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
