"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Crosshair, Database, Info, MapPin, MousePointerClick, X } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TimeSeriesChart from "@/components/time-series-chart";
import type { MapMode } from "@/components/nisar-map";
import { LanguageToggle, useI18n } from "@/lib/i18n";
import { riskKindInfo, riskKinds, riskZones } from "@/lib/risk-zones";
import {
  formatCoord, loadAvailability, loadManifest, loadTimeSeries, longDate, radarExplainer, seriesAt, shortDate, strongestChange,
  type Availability, type SiteManifest, type SiteStat, type TimeSeries,
} from "@/lib/sites";
import { GLOBE_SELECT, SITE_EVENT, closeZone, focusZone, globeState } from "./globe-state";

const NisarMap = dynamic(() => import("@/components/nisar-map"), { ssr: false, loading: () => <div className="map-loading" /> });

const copy = {
  es: { close: "Cerrar zona", zones: "Zonas de riesgo", zonesHint: "Elige una zona para acercar el planeta", noData: "Zona de interés: aún sin capas NISAR procesadas en el prototipo.", withData: "Zonas con datos", clickMap: "Toca el mapa para ver la evolución de un punto", point: "Punto seleccionado", asf: "Escenas NISAR reales en ASF", demo: "DEMO", real: "NISAR" },
  en: { close: "Close zone", zones: "Risk zones", zonesHint: "Pick a zone to zoom the planet", noData: "Zone of interest: no NISAR layers processed in the prototype yet.", withData: "Zones with data", clickMap: "Tap the map to see a point over time", point: "Selected point", asf: "Real NISAR scenes at ASF", demo: "DEMO", real: "NISAR" },
};

