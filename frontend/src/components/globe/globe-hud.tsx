"use client";

import { AnimatePresence, motion, type MotionValue } from "framer-motion";
import { ChevronDown, Crosshair, Hand, Radar, Satellite, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SITE_EVENT } from "@/components/explorer-dashboard";
import { useI18n } from "@/lib/i18n";
import { riskKinds, riskZones, type RiskKind, type RiskZone } from "@/lib/risk-zones";
import { formatCoord } from "@/lib/sites";
import { GLOBE_DETECT, GLOBE_RECON, GLOBE_SELECT, focusZone, globeState, type DetectEvent, type ReconEvent } from "./globe-state";

const copy = {
  es: {
    recon: "RECONOCIMIENTO NISAR",
    scanning: "Barriendo el planeta…",
    waiting: "Preparando el radar…",
    active: "Órbita activa · vigilancia continua",
    detected: "zonas de riesgo detectadas",
    zones: "Zonas",
    feed: "DETECCIONES DEL HAZ",
    feedEmpty: "Esperando la próxima pasada del radar…",
    ago: (s: number) => (s < 5 ? "ahora" : s < 60 ? `hace ${s} s` : `hace ${Math.floor(s / 60)} min`),
    toast: "Haz NISAR sobre",
    hint: "Arrastra para girar · clic en una zona",
    open: "Abrir en el explorador",
    noData: "Zona de interés: aún sin capas en el prototipo.",
    close: "Cerrar",
    altitude: "Altitud", bands: "Radar", swath: "Franja", revisit: "Revisita",
    illustrative: "Barrido y detecciones ilustrativos",
  },
  en: {
    recon: "NISAR RECONNAISSANCE",
    scanning: "Sweeping the planet…",
    waiting: "Warming up the radar…",
    active: "Orbit active · continuous watch",
    detected: "risk zones detected",
    zones: "Zones",
    feed: "BEAM DETECTIONS",
    feedEmpty: "Waiting for the next radar pass…",
    ago: (s: number) => (s < 5 ? "now" : s < 60 ? `${s} s ago` : `${Math.floor(s / 60)} min ago`),
    toast: "NISAR beam over",
    hint: "Drag to spin · click a zone",
    open: "Open in the explorer",
    noData: "Zone of interest: no layers in the prototype yet.",
    close: "Close",
    altitude: "Altitude", bands: "Radar", swath: "Swath", revisit: "Revisit",
    illustrative: "Illustrative sweep and detections",
  },
};

const kindInfo: Record<RiskKind, { es: string; en: string }> = {
  landslide: { es: "La interferometría mide milímetros de movimiento lento de la ladera antes de que falle.", en: "Interferometry measures millimetres of slow slope creep before failure." },
  subsidence: { es: "Interferogramas sucesivos revelan cuánto se hunde el suelo cada año.", en: "Successive interferograms reveal how much the ground sinks each year." },
  flood: { es: "El agua tranquila se ve oscura en la retrodispersión: la extensión se mapea aunque haya nubes.", en: "Calm water looks dark in backscatter, so flood extent is mapped even under clouds." },
  glacier: { es: "El seguimiento de desplazamientos mide cuántos metros al día avanza el hielo.", en: "Offset tracking measures how many metres per day the ice advances." },
  deforestation: { es: "La señal HV cae cuando se tala el bosque, incluso bajo nubes tropicales.", en: "HV signal drops when forest is cleared, even under tropical clouds." },
  volcano: { es: "La inflación del suelo antes de una erupción aparece como franjas en el interferograma.", en: "Ground inflation before an eruption shows up as interferogram fringes." },
  earthquake: { es: "El interferograma muestra cuánto se desplazó el terreno a cada lado de la falla.", en: "Interferograms show how far the ground moved on each side of the fault." },
  wildfire: { es: "Los cambios de retrodispersión delimitan las cicatrices de incendio.", en: "Backscatter change outlines burn scars." },
};

type FeedItem = { id: string; at: number; key: number };

