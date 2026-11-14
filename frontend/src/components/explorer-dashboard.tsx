"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { motion, useScroll, useTransform } from "framer-motion";
import {
  Activity, ArrowLeftRight, CalendarDays, ChevronRight, Droplets, Globe2, Info, Layers3,
  LocateFixed, MapPin, Menu, Mountain, MousePointerClick, Satellite, Search, Snowflake, Trees, X,
} from "lucide-react";
import TimeSeriesChart from "@/components/time-series-chart";
import type { MapMode } from "@/components/nisar-map";
import {
  formatCoord, loadManifest, loadSites, loadTimeSeries, longDate, radarExplainer, seriesAt, shortDate, strongestChange,
  type Legend, type SiteManifest, type SiteSummary, type TimeSeries,
} from "@/lib/sites";

const NisarMap = dynamic(() => import("@/components/nisar-map"), { ssr: false, loading: () => <div className="map-loading">Cargando mapa…</div> });

const siteIcon = (site: Pick<SiteSummary, "id" | "change">, size = 16) => {
  if (site.id.includes("glaciar")) return <Snowflake size={size} />;
  if (site.id.includes("inundacion")) return <Droplets size={size} />;
  if (site.id.includes("deforestacion")) return <Trees size={size} />;
  return site.change === "deformation" ? <Mountain size={size} /> : <Activity size={size} />;
};

const metricAccents = ["cyan", "violet", "amber"] as const;
const metricIcons = [<Activity key="a" size={17} />, <MapPin key="m" size={17} />, <ArrowLeftRight key="c" size={17} />];

export const SITE_EVENT = "tenua:site";