/** Vista de una zona dentro del planeta: acercamiento de cámara + panel con la información del sitio. */
export default function ZoneView() {
  const { lang, t } = useI18n();
  const c = copy[lang];
  const en = lang === "en";
  const wrapper = useRef<HTMLDivElement>(null);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [manifest, setManifest] = useState<SiteManifest | null>(null);
  const [series, setSeries] = useState<TimeSeries | null>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [dateIndex, setDateIndex] = useState(0);
  const [mode, setMode] = useState<MapMode>("single");
  const [pick, setPick] = useState<{ lon: number; lat: number } | null>(null);

  const zone = riskZones.find((z) => z.id === zoneId) ?? null;
  const siteId = zone?.siteId ?? null;

  // Abrir / cerrar: acercamiento de cámara y planeta desplazado a un lado
  useEffect(() => {
    const onSelect = (event: Event) => {
      const id = (event as CustomEvent<string | null>).detail;
      setZoneId(id);
      globeState.zoom = id ? 1 : 0;
      const stage = wrapper.current?.closest(".earth-stage") as HTMLElement | null;
      if (stage) stage.dataset.zoomed = id ? "true" : "false";
      if (id) {
        // el planeta debe estar en su posición final (centrado) para el acercamiento
        const hero = document.getElementById("inicio");
        if (hero) {
          const target = hero.offsetTop + (hero.offsetHeight - window.innerHeight) * 0.92;
          if (window.scrollY < target - 4) window.scrollTo({ top: target, behavior: "smooth" });
        }
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
      window.removeEventListener(GLOBE_SELECT, onSelect);
      window.removeEventListener(SITE_EVENT, onSite);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // Datos del sitio (solo las zonas con capas)
  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    Promise.all([loadManifest(siteId), loadTimeSeries(siteId)]).then(([m, ts]) => {
      if (cancelled) return;
      setManifest(m);
      setSeries(ts);
      setDateIndex(m.dates.length - 1);
      setMode("single");
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

  return (
    <div ref={wrapper} className="zone-layer">
      {/* acceso por teclado a las zonas (aparece al recibir foco) */}
      <nav id="zonas" className="zone-nav" aria-label={c.zones}>
        <p>{c.zonesHint}</p>
        <ul>
          {riskZones.map((z) => (
            <li key={z.id}><button type="button" onClick={() => focusZone(z.id)}>{z.place[lang]} · {riskKinds[z.kind][lang]}</button></li>
          ))}
        </ul>
      </nav>

      <AnimatePresence>
        {zone && (
          <motion.aside
            key="zone-panel"
            className="zone-panel"
            role="dialog"
            aria-label={`${zone.name[lang]} · ${zone.place[lang]}`}
            initial={{ opacity: 0, x: 60, filter: "blur(10px)" }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)", transition: { delay: 0.55, duration: 0.7, ease: [0.22, 1, 0.36, 1] } }}
            exit={{ opacity: 0, x: 60, filter: "blur(8px)", transition: { duration: 0.35 } }}
          >
            <header className="zone-head">
              <span className="zone-kind" style={{ color: riskKinds[zone.kind].color }}><Crosshair size={13} /> {riskKinds[zone.kind][lang]}</span>
              <div className="zone-head-actions">
                <LanguageToggle />
                <button type="button" className="zone-close" onClick={closeZone} aria-label={c.close}><X size={17} /></button>
              </div>
            </header>
            <motion.div key={zone.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
              <h2 className="zone-title">{zone.name[lang]}</h2>
              <p className="zone-place"><MapPin size={13} /> {zone.place[lang]} · {formatCoord(zone.lat, zone.lon)}</p>

              {!siteId && (
                <>
                  <p className="zone-info">{riskKindInfo[zone.kind][lang]}</p>
                  <p className="zone-nodata">{c.noData}</p>
                  <p className="zone-sub">{c.withData}</p>
                  <div className="zone-chips">
                    {riskZones.filter((z) => z.siteId).map((z) => (
                      <button key={z.id} type="button" onClick={() => focusZone(z.id)}>
                        <i style={{ background: riskKinds[z.kind].color }} />{riskKinds[z.kind][lang]} · {z.place[lang].split(",").pop()?.trim()}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {siteId && !active && <div className="zone-loading" />}

              {active && (
                <>
                  <p className="zone-story">{(en && active.en?.story) || active.story}</p>
                  <div className="zone-stats">
                    {active.stats.map((stat) => {
                      const st = statText(stat);
                      return (
                        <div key={stat.label}>
                          <small>{st.label}</small>
                          <strong>{stat.value}<span>{st.unit}</span></strong>
                          <em>{st.note}{isDemo ? " · demo" : ""}</em>
                        </div>
                      );
                    })}
                  </div>

                  <div className="zone-modes" role="radiogroup" aria-label={t.mapView}>
                    {([["single", t.viewSingle], ["swipe", t.viewSwipe], ["change", t.viewChange]] as const).map(([value, label]) => (
                      <button key={value} type="button" role="radio" aria-checked={mode === value} className={mode === value ? "is-active" : undefined} onClick={() => setMode(value)}>{label}</button>
                    ))}
                  </div>

                  <div className="zone-map">
                    <NisarMap bbox={active.bbox} layerUrl={layerUrl} beforeUrl={active.layers[0]?.url} mode={mode} opacity={0.8}
                      pick={pick} onPick={setPick} recenterKey={0} />
                    {legend && (
                      <div className="zone-legend">
                        <span className="legend-bar" style={{ background: `linear-gradient(90deg, ${legend.colors.join(",")})` }} />
                        <span className="legend-ends"><i>{legend.range[0]} {unit}</i><i>{legend.range[1]} {unit}</i></span>
                      </div>
                    )}
                    {mode === "swipe" && <div className="swipe-dates"><span>{sd(active.dates[0])} · {t.before}</span><span>{sd(active.dates[dateIndex])} · {t.after}</span></div>}
                    <span className={`zone-flag ${isDemo ? "" : "is-real"}`}>{isDemo ? c.demo : c.real} · {active.product}</span>
                  </div>

                  <div className="zone-timeline">
                    <div className="zone-timeline-head">
                      <strong>{mode === "change" ? `${t.changeFrom} ${sd(active.dates[0])} → ${sd(active.dates[lastIndex])}` : metric}</strong>
                      <span>{sd(active.dates[dateIndex])} · {active.dates[dateIndex].slice(0, 4)}</span>
                    </div>
                    <input type="range" min={0} max={lastIndex} value={dateIndex} disabled={mode === "change"} aria-label={t.selectDate}
                      aria-valuetext={longDate(active.dates[dateIndex], lang)} onChange={(event) => setDateIndex(Number(event.target.value))}
                      style={{ "--range-progress": `${(dateIndex / Math.max(1, lastIndex)) * 100}%` } as React.CSSProperties} />
                  </div>

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

                  {explainer && (
                    <div className="zone-explain">
                      <strong><Info size={13} /> {explainer.title}</strong>
                      <p>{explainer.body}</p>
                    </div>
                  )}

                  <footer className="zone-source">
                    <span>{(en && active.source.noteEn) || active.source.note}</span>
                    {real && real.total > 0 && (
                      <span className="zone-asf"><Database size={12} /> {c.asf}: {real.maturities.map((m) => `${m.count} ${m.maturity}`).join(" · ")}</span>
                    )}
                  </footer>
                </>
              )}
            </motion.div>
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
