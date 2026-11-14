"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { motion, useScroll, useTransform } from "framer-motion";
import {
  Activity, ArrowLeftRight, CalendarDays, Database, Droplets, Globe2, Info, Layers3,
  LocateFixed, MapPin, Menu, Mountain, MousePointerClick, Satellite, Snowflake, Trees, X,
} from "lucide-react";
import TimeSeriesChart from "@/components/time-series-chart";
import SarosLogo from "@/components/saros-logo";
import type { MapMode } from "@/components/nisar-map";
import { LanguageToggle, useI18n } from "@/lib/i18n";
import {
  formatCoord, loadAvailability, loadManifest, loadSites, loadTimeSeries, longDate, radarExplainer, seriesAt, shortDate, strongestChange,
  type Availability, type Legend, type SiteManifest, type SiteStat, type SiteSummary, type TimeSeries,
} from "@/lib/sites";

const NisarMap = dynamic(() => import("@/components/nisar-map"), { ssr: false, loading: () => <div className="map-loading" /> });

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
  const { lang, t } = useI18n();
  const en = lang === "en";
  const section = useRef<HTMLElement>(null);
  const filterButton = useRef<HTMLButtonElement>(null);
  const filterPanel = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);
  const { scrollYProgress: arrival } = useScroll({ target: section, offset: ["start end", "start 25%"] });
  const arrivalY = useTransform(arrival, [0, 1], [28, 0]);
  const arrivalOpacity = useTransform(arrival, [0, 0.65, 1], [0.35, 0.9, 1]);

  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [manifest, setManifest] = useState<SiteManifest | null>(null);
  const [series, setSeries] = useState<TimeSeries | null>(null);
  const [dateIndex, setDateIndex] = useState(0);
  const [mode, setMode] = useState<MapMode>("single");
  const [opacity, setOpacity] = useState(0.8);
  const [pick, setPick] = useState<{ lon: number; lat: number } | null>(null);
  const [recenter, setRecenter] = useState(0);
  const [error, setError] = useState<"noData" | "siteError" | null>(null);
  const [mobilePanel, setMobilePanel] = useState(false);

  // Índice de sitios (el piloto se abre primero) y escenas reales disponibles en ASF
  useEffect(() => {
    loadSites()
      .then((list) => {
        setSites(list);
        setSiteId((current) => current ?? (list.find((s) => s.pilot) ?? list[0])?.id ?? null);
      })
      .catch(() => setError("noData"));
    loadAvailability().then(setAvailability).catch(() => setAvailability(null));
  }, []);

  // El globo puede pedir un sitio con un evento
  useEffect(() => {
    const select = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (id) setSiteId(id);
    };
    window.addEventListener(SITE_EVENT, select);
    return () => window.removeEventListener(SITE_EVENT, select);
  }, []);

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
      .catch(() => !cancelled && setError("siteError"));
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

  // Textos del sitio en el idioma activo
  const text = (s: Pick<SiteSummary, "name" | "place" | "changeLabel" | "story" | "en"> | null | undefined) => ({
    name: (en && s?.en?.name) || s?.name || "",
    place: (en && s?.en?.place) || s?.place || "",
    changeLabel: (en && s?.en?.changeLabel) || s?.changeLabel || "",
    story: (en && s?.en?.story) || s?.story || "",
  });
  const statText = (stat: SiteStat) => ({
    label: (en && stat.labelEn) || stat.label,
    unit: (en && stat.unitEn) || stat.unit,
    note: (en && stat.noteEn) || stat.note,
  });

  const pointSeries = useMemo(() => (series && pick ? seriesAt(series, pick.lon, pick.lat) : null), [series, pick]);
  const site = sites.find((s) => s.id === siteId);
  const siteText = text(manifest);
  const metric = (en && manifest?.en?.metric) || manifest?.metric || "";
  const unit = (en && manifest?.en?.unit) || manifest?.unit || "";
  const isDemo = manifest?.source.mode !== "real";
  const explainer = manifest ? radarExplainer[lang][manifest.change] : null;
  const lastIndex = manifest ? manifest.dates.length - 1 : 0;
  const compareIndex = 0;
  const layerUrl = manifest ? (mode === "change" ? manifest.changeLayer.url : manifest.layers[dateIndex]?.url) : "";
  const beforeUrl = manifest?.layers[compareIndex]?.url;
  const legend: Legend | null = manifest ? (mode === "change" ? manifest.changeLegend : manifest.legend) : null;
  const currentValue = pointSeries?.[dateIndex];
  const real = availability?.sites.find((s) => s.id === siteId);
  const sd = (iso: string) => shortDate(iso, lang);
  const ld = (iso: string) => longDate(iso, lang);

  return (
    <section ref={section} className="explorer-section" id="explorador" tabIndex={-1} aria-labelledby="explorer-title">
      <div className="explorer-signal" aria-hidden="true" />
      <header className="app-header">
        <SarosLogo size={30} tagline={false} />
        <div className="header-center"><span className="live-dot" /> {isDemo ? t.demoHeader : t.realHeader}</div>
        <div className="header-actions">
          <LanguageToggle />
          <button type="button" className="avatar" aria-label={t.profile}>TW</button>
          <button ref={filterButton} type="button" className="mobile-menu" onClick={() => setMobilePanel(!mobilePanel)} aria-label={mobilePanel ? t.closeFilters : t.openFilters} aria-expanded={mobilePanel} aria-controls="explorer-filters">{mobilePanel ? <X size={18} /> : <Menu size={18} />}</button>
        </div>
      </header>

      <div className="explorer-layout">
        {mobilePanel && <button type="button" className="panel-backdrop" onClick={() => setMobilePanel(false)} aria-label={t.closeFilters} />}
        <aside ref={filterPanel} id="explorer-filters" className={`side-panel ${mobilePanel ? "side-panel-open" : ""}`} aria-label={t.filtersLabel} tabIndex={-1}>
          <div className="panel-heading">
            <div><p className="eyebrow">{t.sitesEyebrow}</p><h2>{t.explorer}</h2></div>
            <span className="quiet-icon" aria-hidden="true"><Globe2 size={16} /></span>
          </div>

          <div className="site-list" role="radiogroup" aria-label={t.siteGroup}>
            {sites.map((s) => {
              const st = text(s);
              return (
                <button key={s.id} type="button" role="radio" aria-checked={s.id === siteId} className={`site-option ${s.id === siteId ? "is-active" : ""}`} onClick={() => chooseSite(s.id)}>
                  <span className="area-icon">{siteIcon(s, 16)}</span>
                  <span className="site-option-copy">
                    <strong>{st.name}{s.pilot && <em> · {t.pilot}</em>}</strong>
                    <small>{st.place}</small>
                  </span>
                  <span className={`change-chip change-${s.change}`}>{st.changeLabel}</span>
                </button>
              );
            })}
          </div>

          <div className="panel-divider" />
          <div className="section-label"><span>{t.mapView}</span><Layers3 size={15} /></div>
          <div className="view-modes" role="radiogroup" aria-label={t.mapView}>
            {([
              ["single", t.viewSingle, t.viewSingleDetail],
              ["swipe", t.viewSwipe, t.viewSwipeDetail],
              ["change", t.viewChange, t.viewChangeDetail],
            ] as const).map(([value, title, detail]) => (
              <button key={value} type="button" role="radio" aria-checked={mode === value} className={`view-mode ${mode === value ? "is-active" : ""}`} onClick={() => setMode(value)}>
                <strong>{title}</strong><small>{detail}</small>
              </button>
            ))}
          </div>
          <label className="opacity-control">
            <span>{t.opacity} <b>{Math.round(opacity * 100)}%</b></span>
            <input type="range" min={0.2} max={1} step={0.05} value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} />
          </label>

          <div className="panel-divider" />
          <div className="section-label"><span>{t.observationDate}</span><CalendarDays size={15} /></div>
          <div className="date-select" aria-live="polite"><span>{manifest ? ld(manifest.dates[dateIndex]) : "—"}</span></div>
          <div className="date-note">{manifest ? t.acquisitions(manifest.dates.length) : ""}</div>
          <div className="panel-divider" />
          <div className="source-card">
            <span className="source-icon"><Satellite size={17} /></span>
            <div><strong>{manifest?.source.product ?? "NISAR"}</strong><p>{metric}</p></div>
          </div>
          {real && real.total > 0 && (
            <div className="asf-card">
              <span className="source-icon"><Database size={16} /></span>
              <div>
                <strong>{t.asfScenes}</strong>
                <p>{t.asfScenesDetail(real.total, real.product)}</p>
                <ul>
                  {real.maturities.map((m) => (
                    <li key={m.shortName}><b>{m.maturity}</b> {m.count} · {m.first && m.last ? `${sd(m.first)} ${m.first.slice(0, 4)} – ${sd(m.last)} ${m.last.slice(0, 4)}` : ""}</li>
                  ))}
                </ul>
                <small>{t.asfChecked} {availability ? ld(availability.checked.slice(0, 10)) : ""} · CMR</small>
              </div>
            </div>
          )}
          <div className="side-foot"><span className="demo-dot" /> {manifest ? ((en && manifest.source.noteEn) || manifest.source.note) : t.loadingSource}</div>
        </aside>

        <motion.div className="dashboard-main" style={{ y: arrivalY, opacity: arrivalOpacity }}>
          {error && <div className="data-error" role="alert">{t[error]}</div>}

          <div className="dashboard-title-row">
            <div>
              <div className="breadcrumb">SAROS <span aria-hidden="true">›</span> {t.explorer.toUpperCase()} <span aria-hidden="true">›</span> {text(site).changeLabel.toUpperCase() || "…"}</div>
              <h1 id="explorer-title">{manifest ? `${siteText.name} · ${siteText.place}` : t.loadingSite}</h1>
              <p>{siteText.story}</p>
            </div>
            <button type="button" className="outline-button" onClick={() => setRecenter((n) => n + 1)}><LocateFixed size={15} /> {t.centerMap}</button>
          </div>

          {/* Selector rápido de sitios (visible también en móvil) */}
          <div className="site-strip" role="tablist" aria-label={t.switchSite}>
            {sites.map((s) => {
              const st = text(s);
              return (
                <button key={s.id} type="button" role="tab" aria-selected={s.id === siteId} className={`site-pill ${s.id === siteId ? "is-active" : ""}`} onClick={() => chooseSite(s.id)}>
                  {siteIcon(s, 14)} <span>{st.changeLabel}</span> <small>{st.place.split(",").pop()?.trim()}</small>
                </button>
              );
            })}
          </div>

          <div className="metrics-grid">
            {(manifest?.stats ?? []).map((stat, index) => {
              const st = statText(stat);
              return (
                <article className="metric-card" key={stat.label}>
                  <div className={`metric-icon ${metricAccents[index]}`}>{metricIcons[index]}</div>
                  <p>{st.label.toUpperCase()}</p>
                  <div className="metric-number"><strong>{stat.value}</strong><span>{st.unit}</span></div>
                  <span className="metric-trend">{st.note}{isDemo ? " · demo" : ""}</span>
                </article>
              );
            })}
          </div>

          <section className="map-card" aria-label={`${t.mapOf} ${metric}`}>
            <div className="map-topline">
              <div className="map-place"><MapPin size={14} /><span>{siteText.place || "…"} <i>· {manifest ? formatCoord(manifest.lat, manifest.lon) : ""}</i></span></div>
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
                  <strong>{mode === "change" ? `${t.changeFrom} ${sd(manifest.dates[0])} → ${sd(manifest.dates[lastIndex])}` : metric.toUpperCase()}</strong>
                  <span className="legend-bar" style={{ background: `linear-gradient(90deg, ${legend.colors.join(",")})` }} />
                  <span className="legend-ends"><i>{legend.range[0]} {unit}</i>{legend.diverging && <i>0</i>}<i>{legend.range[1]} {unit}</i></span>
                  {explainer && mode !== "change" && <span className="legend-meaning"><b>{explainer.legendLow}</b><b>{explainer.legendHigh}</b></span>}
                </div>
              )}
              {mode === "swipe" && manifest && (
                <div className="swipe-dates"><span>{sd(manifest.dates[compareIndex])} · {t.before}</span><span>{sd(manifest.dates[dateIndex])} · {t.after}</span></div>
              )}
              <div className="map-hint"><MousePointerClick size={13} /> {t.clickHint}</div>
            </div>
            {manifest && (
              <div className="timeline">
                <div className="timeline-heading">
                  <div><strong>{t.timeSeries}</strong><span>{mode === "change" ? t.changeUsesEnds : t.every12(isDemo)}</span></div>
                  <span className="timeline-current">{sd(manifest.dates[dateIndex])} · {manifest.dates[dateIndex].slice(0, 4)}</span>
                </div>
                <div className="timeline-track">
                  <input aria-label={t.selectDate} aria-valuetext={ld(manifest.dates[dateIndex])} type="range" min="0" max={lastIndex} value={dateIndex}
                    disabled={mode === "change"}
                    onChange={(event) => setDateIndex(Number(event.target.value))}
                    style={{ "--range-progress": `${(dateIndex / Math.max(1, lastIndex)) * 100}%` } as React.CSSProperties} />
                  <div className="timeline-labels">
                    {manifest.dates.map((d, index) => (
                      <button type="button" key={d} className={index === dateIndex ? "is-current" : ""} aria-pressed={index === dateIndex} aria-label={t.showObservation(ld(d))}
                        disabled={mode === "change"} onClick={() => setDateIndex(index)}>{sd(d)}</button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>

          <div className="below-grid">
            <section className="detail-card">
              <div className="card-heading">
                <div><p className="eyebrow">{t.pointEyebrow}</p><h2>{pick ? formatCoord(pick.lat, pick.lon) : t.selectPoint}</h2></div>
                <span className="quiet-icon" aria-hidden="true"><MousePointerClick size={17} /></span>
              </div>
              <div className="observation-value" aria-live="polite">
                <strong>{currentValue === null || currentValue === undefined ? "—" : `${currentValue > 0 && manifest?.change === "deformation" ? "+" : ""}${currentValue.toFixed(1)}`}</strong>
                <span>{unit} · {manifest ? sd(manifest.dates[dateIndex]) : ""}</span>
              </div>
              {manifest && pointSeries && (
                <TimeSeriesChart dates={manifest.dates} values={pointSeries} unit={unit} activeIndex={dateIndex} onSelect={(i) => { setDateIndex(i); if (mode === "change") setMode("single"); }} />
              )}
              <div className="detail-meta">
                <span>{t.source} <b>{manifest?.source.product}{isDemo ? " · demo" : ""}</b></span>
                <span>{t.metric} <b>{metric}</b></span>
              </div>
            </section>
            <section className="review-card">
              <div className="review-icon"><Info size={17} /></div>
              <p className="eyebrow">{t.radarEyebrow}</p>
              <h2>{explainer?.title ?? "…"}</h2>
              <p>{explainer?.body}</p>
              <p className="review-limit">{isDemo ? t.demoLimit : t.realLimit}</p>
            </section>
          </div>
          <footer className="app-footer"><span>SAROS · TOBARU WORKTEAM <i>{t.footerLeft}</i></span><span>{isDemo ? t.footerDemo : t.footerReal}</span></footer>
        </motion.div>
      </div>
    </section>
  );
}
