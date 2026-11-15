"use client";

import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import {
  Beef, ChevronDown, CircleCheck, CloudRain, Coins, Crosshair, Droplets, Fish, Gauge, HeartPulse, History, House, Info,
  Landmark, ListChecks, Megaphone, Phone, Pickaxe, Route, ShieldAlert, Sparkles, Store, Trees, TrendingDown, TrendingUp, Wheat,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { emergencyFor, telHref } from "@/lib/emergency";
import { adviceNote, levelInfo, recommendations } from "@/lib/insights";
import { riskKindInfo, type RiskZone } from "@/lib/risk-zones";
import { exposureNames, sectorNames, type SectorImpact, type SectorKey } from "@/lib/sector-impacts";
import { longDate, type AttentionLevel, type SiteManifest } from "@/lib/sites";

const sectorIcons: Record<SectorKey, LucideIcon> = {
  agriculture: Wheat, livestock: Beef, mining: Pickaxe, housing: House, roads: Route, forest: Trees, water: Droplets,
  commerce: Store, fishing: Fish, health: HeartPulse, culture: Landmark, economy: Coins,
};

const copy = {
  es: {
    now: "Qué está pasando", nowSub: "Lo que mide el radar en las últimas pasadas",
    rate: "Ritmo actual", d90: "En 90 días", points: "Puntos a vigilar", pointsSub: "marcados en el mapa",
    accel: "acelerando", steady: "estable", trend: "Si la tendencia continúa", today: "hoy", plus90: "+90 días",
    impact: "A quién afecta", impactSub: "Toca un sector para ver qué le pasa y cómo reforzarlo",
    what: "Qué le pasa", how: "Cómo reforzar",
    history: "Qué pasó aquí", todo: "Qué hacer", todoSub: "Pasos concretos para la gente de la zona",
    call: "Emergencias · 123", official: "Información oficial", about: "Sobre estos datos",
    impactNote: "Escenario ilustrativo (DEMO): muestra exposición posible, no daños confirmados ni probabilidades. SAROS no predice terremotos.",
    watch: "Señales de extracción", suspicious: "Cambio sospechoso", conf: "confianza",
    watchNote: "SAROS detecta el cambio; no identifica responsables ni dice si es legal. Requiere verificación en campo.",
    lost: "Bosque perdido", recent30: "Últimos 30 días", pits: "Piscinas nuevas", water: "Agua en el área",
    cross: "Cruce con capas oficiales (demo)", title: "Título minero", protectedA: "Área protegida", territory: "Territorio", river: "Río",
    titleOut: "fuera de títulos", titlePart: "parcialmente fuera", none: "no",
    notify: "A quién avisar",
    notifyList: ["Autoridad ambiental regional (CAR)", "Parques Nacionales, si toca un área protegida", "Consejo comunitario o cabildo", "Fiscalía o Policía ambiental"],
  },
  en: {
    now: "What is happening", nowSub: "What radar measured over the latest passes",
    rate: "Current rate", d90: "In 90 days", points: "Watch points", pointsSub: "marked on the map",
    accel: "accelerating", steady: "steady", trend: "If the trend continues", today: "today", plus90: "+90 days",
    impact: "Who is affected", impactSub: "Tap a sector to see what happens and how to reinforce it",
    what: "What happens", how: "How to reinforce",
    history: "What happened here", todo: "What to do", todoSub: "Concrete steps for people in the area",
    call: "Emergencies · 123", official: "Official information", about: "About this data",
    impactNote: "Illustrative scenario (DEMO): shows possible exposure, not confirmed damage or probabilities. SAROS does not predict earthquakes.",
    watch: "Extraction signals", suspicious: "Suspicious change", conf: "confidence",
    watchNote: "SAROS detects the change; it does not identify who is responsible or whether it is legal. Field verification required.",
    lost: "Forest lost", recent30: "Last 30 days", pits: "New ponds", water: "Water in the area",
    cross: "Cross-check with official layers (demo)", title: "Mining title", protectedA: "Protected area", territory: "Territory", river: "River",
    titleOut: "outside titles", titlePart: "partly outside", none: "no",
    notify: "Who to notify",
    notifyList: ["Regional environmental authority", "National Parks, if it touches a protected area", "Community council or indigenous authority", "Prosecutors or environmental police"],
  },
};

/** Número que cuenta hasta su valor (solo actualiza el texto: barato). */
function CountUp({ value, decimals = 0, duration = 900 }: { value: number; decimals?: number; duration?: number }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fmt = (v: number) => v.toLocaleString("es-CO", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    if (reduce) { el.textContent = fmt(value); return; }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = fmt(value * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, decimals, duration, reduce]);
  return <span ref={ref}>0</span>;
}

/** Icono para cada recomendación según lo que pide. */
function adviceIcon(text: string): LucideIcon {
  const t = text.toLowerCase();
  if (/123|emergenc/.test(t)) return Phone;
  if (/evac|ruta|alej/.test(t)) return Route;
  if (/report|denunc|compart|avise/.test(t)) return Megaphone;
  if (/lluvia|rain/.test(t)) return CloudRain;
  if (/agua|pescado|río|water|fish/.test(t)) return Droplets;
  if (/grieta|crack/.test(t)) return Crosshair;
  return CircleCheck;
}

const list: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } } };
const item: Variants = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } } };

function SectionHead({ icon: Icon, title, sub, tone = "#a78bfa" }: { icon: LucideIcon; title: string; sub?: string; tone?: string }) {
  return (
    <header className="zs-head">
      <span className="zs-head-icon" style={{ "--tone": tone } as React.CSSProperties}><Icon size={15} /></span>
      <div><h3>{title}</h3>{sub && <p>{sub}</p>}</div>
    </header>
  );
}

type Props = {
  zone: RiskZone;
  active: SiteManifest | null;
  level: AttentionLevel;
  colombia: boolean;
  siteId: string | null;
  lang: "es" | "en";
  impacts: SectorImpact[];
  trend: string | null;
  noData: React.ReactNode;
};

/** Vista simple de la zona, en tarjetas: resumen en burbujas, sectores que se despliegan y pasos con iconos. */
export default function ZoneSimple({ zone, active, level, colombia, siteId, lang, impacts, trend, noData }: Props) {
  const c = copy[lang];
  const reduce = useReducedMotion();
  const [openSector, setOpenSector] = useState<SectorKey | null>(null);
  // el recorrido de Saru puede abrir la ficha del sector del que habla
  useEffect(() => {
    const onOpen = (event: Event) => setOpenSector((event as CustomEvent<SectorKey>).detail);
    window.addEventListener("saros:open-sector", onOpen);
    return () => window.removeEventListener("saros:open-sector", onOpen);
  }, []);
  const a = active?.assessment;
  const x = active?.extraction ?? null;
  const advice = recommendations(zone.kind, level, colombia, lang);
  const emergency = advice.find((t) => /123/.test(t));
  const steps = advice.filter((t) => t !== emergency);
  // a quién llamar en este país y para esta amenaza
  const sos = emergencyFor(zone, lang);
  const open = impacts.find((i) => i.sector === openSector) ?? null;
  const lvl = levelInfo[level];

  // minigráfica: hoy y la proyección a 30 y 90 días (línea discontinua)
  const spark = (() => {
    if (!a) return null;
    const vals = [0, a.current, a.projection.d30, a.projection.d90];
    const min = Math.min(...vals), max = Math.max(...vals);
    const span = max - min || 1;
    const xs = [0, 62, 78, 100];
    const pts = vals.map((v, i) => [xs[i] * 2.4, 46 - ((v - min) / span) * 40] as const);
    const solid = `M${pts[0][0]} ${pts[0][1]} C${pts[0][0] + 60} ${pts[0][1]} ${pts[1][0] - 50} ${pts[1][1]} ${pts[1][0]} ${pts[1][1]}`;
    const dashed = `M${pts[1][0]} ${pts[1][1]} L${pts[2][0]} ${pts[2][1]} L${pts[3][0]} ${pts[3][1]}`;
    return { solid, dashed, end: pts[3], now: pts[1] };
  })();

  return (
    <motion.div className="zone-simple zs" variants={list} initial={reduce ? false : "hidden"} animate="show">
      {/* 1 · Resumen en burbujas */}
      <motion.section className="zs-card zs-now" data-tour="now" variants={item} style={{ "--lvl": lvl.color } as React.CSSProperties}>
        <SectionHead icon={Gauge} title={c.now} sub={c.nowSub} tone={lvl.color} />
        {a ? (
          <>
            <div className="zs-bubbles">
              <div className="zs-bubble">
                <small>{c.rate}</small>
                <strong>{a.rate.recent > 0 ? "+" : "−"}<CountUp value={Math.abs(a.rate.recent)} decimals={1} /><span className="zs-u">{lang === "es" ? a.rate.unit : a.rate.unitEn}</span></strong>
                <em className={a.accelerating ? "is-hot" : ""}>{a.accelerating ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{a.accelerating ? c.accel : c.steady}</em>
              </div>
              <div className="zs-bubble">
                <small>{c.d90}</small>
                <strong><CountUp value={a.projection.d90} decimals={0} /><span className="zs-u">{a.projection.unit}</span></strong>
                <em>{c.trend}</em>
              </div>
              <div className="zs-bubble">
                <small>{c.points}</small>
                <strong><CountUp value={a.hotspots.length} /></strong>
                <em>{c.pointsSub}</em>
              </div>
            </div>
            {spark && (
              <svg className="zs-spark" viewBox="0 0 240 52" aria-hidden="true">
                <defs><linearGradient id={`zs-g-${zone.id}`} x1="0" x2="1"><stop offset="0" stopColor="#8b5cf6" /><stop offset="1" stopColor={lvl.color} /></linearGradient></defs>
                <motion.path d={spark.solid} fill="none" stroke={`url(#zs-g-${zone.id})`} strokeWidth="2.5" strokeLinecap="round"
                  initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1], delay: 0.2 }} />
                <motion.path d={spark.dashed} fill="none" stroke={lvl.color} strokeWidth="2" strokeDasharray="4 4"
                  initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2, duration: 0.5 }} />
                <circle cx={spark.now[0]} cy={spark.now[1]} r="3.5" fill="#fff" />
                <circle className="zs-ping" cx={spark.end[0]} cy={spark.end[1]} r="4" fill={lvl.color} />
                <text x="2" y="51" className="zs-spark-l">{c.today === "hoy" ? "hace 3 meses" : "3 months ago"}</text>
                <text x={spark.now[0] - 8} y="51" className="zs-spark-l">{c.today}</text>
                <text x="226" y="51" textAnchor="end" className="zs-spark-l">{c.plus90}</text>
              </svg>
            )}
            {trend && <p className="zs-lead" style={{ fontSize: 12, lineHeight: 1.5, color: "#9aa6c6" }}>{trend}</p>}
          </>
        ) : (
          <p className="zs-lead">{siteId ? "…" : riskKindInfo[zone.kind][lang]}</p>
        )}
      </motion.section>

      {/* 2 · Señales de extracción (vigilancia ambiental) */}
      {x && (() => {
        const confColor = x.confidence === "alta" ? "#f43f5e" : x.confidence === "media" ? "#f59e0b" : "#94a3c4";
        const titleText = x.context.miningTitle === "fuera" ? c.titleOut : x.context.miningTitle === "parcial" ? c.titlePart : x.context.miningTitle;
        return (
          <motion.section className="zs-card zone-watch" data-tour="watch" variants={item}>
            <SectionHead icon={ShieldAlert} title={c.watch} tone={confColor} />
            <div className="watch-alert" style={{ "--conf": confColor } as React.CSSProperties}>
              <b><i />{c.suspicious} · {c.conf} {x.confidence}</b>
              <p>{c.watchNote}</p>
            </div>
            <div className="zs-bubbles zs-bubbles-2">
              <div className="zs-bubble"><small>{c.lost}</small><strong><CountUp value={x.forestLostHa} /><span className="zs-u">ha</span></strong></div>
              <div className="zs-bubble"><small>{c.recent30}</small><strong><CountUp value={x.recentHa} /><span className="zs-u">ha</span></strong></div>
              {x.kind === "mining" && <div className="zs-bubble"><small>{c.pits}</small><strong><CountUp value={x.pits} /></strong></div>}
              {x.waterChangePct !== null && <div className="zs-bubble"><small>{c.water}</small><strong>+<CountUp value={x.waterChangePct} /><span className="zs-u">%</span></strong></div>}
            </div>
            <p className="zs-sub">{c.cross}</p>
            <div className="zs-tags">
              {x.context.miningTitle && <span className={x.context.miningTitle === "fuera" ? "is-bad" : x.context.miningTitle === "parcial" ? "is-warn" : ""}><b>{c.title}</b>{titleText}</span>}
              {x.context.protected && <span className={x.context.protected !== "no" ? "is-warn" : ""}><b>{c.protectedA}</b>{x.context.protected === "no" ? c.none : x.context.protected}</span>}
              {x.context.territory && <span><b>{c.territory}</b>{x.context.territory}</span>}
              {x.context.river && <span><b>{c.river}</b>{x.context.river}</span>}
            </div>
            <p className="zs-sub">{c.notify}</p>
            <ol className="zs-steps zs-steps-compact">
              {c.notifyList.map((t, i) => <li key={t}><span className="zs-step-n">{i + 1}</span><p>{t}</p></li>)}
            </ol>
          </motion.section>
        );
      })()}

      {/* 3 · Sectores en fichas que se despliegan */}
      {impacts.length > 0 && (
        <motion.section className="zs-card" data-tour="sectors" variants={item}>
          <SectionHead icon={Sparkles} title={c.impact} sub={c.impactSub} />
          <div className="zs-sectors">
            {impacts.map((s) => {
              const Icon = sectorIcons[s.sector];
              const color = exposureNames[s.exposure].color;
              const isOpen = openSector === s.sector;
              return (
                <button key={s.sector} type="button" className={`zs-sector${isOpen ? " is-open" : ""}${s.exposure === "high" ? " is-high" : ""}`}
                  style={{ "--exp": color } as React.CSSProperties} aria-expanded={isOpen} onClick={() => { setOpenSector(isOpen ? null : s.sector); window.dispatchEvent(new CustomEvent("saros:sector", { detail: isOpen ? null : s.sector })); }}>
                  <span className="zs-sector-icon"><Icon size={17} /></span>
                  <span className="zs-sector-name">{sectorNames[s.sector][lang]}<small>{exposureNames[s.exposure][lang]}</small></span>
                  <ChevronDown size={14} className="zs-chevron" />
                </button>
              );
            })}
          </div>
          <AnimatePresence mode="wait" initial={false}>
            {open && (
              <motion.div key={open.sector} className="zs-detail" style={{ "--exp": exposureNames[open.exposure].color } as React.CSSProperties}
                initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
                <div><small>{c.what}</small><p>{open.effect[lang]}</p></div>
                <div><small>{c.how}</small><p>{open.reinforce[lang]}</p></div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>
      )}

      {/* 4 · Qué pasó aquí */}
      {zone.event && (
        <motion.section className="zs-card zs-event" data-tour="event" variants={item}>
          <SectionHead icon={History} title={c.history} tone="#38bdf8" />
          <div className="zs-timeline"><span className="zs-date">{longDate(zone.event.date, lang)}</span><p>{zone.event[lang]}</p></div>
        </motion.section>
      )}

      {/* 5 · Qué hacer: pasos con icono */}
      <motion.section className="zs-card" data-tour="todo" variants={item}>
        <SectionHead icon={ListChecks} title={c.todo} sub={c.todoSub} tone="#10b981" />
        <motion.ol className="zs-steps" variants={list}>
          {steps.map((t, i) => {
            const Icon = adviceIcon(t);
            return (
              <motion.li key={t} variants={item}>
                <span className="zs-step-icon"><Icon size={15} /></span>
                <p>{t}</p>
                <span className="zs-step-n">{i + 1}</span>
              </motion.li>
            );
          })}
        </motion.ol>
        {sos && (
          <div className="zs-sos" data-tour="call">
            {sos.callable ? (
              <a className="zs-call" href={telHref(sos.first.n)}>
                <Phone size={15} /> <span className="zs-call-what">{sos.first.label[lang]}</span>
                <b className={`zs-call-n${sos.first.n.length > 6 ? " is-long" : ""}`}>{sos.first.n}</b>
                <span className="zs-call-where">{sos.countryName}</span>
              </a>
            ) : (
              <div className="zs-call is-off"><Phone size={15} /> <span className="zs-call-what">{sos.note}</span></div>
            )}
            {sos.others.length > 0 && (
              <div className="zs-sos-more">
                {sos.others.map((l) => (
                  <a key={l.n} href={telHref(l.n)}><b>{l.n}</b><span>{l.label[lang]}</span></a>
                ))}
              </div>
            )}
            {sos.agencies && <p className="zs-sos-src">{c.official}: <span translate="no" className="notranslate">{sos.agencies}</span></p>}
          </div>
        )}
      </motion.section>

      {noData}

      {/* Notas legales en una sola línea plegable */}
      <motion.details className="zs-foot" variants={item}>
        <summary><Info size={13} /> {c.about}</summary>
        <p>{c.impactNote}</p>
        <p>{adviceNote[lang]}</p>
      </motion.details>
    </motion.div>
  );
}