export default function ExplorerDashboard() {
  const section = useRef<HTMLElement>(null);
  const filterButton = useRef<HTMLButtonElement>(null);
  const filterPanel = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);
  const { scrollYProgress: arrival } = useScroll({ target: section, offset: ["start end", "start 25%"] });
  const arrivalY = useTransform(arrival, [0, 1], [28, 0]);
  const arrivalOpacity = useTransform(arrival, [0, 0.65, 1], [0.35, 0.9, 1]);

  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [manifest, setManifest] = useState<SiteManifest | null>(null);
  const [series, setSeries] = useState<TimeSeries | null>(null);
  const [dateIndex, setDateIndex] = useState(0);
  const [mode, setMode] = useState<MapMode>("single");
  const [opacity, setOpacity] = useState(0.8);
  const [pick, setPick] = useState<{ lon: number; lat: number } | null>(null);
  const [recenter, setRecenter] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [mobilePanel, setMobilePanel] = useState(false);

  // Índice de sitios; el piloto se abre primero
  useEffect(() => {
    loadSites()
      .then((list) => {
        setSites(list);
        setSiteId((current) => current ?? (list.find((s) => s.pilot) ?? list[0])?.id ?? null);
      })
      .catch(() => setError("No se encontraron los datos de los sitios. Ejecuta pipeline/build_layers.py --demo."));
  }, []);

  // El globo u otras secciones pueden pedir un sitio con un evento
  useEffect(() => {
    const select = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (id) setSiteId(id);
    };
    window.addEventListener(SITE_EVENT, select);
    return () => window.removeEventListener(SITE_EVENT, select);
  }, []);

  // Datos del sitio activo
  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    Promise.all([loadManifest(siteId), loadTimeSeries(siteId)])
      .then(([m, ts]) => {
        if (cancelled) return;
        setManifest(m);
        setSeries(ts);
        setDateIndex(m.dates.length - 1);
        setPick(strongestChange(ts, m.change));
      })
      .catch(() => !cancelled && setError("No se pudo cargar el sitio seleccionado."));
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  useEffect(() => {
    if (mobilePanel) {
      filterPanel.current?.focus();
      document.body.classList.add("mobile-panel-active");
    } else {
      document.body.classList.remove("mobile-panel-active");
      if (wasOpen.current) filterButton.current?.focus();
    }
    wasOpen.current = mobilePanel;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobilePanel(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.classList.remove("mobile-panel-active");
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobilePanel]);

  const chooseSite = useCallback((id: string) => {
    setSiteId(id);
    setMobilePanel(false);
  }, []);

  const pointSeries = useMemo(() => (series && pick ? seriesAt(series, pick.lon, pick.lat) : null), [series, pick]);
  const site = sites.find((s) => s.id === siteId);
  const isDemo = manifest?.source.mode !== "real";
  const explainer = manifest ? radarExplainer[manifest.change] : null;
  const lastIndex = manifest ? manifest.dates.length - 1 : 0;
  const compareIndex = 0;
  const layerUrl = manifest ? (mode === "change" ? manifest.changeLayer.url : manifest.layers[dateIndex]?.url) : "";
  const beforeUrl = manifest?.layers[compareIndex]?.url;
  const legend: Legend | null = manifest ? (mode === "change" ? manifest.changeLegend : manifest.legend) : null;
  const currentValue = pointSeries?.[dateIndex];

  return (
    <section ref={section} className="explorer-section" id="explorador" tabIndex={-1} aria-labelledby="explorer-title">
      <div className="explorer-signal" aria-hidden="true" />
      <header className="app-header">
        <a className="brand" href="#inicio"><span className="brand-mark"><Satellite size={17} /></span><span>TOBARU <i>WORKTEAM</i></span></a>
        <div className="header-center"><span className="live-dot" /> {isDemo ? "DEMO · FORMATO NISAR" : "DATOS NISAR · ASF DAAC"}</div>
        <div className="header-actions"><button type="button" className="header-icon" aria-label="Buscar"><Search size={17} /></button><button type="button" className="avatar" aria-label="Perfil de Tobaru Workteam">TW</button><button ref={filterButton} type="button" className="mobile-menu" onClick={() => setMobilePanel(!mobilePanel)} aria-label={mobilePanel ? "Cerrar filtros" : "Abrir filtros"} aria-expanded={mobilePanel} aria-controls="explorer-filters">{mobilePanel ? <X size={18} /> : <Menu size={18} />}</button></div>
      </header>

      <div className="explorer-layout">
        {mobilePanel && <button type="button" className="panel-backdrop" onClick={() => setMobilePanel(false)} aria-label="Cerrar filtros" />}
        <aside ref={filterPanel} id="explorer-filters" className={`side-panel ${mobilePanel ? "side-panel-open" : ""}`} aria-label="Filtros del explorador" tabIndex={-1}>
          <div className="panel-heading">
            <div><p className="eyebrow">SITIOS MONITOREADOS</p><h2>Explorador</h2></div>
            <span className="quiet-icon" aria-hidden="true"><Globe2 size={16} /></span>
          </div>

          <div className="site-list" role="radiogroup" aria-label="Sitio">
            {sites.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={s.id === siteId} className={`site-option ${s.id === siteId ? "is-active" : ""}`} onClick={() => chooseSite(s.id)}>
                <span className="area-icon">{siteIcon(s, 16)}</span>
                <span className="site-option-copy">
                  <strong>{s.name}{s.pilot && <em> · piloto</em>}</strong>
                  <small>{s.place}</small>
                </span>
                <span className={`change-chip change-${s.change}`}>{s.changeLabel}</span>
              </button>
            ))}
          </div>

          <div className="panel-divider" />
          <div className="section-label"><span>VISTA DEL MAPA</span><Layers3 size={15} /></div>
          <div className="view-modes" role="radiogroup" aria-label="Vista del mapa">
            {([
              ["single", "Fecha", "Una adquisición"],
              ["swipe", "Antes / después", "Arrastra para comparar"],
              ["change", "Cambio", "Última menos primera"],
            ] as const).map(([value, title, detail]) => (
              <button key={value} type="button" role="radio" aria-checked={mode === value} className={`view-mode ${mode === value ? "is-active" : ""}`} onClick={() => setMode(value)}>
                <strong>{title}</strong><small>{detail}</small>
              </button>
            ))}
          </div>
          <label className="opacity-control">
            <span>Opacidad de la capa NISAR <b>{Math.round(opacity * 100)}%</b></span>
            <input type="range" min={0.2} max={1} step={0.05} value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} />
          </label>

          <div className="panel-divider" />
          <div className="section-label"><span>FECHA DE OBSERVACIÓN</span><CalendarDays size={15} /></div>
          <div className="date-select" aria-live="polite"><span>{manifest ? longDate(manifest.dates[dateIndex]) : "—"}</span></div>
          <div className="date-note">{manifest ? `${manifest.dates.length} adquisiciones · cada 12 días` : ""}</div>
          <div className="panel-divider" />
          <div className="source-card">
            <span className="source-icon"><Satellite size={17} /></span>
            <div><strong>{manifest?.source.product ?? "NISAR"}</strong><p>{manifest?.metric ?? ""}</p></div>
            <ChevronRight size={14} />
          </div>
          <div className="side-foot"><span className="demo-dot" /> {manifest?.source.note ?? "Cargando procedencia…"}</div>
        </aside>

        <motion.div className="dashboard-main" style={{ y: arrivalY, opacity: arrivalOpacity }}>
          {error && <div className="data-error" role="alert">{error}</div>}

          <div className="dashboard-title-row">
            <div>
              <div className="breadcrumb">TOBARU <ChevronRight size={12} /> EXPLORADOR <ChevronRight size={12} /> {site?.changeLabel.toUpperCase() ?? "…"}</div>
              <h1 id="explorer-title">{manifest ? `${manifest.name} · ${manifest.place}` : "Cargando sitio…"}</h1>
              <p>{manifest?.story}</p>
            </div>
            <button type="button" className="outline-button" onClick={() => setRecenter((n) => n + 1)}><LocateFixed size={15} /> Centrar mapa</button>
          </div>

          {/* Selector rápido de sitios (visible también en móvil) */}
          <div className="site-strip" role="tablist" aria-label="Cambiar de sitio">
            {sites.map((s) => (
              <button key={s.id} type="button" role="tab" aria-selected={s.id === siteId} className={`site-pill ${s.id === siteId ? "is-active" : ""}`} onClick={() => chooseSite(s.id)}>
                {siteIcon(s, 14)} <span>{s.changeLabel}</span> <small>{s.place.split(",").pop()?.trim()}</small>
              </button>
            ))}
          </div>

          <div className="metrics-grid">
            {(manifest?.stats ?? []).map((stat, index) => (
              <article className="metric-card" key={stat.label}>
                <div className={`metric-icon ${metricAccents[index]}`}>{metricIcons[index]}</div>
                <p>{stat.label.toUpperCase()}</p>
                <div className="metric-number"><strong>{stat.value}</strong><span>{stat.unit}</span></div>
                <span className="metric-trend">{stat.note}{isDemo ? " · demo" : ""}</span>
              </article>
            ))}
          </div>

          <section className="map-card" aria-label={`Mapa de ${manifest?.metric ?? "cambios"}`}>
            <div className="map-topline">
              <div className="map-place"><MapPin size={14} /><span>{manifest?.place ?? "…"} <i>· {manifest ? formatCoord(manifest.lat, manifest.lon) : ""}</i></span></div>
              <div className="map-tools">
                <span className={`map-demo ${isDemo ? "" : "is-real"}`}><span className="demo-dot" /> {isDemo ? "DEMO" : "NISAR"} · {manifest?.product}</span>
              </div>
            </div>
            <div className="map-visual map-live">
              {manifest && layerUrl && (
                <NisarMap bbox={manifest.bbox} layerUrl={layerUrl} beforeUrl={beforeUrl} mode={mode} opacity={opacity}
                  pick={pick} onPick={setPick} recenterKey={recenter} />
              )}
              {legend && manifest && (
                <div className="map-legend live-legend">
                  <strong>{mode === "change" ? `CAMBIO ${shortDate(manifest.dates[0])} → ${shortDate(manifest.dates[lastIndex])}` : manifest.metric.toUpperCase()}</strong>
                  <span className="legend-bar" style={{ background: `linear-gradient(90deg, ${legend.colors.join(",")})` }} />
                  <span className="legend-ends"><i>{legend.range[0]} {manifest.unit}</i>{legend.diverging && <i>0</i>}<i>{legend.range[1]} {manifest.unit}</i></span>
                  {explainer && mode !== "change" && <span className="legend-meaning"><b>{explainer.legendLow}</b><b>{explainer.legendHigh}</b></span>}
                </div>
              )}
              {mode === "swipe" && manifest && (
                <div className="swipe-dates"><span>{shortDate(manifest.dates[compareIndex])}</span><span>{shortDate(manifest.dates[dateIndex])}</span></div>
              )}
              <div className="map-hint"><MousePointerClick size={13} /> Haz clic en el mapa para ver la serie temporal de un punto</div>
            </div>
            {manifest && (
              <div className="timeline">
                <div className="timeline-heading">
                  <div><strong>Serie temporal</strong><span>{mode === "change" ? "El mapa de cambio usa la primera y la última fecha" : `Adquisiciones cada 12 días · ${isDemo ? "fechas de demostración" : "fechas reales"}`}</span></div>
                  <span className="timeline-current">{shortDate(manifest.dates[dateIndex])} · {manifest.dates[dateIndex].slice(0, 4)}</span>
                </div>
                <div className="timeline-track">
                  <input aria-label="Seleccionar fecha de observación" aria-valuetext={longDate(manifest.dates[dateIndex])} type="range" min="0" max={lastIndex} value={dateIndex}
                    disabled={mode === "change"}
                    onChange={(event) => setDateIndex(Number(event.target.value))}
                    style={{ "--range-progress": `${(dateIndex / Math.max(1, lastIndex)) * 100}%` } as React.CSSProperties} />
                  <div className="timeline-labels">
                    {manifest.dates.map((d, index) => (
                      <button type="button" key={d} className={index === dateIndex ? "is-current" : ""} aria-pressed={index === dateIndex} aria-label={`Mostrar observación del ${longDate(d)}`}
                        disabled={mode === "change"} onClick={() => setDateIndex(index)}>{shortDate(d)}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>

          <div className="below-grid">
            <section className="detail-card">
              <div className="card-heading">
                <div><p className="eyebrow">EVOLUCIÓN DEL PUNTO SELECCIONADO</p><h2>{pick ? formatCoord(pick.lat, pick.lon) : "Selecciona un punto"}</h2></div>
                <span className="quiet-icon" aria-hidden="true"><MousePointerClick size={17} /></span>
              </div>
              <div className="observation-value" aria-live="polite">
                <strong>{currentValue === null || currentValue === undefined ? "—" : `${currentValue > 0 && manifest?.change === "deformation" ? "+" : ""}${currentValue.toFixed(1)}`}</strong>
                <span>{manifest?.unit} · {manifest ? shortDate(manifest.dates[dateIndex]) : ""}</span>
              </div>
              {manifest && pointSeries && (
                <TimeSeriesChart dates={manifest.dates} values={pointSeries} unit={manifest.unit} activeIndex={dateIndex} onSelect={(i) => { setDateIndex(i); if (mode === "change") setMode("single"); }} />
              )}
              <div className="detail-meta">
                <span>FUENTE <b>{manifest?.source.product}{isDemo ? " · demo" : ""}</b></span>
                <span>MÉTRICA <b>{manifest?.metric}</b></span>
              </div>
            </section>
            <section className="review-card">
              <div className="review-icon"><Info size={17} /></div>
              <p className="eyebrow">¿QUÉ VE EL RADAR?</p>
              <h2>{explainer?.title ?? "…"}</h2>
              <p>{explainer?.body}</p>
              <p className="review-limit">{isDemo
                ? "Valores sintéticos para mostrar el flujo. Cuando se procesen productos NISAR de ASF, este sitio mostrará mediciones reales."
                : "Medición satelital: requiere validación local. No es una alerta oficial."}</p>
            </section>
          </div>
          <footer className="app-footer"><span>TOBARU WORKTEAM <i>· NASA SPACE APPS · RETO NISAR</i></span><span>{isDemo ? "DATOS SINTÉTICOS CON FORMATO NISAR" : "DATOS NISAR · ASF DAAC"}</span></footer>
        </motion.div>
      </div>
    </section>
  );
}