/** Interfaz sobre el globo: reconocimiento, detecciones del haz y ficha de la zona elegida. */
export default function GlobeHud({ fade }: { fade: MotionValue<number> }) {
  const { lang } = useI18n();
  const c = copy[lang];
  const [recon, setRecon] = useState<ReconEvent>({ progress: 0, found: 0 });
  const [revealed, setRevealed] = useState<string[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [toast, setToast] = useState<FeedItem | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const onRecon = (event: Event) => {
      setRecon((event as CustomEvent<ReconEvent>).detail);
      setRevealed([...globeState.revealed]);
    };
    let counter = 0;
    let toastTimer: ReturnType<typeof setTimeout> | undefined;
    const onDetect = (event: Event) => {
      const detail = (event as CustomEvent<DetectEvent>).detail;
      if (detail.source !== "pass") return;
      const item = { id: detail.id, at: Date.now(), key: ++counter };
      setFeed((current) => [item, ...current.filter((f) => f.id !== detail.id)].slice(0, 4));
      if (detail.visible) {
        setToast(item);
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => setToast(null), 2800);
      }
    };
    const onSelect = (event: Event) => setSelected((event as CustomEvent<string | null>).detail);
    window.addEventListener(GLOBE_RECON, onRecon);
    window.addEventListener(GLOBE_DETECT, onDetect);
    window.addEventListener(GLOBE_SELECT, onSelect);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.removeEventListener(GLOBE_RECON, onRecon);
      window.removeEventListener(GLOBE_DETECT, onDetect);
      window.removeEventListener(GLOBE_SELECT, onSelect);
      clearInterval(tick);
      clearTimeout(toastTimer);
    };
  }, []);

  const zone = (id: string) => riskZones.find((z) => z.id === id) as RiskZone;
  const kindCounts = useMemo(() => {
    const counts = new Map<RiskKind, number>();
    for (const id of revealed) {
      const z = riskZones.find((r) => r.id === id);
      if (z) counts.set(z.kind, (counts.get(z.kind) ?? 0) + 1);
    }
    return [...counts.entries()];
  }, [revealed]);

  const scanning = recon.progress > 0 && recon.progress < 1;
  const done = recon.progress >= 1;
  const current = selected ? zone(selected) : null;

  const openExplorer = (siteId: string) => {
    window.dispatchEvent(new CustomEvent(SITE_EVENT, { detail: siteId }));
    document.getElementById("explorador")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <motion.div className="globe-hud" style={{ opacity: fade }}>
      {/* Reconocimiento */}
      <section className="hud-panel hud-recon" aria-label={c.recon}>
        <header className="hud-head">
          <span className="hud-eyebrow"><Radar size={13} /> {c.recon}</span>
        </header>
        <p className={`hud-status ${done ? "is-active" : ""}`} aria-live="polite">
          <i />{done ? c.active : scanning ? `${c.scanning} ${Math.round(recon.progress * 100)}%` : c.waiting}
        </p>
        <div className="hud-progress" aria-hidden="true"><span style={{ transform: `scaleX(${recon.progress})` }} /></div>
        <div className="hud-count">
          <strong>{recon.found}</strong><span>/ {riskZones.length}</span>
          <small>{c.detected}</small>
        </div>
        <div className="hud-kinds">
          {kindCounts.map(([kind, count]) => (
            <span key={kind} className="hud-kind"><i style={{ background: riskKinds[kind].color }} />{riskKinds[kind][lang]} <b>{count}</b></span>
          ))}
        </div>
        <button type="button" className="hud-list-toggle" aria-expanded={listOpen} onClick={() => setListOpen((v) => !v)}>
          {c.zones} ({revealed.length}) <ChevronDown size={14} className={listOpen ? "is-open" : undefined} />
        </button>
        {listOpen && (
          <ul className="hud-list">
            {riskZones.filter((z) => revealed.includes(z.id)).map((z) => (
              <li key={z.id}>
                <button type="button" className={selected === z.id ? "is-selected" : undefined} onClick={() => focusZone(z.id)}>
                  <i style={{ background: riskKinds[z.kind].color }} />
                  <span>{z.place[lang]}</span>
                  <small>{riskKinds[z.kind][lang]}{z.siteId ? (lang === "en" ? " · data" : " · datos") : ""}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Detecciones del haz */}
      <section className="hud-panel hud-feed" aria-label={c.feed}>
        <span className="hud-eyebrow"><Satellite size={13} /> {c.feed}</span>
        {feed.length === 0 ? <p className="hud-empty">{c.feedEmpty}</p> : (
          <ul>
            <AnimatePresence initial={false}>
              {feed.map((item) => {
                const z = zone(item.id);
                return (
                  <motion.li key={item.key} layout initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.35 }}>
                    <button type="button" onClick={() => focusZone(z.id)}>
                      <i style={{ background: riskKinds[z.kind].color }} />
                      <span><strong>{riskKinds[z.kind][lang]}</strong> {z.place[lang]}</span>
                      <small>{c.ago(Math.max(0, Math.round((now - item.at) / 1000)))}</small>
                    </button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </section>

      {/* Aviso de cada pasada visible */}
      <AnimatePresence>
        {toast && (
          <motion.div key={toast.key} className="hud-toast" role="status"
            initial={{ opacity: 0, y: -14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
            <span className="hud-toast-pulse" style={{ background: riskKinds[zone(toast.id).kind].color }} />
            <span>{c.toast} <strong>{riskKinds[zone(toast.id).kind][lang]}</strong> · {zone(toast.id).place[lang]}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ficha de la zona elegida */}
      <AnimatePresence>
        {current && (
          <motion.section key={current.id} className="hud-panel hud-card" aria-live="polite"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} transition={{ duration: 0.3 }}>
            <button type="button" className="hud-close" aria-label={c.close} onClick={() => setSelected(null)}><X size={15} /></button>
            <span className="hud-kind-tag" style={{ color: riskKinds[current.kind].color }}><Crosshair size={13} /> {riskKinds[current.kind][lang]}</span>
            <h3>{current.name[lang]}</h3>
            <p className="hud-place">{current.place[lang]} · {formatCoord(current.lat, current.lon)}</p>
            <p className="hud-info">{kindInfo[current.kind][lang]}</p>
            {current.siteId
              ? <button type="button" className="hud-open" onClick={() => openExplorer(current.siteId!)}>{c.open} →</button>
              : <p className="hud-nodata">{c.noData}</p>}
          </motion.section>
        )}
      </AnimatePresence>

      {/* Datos de la misión */}
      <div className="hud-telemetry">
        <span><b>{c.altitude}</b> 747 km</span>
        <span><b>{c.bands}</b> L + S</span>
        <span><b>{c.swath}</b> 242 km</span>
        <span><b>{c.revisit}</b> 12 d</span>
        <span className="hud-hint"><Hand size={13} /> {c.hint}</span>
        <span className="hud-note">{c.illustrative}</span>
      </div>
    </motion.div>
  );
}
