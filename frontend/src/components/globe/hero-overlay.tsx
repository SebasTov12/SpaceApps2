"use client";

import { AnimatePresence, motion, useTransform, type MotionValue } from "framer-motion";
import { ArrowRight, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { levelInfo } from "@/lib/insights";
import { useI18n } from "@/lib/i18n";
import { riskKinds, riskZones, type RiskZone } from "@/lib/risk-zones";
import { loadSites, type SiteSummary } from "@/lib/sites";
import { focusZone, globeState } from "./globe-state";

const copy = {
  es: {
    search: "Buscar zona", placeholder: "Busca un lugar o tipo de riesgo (p. ej. Mocoa, volcán, Bogotá)…", none: "Sin resultados",
    latest: "Último evento detectado", accel: "Movimiento acelerado", view: "Ver zona",
    stats: (total: number, co: number, high: number) => `${total} zonas vigiladas · ${co} en Colombia · ${high} en atención alta`,
    hint: "Toca un punto del planeta o búscalo", colombia: "Colombia", world: "Resto del mundo",
  },
  en: {
    search: "Search zone", placeholder: "Search a place or risk type (e.g. Mocoa, volcano, Bogotá)…", none: "No results",
    latest: "Latest detected event", accel: "Accelerating movement", view: "Open zone",
    stats: (total: number, co: number, high: number) => `${total} zones watched · ${co} in Colombia · ${high} at high attention`,
    hint: "Tap a point on the planet or search it", colombia: "Colombia", world: "Rest of the world",
  },
};

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Capa ligera sobre el planeta: último evento, cifras y buscador de zonas. */
export default function HeroOverlay({ progress: _progress }: { progress: MotionValue<number> }) {
  const { lang } = useI18n();
  const c = copy[lang];
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSites().then((list) => {
      setSites(list);
      // el último evento: Colombia primero, con aceleración o atención alta
      const pick = list.find((s) => s.country === "CO" && s.accelerating) ?? list.find((s) => s.country === "CO" && s.level === "alta") ?? list[0];
      if (pick) globeState.featured = pick.id;
    }).catch(() => setSites([]));
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

  const featured = sites.find((s) => s.id === globeState.featured) ?? null;
  const featuredZone = riskZones.find((z) => z.id === featured?.id);
  const high = sites.filter((s) => s.level === "alta").length;
  const colombia = riskZones.filter((z) => z.country === "CO").length;

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
    <div className="hero-overlay">
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
                        <em>{riskKinds[zone.kind][lang]}</em>
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
