"use client";

import { AnimatePresence, motion, useTransform } from "framer-motion";
import { ArrowLeft, Globe2, Leaf, MousePointerClick, Search, TriangleAlert, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MotionValue } from "framer-motion";
import { levelInfo } from "@/lib/insights";
import { useI18n } from "@/lib/i18n";
import { riskKindLabel, riskKinds, riskZones, type RiskZone } from "@/lib/risk-zones";
import { loadSites, type SiteSummary } from "@/lib/sites";
import LanguageModal from "@/components/language-modal";
import { HAZARDS_EVENT, type HazardPoints } from "@/lib/hazard-points";
import { COUNTRY_EVENT, closeCountry, focusZone, globeState, UI_REVEAL } from "./globe-state";
import { countryName, countryOf } from "@/lib/emergency";
import { hazardKind, pointCountry } from "@/lib/hazard-points";

const copy = {
  es: {
    search: "Buscar zona", placeholder: "Busca un lugar o tipo de riesgo (p. ej. Mocoa, volcán, Bogotá)…", none: "Sin resultados",
    latest: "Último evento detectado", accel: "Movimiento acelerado", view: "Ver zona",
    hint: "Toca un punto del planeta o búscalo", colombia: "Colombia", world: "Resto del mundo",
  },
  en: {
    search: "Search zone", placeholder: "Search a place or risk type (e.g. Mocoa, volcano, Bogotá)…", none: "No results",
    latest: "Latest detected event", accel: "Accelerating movement", view: "Open zone",
    hint: "Tap a point on the planet or search it", colombia: "Colombia", world: "Rest of the world",
  },
};

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Capa ligera sobre el planeta: último evento, cifras y buscador de zonas. */
export default function HeroOverlay({ progress, mobileMode }: { progress: MotionValue<number>; mobileMode: MotionValue<boolean> }) {
  const { lang, globalLang } = useI18n();
  const c = copy[lang];
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  // resumen de los registros reales de la base que se dibujan en el planeta
  const [hazards, setHazards] = useState<HazardPoints | null>(null);
  // país abierto en el planeta (un solo punto por país; al abrirlo, sus puntos)
  const [country, setCountry] = useState<string | null>(null);
  useEffect(() => {
    const onCountry = (event: Event) => setCountry((event as CustomEvent<string | null>).detail);
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && globeState.country && !globeState.selected) closeCountry(); };
    window.addEventListener(COUNTRY_EVENT, onCountry);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener(COUNTRY_EVENT, onCountry); window.removeEventListener("keydown", onKey); };
  }, []);
  const countryStats = useMemo(() => {
    if (!country) return null;
    const kinds = new Map<string, number>();
    let records = 0;
    for (const p of hazards?.points ?? []) {
      if (pointCountry(p) !== country) continue;
      records += p.n;
      kinds.set(p.kind, (kinds.get(p.kind) ?? 0) + p.n);
    }
    const zones = riskZones.filter((z) => countryOf(z) === country).length;
    return { records, zones, kinds: Array.from(kinds.entries()).sort((a, b) => b[1] - a[1]) };
  }, [country, hazards]);
  useEffect(() => {
    const onData = (event: Event) => setHazards((event as CustomEvent<HazardPoints>).detail);
    window.addEventListener(HAZARDS_EVENT, onData);
    return () => window.removeEventListener(HAZARDS_EVENT, onData);
  }, []);
  useEffect(() => {
    const onReveal = (event: Event) => setShown(Boolean((event as CustomEvent<boolean>).detail));
    window.addEventListener(UI_REVEAL, onReveal);
    const frame = requestAnimationFrame(() => setShown(globeState.uiRevealed));
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener(UI_REVEAL, onReveal);
    };
  }, []);
  const [mode, setMode] = useState<"all" | "risk" | "watch">("all");
  const changeMode = (next: "all" | "risk" | "watch") => setMode(next);
  useEffect(() => {
    globeState.mode = mode;
  }, [mode]);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const searchButtonY = useTransform(() => mobileMode.get()
    ? 0
    : -42 * Math.max(0, Math.min(1, progress.get() / 0.2)));

  useEffect(() => {
    loadSites().then(setSites).catch(() => setSites([]));
  }, []);

  // atajos: "/" o Ctrl+K abren el buscador
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = (event.target as HTMLElement)?.tagName === "INPUT";
      if ((event.key === "/" && !typing) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k")) {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 50);
  }, [open]);

  const results = useMemo(() => {
    const q = fold(query.trim());
    const match = (z: RiskZone) => !q || [z.name.es, z.name.en, z.place.es, z.place.en, riskKinds[z.kind].es, riskKinds[z.kind].en].some((v) => fold(v).includes(q));
    const list = riskZones.filter(match);
    return [...list.filter((z) => z.country === "CO"), ...list.filter((z) => z.country !== "CO")];
  }, [query]);

  const choose = (zone: RiskZone) => {
    setOpen(false);
    setQuery("");
    focusZone(zone.id);
  };

  return (
    <div className={`hero-overlay${shown ? " ui-shown" : ""}`}>
      <LanguageModal progress={progress} mobileMode={mobileMode} />
      <div className="mode-switch" role="radiogroup" aria-label={lang === "es" ? "Qué ver en el planeta" : "What to show"}>
        {([["all", lang === "es" ? "Todo" : "All"], ["risk", lang === "es" ? "Amenazas" : "Hazards"], ["watch", lang === "es" ? "Vigilancia ambiental" : "Environmental watch"]] as const).map(([value, label]) => (
          <button key={value} type="button" role="radio" aria-checked={mode === value} className={mode === value ? "is-active" : undefined} onClick={() => changeMode(value)}>
            <span className="mode-ico" aria-hidden="true">{value === "all" ? <Globe2 size={15} /> : value === "risk" ? <TriangleAlert size={15} /> : <Leaf size={15} />}</span>
            <span className="mode-label">{label}</span>
          </button>
        ))}
      </div>
      {hazards && hazards.located > 0 && !country && (
        <div className="hz-legend" title={hazards.note}>
          <i />
          <span><b>{hazards.located.toLocaleString(lang === "es" ? "es-CO" : "en-US")}</b> {lang === "es" ? "registros reales" : "real records"}</span>
          <small>{lang === "es" ? "Toca un país para verlos" : "Tap a country to see them"}</small>
        </div>
      )}
      <AnimatePresence>
        {country && countryStats && (
          <motion.div key={country} className="cy-panel" initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
            <button type="button" className="cy-back" onClick={closeCountry}>
              <ArrowLeft size={15} /> {lang === "es" ? "Volver al planeta" : "Back to the planet"}
            </button>
            <strong className="cy-name">{countryName(country, lang === "es" ? "es" : "en")}</strong>
            <span className="cy-total">
              {countryStats.records > 0 && <><b>{countryStats.records.toLocaleString(lang === "es" ? "es-CO" : "en-US")}</b> {lang === "es" ? "registros reales" : "real records"}</>}
              {countryStats.records > 0 && countryStats.zones > 0 && " · "}
              {countryStats.zones > 0 && <><b>{countryStats.zones}</b> {lang === "es" ? (countryStats.zones === 1 ? "zona vigilada" : "zonas vigiladas") : (countryStats.zones === 1 ? "watched zone" : "watched zones")}</>}
            </span>
            {countryStats.kinds.length > 0 && (
              <ul className="cy-kinds">
                {countryStats.kinds.slice(0, 7).map(([kind, n]) => (
                  <li key={kind} style={{ "--c": hazardKind(kind).color } as React.CSSProperties}>
                    <i />{hazardKind(kind)[lang === "es" ? "es" : "en"]}<b>{n.toLocaleString(lang === "es" ? "es-CO" : "en-US")}</b>
                  </li>
                ))}
              </ul>
            )}
            <small className="cy-hint"><MousePointerClick size={13} /> {lang === "es" ? "Pasa o toca un punto para ver su detalle; toca una zona para abrirla." : "Hover or tap a point for details; tap a zone to open it."}</small>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.button
        type="button"
        className="hero-search-btn"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={c.search}
        title={`${c.search} (/)`}
        style={{ y: searchButtonY }}
      >
        <Search size={16} />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div className="search-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)}>
            <motion.div className="search-panel" role="dialog" aria-label={c.search}
              initial={{ opacity: 0, y: -16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10 }}
              onClick={(event) => event.stopPropagation()}>
              <div className="search-input">
                <Search size={18} />
                <input ref={input} value={query} placeholder={c.placeholder} aria-label={c.search}
                  onChange={(event) => { setQuery(event.target.value); setCursor(0); }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") { event.preventDefault(); setCursor((i) => Math.min(results.length - 1, i + 1)); }
                    if (event.key === "ArrowUp") { event.preventDefault(); setCursor((i) => Math.max(0, i - 1)); }
                    if (event.key === "Enter" && results[cursor]) choose(results[cursor]);
                    if (event.key === "Escape") setOpen(false);
                  }} />
                <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar"><X size={16} /></button>
              </div>
              <ul className="search-results" role="listbox">
                {results.length === 0 && <li className="search-empty">{c.none}</li>}
                {results.map((zone, index) => {
                  const site = sites.find((s) => s.id === zone.siteId);
                  const firstWorld = index > 0 && zone.country !== "CO" && results[index - 1].country === "CO";
                  return (
                    <li key={zone.id} role="option" aria-selected={index === cursor}>
                      {(index === 0 && zone.country === "CO") && <p className="search-group">{c.colombia}</p>}
                      {(firstWorld || (index === 0 && zone.country !== "CO")) && <p className="search-group">{c.world}</p>}
                      <button type="button" className={index === cursor ? "is-active" : undefined} onMouseEnter={() => setCursor(index)} onClick={() => choose(zone)}>
                        <i style={{ background: riskKinds[zone.kind].color }} />
                        <span><strong>{zone.name[lang]}</strong><small>{zone.place[lang]}</small></span>
                        <em translate={zone.kind === "subsidence" && globalLang === "pt" ? "no" : undefined}>{riskKindLabel(zone.kind, lang, globalLang)}</em>
                        {site?.level && <b style={{ color: levelInfo[site.level].color }}>{levelInfo[site.level].short[lang]}</b>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
