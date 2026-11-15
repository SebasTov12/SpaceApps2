"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { History, Mic, Minus, Pause, Play, Send, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { emergencyFor } from "@/lib/emergency";
import { recommendations } from "@/lib/insights";
import { isAutoLang, useI18n } from "@/lib/i18n";
import { riskZones, watchKinds, type RiskZone } from "@/lib/risk-zones";
import { sectorImpacts, sectorNames, type SectorKey } from "@/lib/sector-impacts";
import { loadManifest, type AttentionLevel, type SiteManifest } from "@/lib/sites";
import { OPEN_SECTOR_EVENT, QUICK_QUESTIONS, TOUR_EVENT, allReplySentences, answer, sentences, type SaroAction, type TourKey } from "@/lib/saro-brain";
import { GLOBE_SELECT, UI_REVEAL, focusZone, globeState } from "./globe-state";

/** Evento que lanza el panel cuando se abre la ficha de un sector (Saro reacciona). */
export const SECTOR_EVENT = "saros:sector";
/** Evento con el que Saro pide al mapa señalar puntos o explicar colores. */
export const POINT_EVENT = "saros:point";

/** Texto del asistente sin marcas de formato (para mostrarlo y leerlo en voz alta). */
function plainText(t: string) {
  return t
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\*\*|__|`|#{1,6}\s?/g, "")
    .replace(/^\s*[-*•]\s+/gm, "• ")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/** Un paso del recorrido: lo que Saru dice, qué señala en el mapa y qué resalta en el panel. */
type TourStep = { text: string; action?: SaroAction; tour?: TourKey; openSector?: SectorKey };

/** Recorrido de una zona: punto por punto en el mapa y parte por parte en el panel. */
function stepsFor(zone: RiskZone | null, m: SiteManifest | null, lang: "es" | "en"): TourStep[] {
  const lines = scriptFor(zone, m, lang);
  if (!zone || lang !== "es") return lines.map((text) => ({ text }));
  const a = m?.assessment;
  const x = m?.extraction;
  const steps: TourStep[] = [];
  const legend = m?.extraction?.kind === "mining" ? "mining" : m?.change === "deformation" ? "deformation" : zone.kind === "flood" ? "flood" : "forest";
  for (const text of lines) {
    if (/^Ojo con esta zona|está en atención|^Te muestro/.test(text)) steps.push({ text, tour: "level" });
    else if (/^El suelo|^El cambio avanza|^Aquí se perdieron/.test(text)) steps.push({ text, tour: x ? "watch" : "now", action: { type: "legend", kind: legend } });
    else if (/^Veo |^No sé quién/.test(text)) steps.push({ text, tour: "watch" });
    else if (/^Marqué/.test(text) && a?.hotspots.length) {
      const unit = (a.rate.unit || "").replace(/\/mes$/, "");
      const mining = x?.kind === "mining";
      const label = mining ? "Posible piscina nueva" : zone.kind === "deforestation" ? "Bosque perdido reciente" : zone.kind === "flood" ? "Agua que cambia rápido" : "Movimiento más rápido";
      steps.push({ text: `Te muestro los ${a.hotspots.length} puntos donde el cambio reciente es más rápido, uno por uno.`, action: { type: "hotspots", label } });
      a.hotspots.slice(0, 4).forEach((h, i) => {
        const what = mining ? "una posible piscina nueva junto al río"
          : zone.kind === "deforestation" ? "bosque que se perdió hace poco"
          : zone.kind === "flood" ? "el agua cambió rápido"
          : m?.change === "deformation" ? `el suelo ${a.rate.recent < 0 ? "bajó" : "subió"} ${fmt(h.value)} ${unit} en las últimas pasadas`
          : "un cambio rápido del terreno";
        steps.push({
          text: `Punto ${i + 1}: aquí ${what}.${i === 0 ? " Es el que más cambia." : ""}`,
          action: { type: "point", index: i, label: `Punto ${i + 1} · ${label}`, sub: m?.change === "deformation" && !mining ? `${a.rate.recent < 0 ? "−" : "+"}${fmt(h.value)} ${unit}` : "revisar en campo" },
        });
      });
    } else if (/^Lo más expuesto/.test(text)) {
      steps.push({ text, tour: "sectors" });
      const top = sectorImpacts(zone.id, zone.kind)[0];
      if (top) steps.push({ text: `Por ejemplo, ${sectorNames[top.sector].es.toLowerCase()}: ${lower(firstSentence(top.effect.es))}`, tour: "sectors", openSector: top.sector });
    } else if (/^Si vives cerca/.test(text)) {
      if (zone.event) steps.push({ text: `Y ojo, aquí ya pasó algo: ${lower(zone.event.es)}`, tour: "event" });
      steps.push({ text, tour: "todo" });
    } else if (/^Y si ves una emergencia/.test(text)) steps.push({ text, tour: "call" });
    else steps.push({ text });
  }
  return steps;
}
const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

type Mood = "happy" | "attentive" | "worried";
type SpeechRecognitionLike = {
  lang: string; interimResults: boolean; start: () => void;
  onresult: ((e: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void) | null;
  onerror: (() => void) | null; onend: (() => void) | null;
};
const moodFor = (level?: AttentionLevel): Mood => (level === "alta" ? "worried" : level === "moderada" ? "attentive" : "happy");

/** Saru: satélite-explorador de SAROS (dibujo original en SVG; animado solo con transform/opacity). */
function SaroFigure({ mood, talking }: { mood: Mood; talking: boolean }) {
  const eye = mood === "happy"
    ? <><path d="M44 72 Q50 64 56 72" /><path d="M64 72 Q70 64 76 72" /></>
    : mood === "worried"
      ? <><ellipse cx="50" cy="72" rx="4.5" ry="5" /><ellipse cx="70" cy="72" rx="4.5" ry="5" /></>
      : <><ellipse cx="50" cy="71" rx="5" ry="6.5" /><ellipse cx="70" cy="71" rx="5" ry="6.5" /></>;
  return (
    <svg className={`saro-fig mood-${mood}${talking ? " is-talking" : ""}`} viewBox="0 0 120 140" aria-hidden="true">
      <defs>
        <linearGradient id="saro-body" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f4f6ff" /><stop offset="1" stopColor="#b7c1ee" /></linearGradient>
        <linearGradient id="saro-panel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6d4bd8" /><stop offset="1" stopColor="#2b3a9e" /></linearGradient>
        <radialGradient id="saro-glow"><stop offset="0" stopColor="#5ef0ff" stopOpacity=".8" /><stop offset="1" stopColor="#5ef0ff" stopOpacity="0" /></radialGradient>
      </defs>
      <ellipse className="saro-thrust" cx="60" cy="128" rx="22" ry="6" fill="url(#saro-glow)" />
      <g className="saro-bob">
        {/* alas: paneles solares */}
        <g className="saro-wing saro-wing-l">
          <rect x="2" y="60" width="26" height="22" rx="3" fill="url(#saro-panel)" stroke="#a78bfa" strokeWidth="1" />
          <path d="M15 60V82M2 71H28" stroke="#a78bfa" strokeOpacity=".6" strokeWidth="1" />
          <rect x="26" y="69" width="5" height="4" rx="1" fill="#c9d2f5" />
        </g>
        <g className="saro-wing saro-wing-r">
          <rect x="92" y="60" width="26" height="22" rx="3" fill="url(#saro-panel)" stroke="#a78bfa" strokeWidth="1" />
          <path d="M105 60V82M92 71H118" stroke="#a78bfa" strokeOpacity=".6" strokeWidth="1" />
          <rect x="89" y="69" width="5" height="4" rx="1" fill="#c9d2f5" />
        </g>
        {/* antena con plato de radar */}
        <line x1="60" y1="42" x2="60" y2="27" stroke="#c9d2f5" strokeWidth="3" strokeLinecap="round" />
        <g className="saro-dish"><path d="M48 24 Q60 12 72 24" fill="none" stroke="#e8ecff" strokeWidth="3.5" strokeLinecap="round" /></g>
        <circle className="saro-tip" cx="60" cy="18" r="3.2" fill="#5ef0ff" />
        {/* cuerpo */}
        <rect x="28" y="40" width="64" height="74" rx="30" fill="url(#saro-body)" stroke="#8f9bd8" strokeWidth="1.2" />
        <path d="M30 98 Q60 108 90 98" fill="none" stroke="#681993" strokeWidth="5" strokeLinecap="round" opacity=".85" />
        {/* visor y cara */}
        <rect x="36" y="54" width="48" height="34" rx="16" fill="#0b1226" />
        <rect x="40" y="57" width="16" height="5" rx="2.5" fill="#fff" opacity=".12" />
        {mood === "worried" && <g stroke="#ffb4c0" strokeWidth="2" strokeLinecap="round"><path d="M44 63 L55 66" /><path d="M76 63 L65 66" /></g>}
        <g className="saro-eyes" fill={mood === "happy" ? "none" : "#5ef0ff"} stroke={mood === "happy" ? "#5ef0ff" : "none"} strokeWidth="3" strokeLinecap="round">{eye}</g>
        <path className="saro-mouth" d={mood === "worried" ? "M54 82 Q60 79 66 82" : "M54 80 Q60 85 66 80"} fill="none" stroke="#5ef0ff" strokeWidth="2.2" strokeLinecap="round" />
        <circle className="saro-heart" cx="60" cy="104" r="3" fill={mood === "worried" ? "#f43f5e" : mood === "attentive" ? "#f59e0b" : "#10b981"} />
      </g>
    </svg>
  );
}

/**
 * Elige la voz más natural que tenga el navegador. Las voces "Natural/Online" de Edge (neuronales)
 * y las de Google en Chrome suenan humanas; las locales de Windows suenan robóticas.
 */
function voiceScore(v: SpeechSynthesisVoice, lang: "es" | "en") {
  const l = v.lang.toLowerCase();
  if (!l.startsWith(lang)) return -1;
  let score = 0;
  if (/natural|neural|online/i.test(v.name)) score += 100;
  if (/google/i.test(v.name)) score += 60;
  if (lang === "es") {
    if (l === "es-co") score += 30;
    else if (["es-mx", "es-us", "es-419"].includes(l)) score += 22;
    else if (l === "es-es") score += 10;
    if (/salom|dalia|paloma|elena|ximena|gonzalo|jorge/i.test(v.name)) score += 8;
  }
  if (v.localService === false) score += 5;
  return score;
}

/** Entonación según el ánimo de Saro: más agudo y ágil contento, más pausado preocupado. */
const prosody: Record<"happy" | "attentive" | "worried", { rate: number; pitch: number }> = {
  happy: { rate: 1.06, pitch: 1.28 },
  attentive: { rate: 1.0, pitch: 1.14 },
  worried: { rate: 0.94, pitch: 1.0 },
};

const firstSentence = (text: string) => (text.match(/^[^.:;]+[.:;]?/)?.[0] ?? text).trim();
const fmt = (v: number, d = 1) => Math.abs(v).toLocaleString("es-CO", { maximumFractionDigits: d });

/** Guion de Saro para una zona: frases cortas, de lo más importante a lo práctico. */
function scriptFor(zone: RiskZone | null, m: SiteManifest | null, lang: "es" | "en"): string[] {
  const es = lang === "es";
  if (!zone) {
    return es
      ? ["¡Hola! Soy Saru, el explorador de SAROS. Vigilo la Tierra con el radar de NISAR.",
         "Toca un punto del planeta, o búscalo con la lupa, y te cuento qué está pasando allí.",
         "Arriba puedes cambiar a «Vigilancia ambiental» para ver minería y tala."]
      : ["Hi! I'm Saru, SAROS's explorer. I watch the Earth with NISAR's radar.",
         "Tap a point on the planet, or search it, and I'll tell you what's happening there.",
         "Switch to «Environmental watch» at the top to see mining and logging."];
  }
  const name = zone.name[lang];
  const a = m?.assessment;
  const x = m?.extraction;
  const lines: string[] = [];
  const level = a?.level;
  lines.push(level === "alta"
    ? (es ? `Ojo con esta zona: ${name} está en atención alta.` : `Careful here: ${name} is at high attention.`)
    : level === "moderada"
      ? (es ? `${name} está en atención moderada: vale la pena seguirla de cerca.` : `${name} is at moderate attention: worth following closely.`)
      : (es ? `Te muestro ${name}.` : `Here is ${name}.`));
  if (a && m) {
    if (x?.kind === "mining") {
      lines.push(es ? `Veo ${x.pits} piscinas nuevas junto al río y ${x.recentHa} hectáreas intervenidas en 30 días.` : `I see ${x.pits} new ponds by the river and ${x.recentHa} hectares disturbed in 30 days.`);
      lines.push(es ? "No sé quién lo hizo ni si es legal: por eso lo marco como cambio sospechoso para que se verifique en campo." : "I don't know who did it or whether it's legal: that's why I flag it as a suspicious change for field checks.");
    } else if (x) {
      lines.push(es ? `Aquí se perdieron ${x.recentHa} hectáreas de bosque en el último mes. El radar lo ve aunque haya nubes.` : `${x.recentHa} hectares of forest were lost here last month. Radar sees it even through clouds.`);
    } else if (m.change === "deformation") {
      const dir = a.rate.recent < 0 ? (es ? "baja" : "drops") : (es ? "sube" : "rises");
      lines.push(es
        ? `El suelo ${dir} unos ${fmt(a.rate.recent)} ${a.rate.unit}${a.accelerating ? ", y cada vez más rápido" : ""}. Si sigue así, en 90 días serían ${fmt(a.projection.d90, 0)} ${a.projection.unit}.`
        : `The ground ${dir} about ${fmt(a.rate.recent)} ${a.rate.unitEn}${a.accelerating ? ", and faster each time" : ""}. If it continues, that's ${fmt(a.projection.d90, 0)} ${a.projection.unit} in 90 days.`);
    } else {
      lines.push(es ? `El cambio avanza unos ${fmt(a.rate.recent)} ${a.rate.unit}.` : `The change advances about ${fmt(a.rate.recent)} ${a.rate.unitEn}.`);
    }
    if (a.hotspots.length) lines.push(es ? `Marqué ${a.hotspots.length} puntos en el mapa: ahí el cambio reciente es más rápido.` : `I marked ${a.hotspots.length} points on the map: recent change is fastest there.`);
  } else if (!zone.siteId) {
    lines.push(es ? "Aún no tengo capas de radar procesadas aquí, pero te muestro la imagen satelital del lugar." : "I don't have processed radar layers here yet, but here's the satellite image.");
  }
  const impacts = sectorImpacts(zone.id, zone.kind).filter((s) => s.exposure === "high").slice(0, 2);
  if (impacts.length) {
    const names = impacts.map((s) => sectorNames[s.sector][lang].toLowerCase()).join(es ? " y " : " and ");
    lines.push(es ? `Lo más expuesto: ${names}. Toca una ficha y te digo cómo reforzarla.` : `Most exposed: ${names}. Tap a card and I'll tell you how to reinforce it.`);
  }
  const advice = recommendations(zone.kind, level ?? "baja", zone.country === "CO", lang);
  if (advice[0]) lines.push(es ? `Si vives cerca: ${advice[0].charAt(0).toLowerCase()}${advice[0].slice(1)}` : `If you live nearby: ${advice[0].charAt(0).toLowerCase()}${advice[0].slice(1)}`);
  if (zone.country === "CO") lines.push(es ? "Y si ves una emergencia, llama al 123. Yo te ayudo a entender; las alertas oficiales son de UNGRD, SGC e IDEAM." : "And in an emergency, dial 123. I help you understand; official alerts come from UNGRD, SGC and IDEAM.");
  else {
    // fuera de Colombia: el número de ese país y de esa amenaza
    const sos = emergencyFor(zone, lang);
    if (sos?.callable) {
      const what = sos.first.label[lang];
      const who = sos.agencies.replace(/ · /g, ", ");
      lines.push(es
        ? `Y si ves una emergencia en ${sos.countryName}, llama al ${sos.first.n}: ${what}. Las alertas oficiales son de ${who}.`
        : `And in an emergency in ${sos.countryName}, dial ${sos.first.n}: ${what}. Official alerts come from ${who}.`);
    }
  }
  return lines;
}

/** Frase de reacción al abrir la ficha de un sector. */
function asideFor(zone: RiskZone, key: SectorKey, lang: "es" | "en"): string | null {
  const s = sectorImpacts(zone.id, zone.kind).find((i) => i.sector === key);
  return s ? `${sectorNames[s.sector][lang]}: ${firstSentence(s.effect[lang])} ${lang === "es" ? "Para reforzar:" : "To reinforce:"} ${firstSentence(s.reinforce[lang]).toLowerCase()}` : null;
}

/** Clave estable de una frase (FNV-1a): nombre del audio pregrabado. */
export function voiceKey(text: string) {
  let h = 0x811c9dc5;
  const t = text.normalize("NFC").trim();
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Todas las frases que puede decir Saro (para pregrabar su voz). */
export async function collectSaroLines(lang: "es" | "en" = "es") {
  const out: { key: string; text: string; mood: Mood }[] = [];
  const add = (text: string | null, mood: Mood) => { if (text && !out.some((o) => o.text === text)) out.push({ key: voiceKey(text), text, mood }); };
  scriptFor(null, null, lang).forEach((t) => add(t, "happy"));
  for (const zone of riskZones) {
    const m = zone.siteId ? await loadManifest(zone.siteId).catch(() => null) : null;
    const mood = moodFor(m?.assessment?.level ?? (zone.siteId ? undefined : "baja"));
    stepsFor(zone, m, lang).forEach((st) => add(st.text, mood));
    sectorImpacts(zone.id, zone.kind).forEach((s) => add(asideFor(zone, s.sector, lang), mood));
  }
  return out;
}

/** Saru: guía animado. Narra solo cada zona, señala en el mapa, responde preguntas y habla con voz neuronal. */
export default function SaroGuide() {
  const { lang, globalLang } = useI18n();
  const reduce = useReducedMotion();
  // con traducción automática el texto sale completo: escribir letra a letra obligaría a retraducir sin parar
  const auto = isAutoLang(globalLang);
  const instant = reduce || auto;
  const es = lang === "es";
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [manifest, setManifest] = useState<SiteManifest | null>(null);
  const [step, setStep] = useState(0);
  const [aside, setAside] = useState<string | null>(null);
  const [reply, setReply] = useState<string | null>(null);
  const [prog, setProg] = useState({ text: "", n: 0 });
  // El primer HTML debe coincidir en servidor y navegador; activa escritura tras hidratar.
  const [hydrated, setHydrated] = useState(false);
  const [minimized, setMinimized] = useState(false);
  // Saru llega cuando se baja con el scroll (o al abrir una zona); arriba del todo no está
  const [arrived, setArrived] = useState(false);
  const [arrivals, setArrivals] = useState(0);
  const arrivedRef = useRef(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setHydrated(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    const onReveal = (event: Event) => {
      const on = Boolean((event as CustomEvent<boolean>).detail);
      if (on && !arrivedRef.current) setArrivals((n) => n + 1);
      arrivedRef.current = on;
      setArrived(on);
    };
    window.addEventListener(UI_REVEAL, onReveal);
    const frame = requestAnimationFrame(() => {
      const on = globeState.uiRevealed;
      if (on && !arrivedRef.current) setArrivals((n) => n + 1);
      arrivedRef.current = on;
      setArrived(on);
    });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener(UI_REVEAL, onReveal);
    };
  }, []);
  const away = !arrived && !zoneId;
  const [voice, setVoice] = useState(true);
  const [unlocked, setUnlocked] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [history, setHistory] = useState<{ from: "user" | "saro"; text: string }[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [thinking, setThinking] = useState(false);
  const historyRef = useRef<{ from: "user" | "saro"; text: string }[]>([]);
  useEffect(() => {
    historyRef.current = history;
  }, [history]);
  const [role, setRole] = useState<SectorKey | null>(null);
  const zoneRef = useRef<string | null>(null);
  const manifestRef = useRef<SiteManifest | null>(null);
  const zone = riskZones.find((z) => z.id === zoneId) ?? null;
  const steps = useMemo(() => stepsFor(zone, manifest, lang), [zone, manifest, lang]);
  const lines = useMemo(() => steps.map((s) => s.text), [steps]);
  const current = steps[Math.min(step, steps.length - 1)];
  const lineText = current?.text ?? "";
  const text = reply ?? aside ?? lineText;

  // Idiomas del traductor automático: todas las frases de Saru para esta zona se dejan en un bloque
  // oculto que el traductor traduce de una vez; la burbuja y la voz usan esa versión ya traducida.
  const poolRef = useRef<HTMLDivElement | null>(null);
  const pool = useMemo(() => (auto ? Array.from(new Set([...lines, aside, reply].filter((t): t is string => !!t))) : []), [auto, lines, aside, reply]);
  const translatedOf = useCallback((t: string) => {
    const el = poolRef.current?.querySelector(`[data-k="${voiceKey(t)}"]`) as HTMLElement | null;
    return el?.querySelector("font") ? el.innerText.trim() : null;
  }, []);
  const [translated, setTranslated] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!auto || !text || translated[text]) return;
    const started = Date.now();
    const id = window.setInterval(() => {
      const value = translatedOf(text);
      if (value) setTranslated((map) => ({ ...map, [text]: value }));
      if (value || Date.now() - started > 9000) window.clearInterval(id);
    }, 300);
    return () => window.clearInterval(id);
  }, [auto, text, translated, translatedOf]);
  const shownText = auto ? translated[text] ?? text : text;
  const mood: Mood = zone ? moodFor(manifest?.assessment?.level ?? (zone.siteId ? undefined : "baja")) : "happy";
  const watch = zone ? watchKinds.has(zone.kind) : false;

  // en desarrollo: frases para pregrabar la voz
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const w = window as unknown as { __saroLines?: typeof collectSaroLines; __saroReplies?: () => Promise<string[]> };
    w.__saroLines = collectSaroLines;
    w.__saroReplies = () => allReplySentences((id) => loadManifest(id).catch(() => null));
  }, []);

  // el navegador solo deja sonar audio después del primer toque: en ese momento Saru empieza a hablar
  useEffect(() => {
    const unlock = () => setUnlocked(true);
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => { window.removeEventListener("pointerdown", unlock); window.removeEventListener("keydown", unlock); };
  }, []);

  // zona abierta / cerrada y reacción a los sectores
  useEffect(() => {
    const onSelect = (event: Event) => {
      const id = (event as CustomEvent<string | null>).detail;
      zoneRef.current = id;
      setZoneId(id);
      setManifest(null);
      setStep(0);
      setAside(null);
      setReply(null);
      setPlaying(true);
      manifestRef.current = null;
      const z = riskZones.find((r) => r.id === id);
      if (z?.siteId) loadManifest(z.siteId).then((mf) => { manifestRef.current = mf; setManifest(mf); }).catch(() => setManifest(null));
    };
    const onSector = (event: Event) => {
      const key = (event as CustomEvent<SectorKey | null>).detail;
      const z = riskZones.find((r) => r.id === zoneRef.current);
      setReply(null);
      setAside(z && key ? asideFor(z, key, lang) : null);
    };
    window.addEventListener(GLOBE_SELECT, onSelect);
    window.addEventListener(SECTOR_EVENT, onSector);
    return () => {
      window.removeEventListener(GLOBE_SELECT, onSelect);
      window.removeEventListener(SECTOR_EVENT, onSector);
    };
  }, [lang]);

  // mientras narra: el mapa señala lo que nombra y el panel resalta la parte de la que habla
  useEffect(() => {
    if (reply || aside || !current) return;
    if (current.action) window.dispatchEvent(new CustomEvent(POINT_EVENT, { detail: current.action }));
    window.dispatchEvent(new CustomEvent<TourKey | null>(TOUR_EVENT, { detail: current.tour ?? null }));
    if (current.openSector) window.dispatchEvent(new CustomEvent(OPEN_SECTOR_EVENT, { detail: current.openSector }));
  }, [current, reply, aside]);

  // escritura progresiva (solo cambia el texto)
  const typed = instant || !hydrated ? text : text.slice(0, prog.text === text ? prog.n : 0);
  useEffect(() => {
    if (instant) return;
    const id = window.setInterval(() => {
      setProg((p) => {
        const next = (p.text === text ? p.n : 0) + 3;
        if (next >= text.length) window.clearInterval(id);
        return { text, n: next };
      });
    }, 28);
    return () => window.clearInterval(id);
  }, [text, instant]);

  // ---------- voz: neuronal pregrabada (frase completa o frase por frase) y, si falta, la del navegador ----------
  const [recorded, setRecorded] = useState<Set<string> | null>(null);
  useEffect(() => {
    fetch("/voice/es/index.json").then((r) => (r.ok ? r.json() : null)).then((d: { keys: string[] } | null) => setRecorded(d ? new Set(d.keys) : null)).catch(() => setRecorded(null));
  }, []);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const load = () => setVoices(window.speechSynthesis.getVoices().filter((v) => voiceScore(v, lang) >= 0).sort((a, b) => voiceScore(b, lang) - voiceScore(a, lang)));
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, [lang]);
  const audio = useRef<HTMLAudioElement | null>(null);
  const token = useRef(0);
  const stopAll = useCallback(() => {
    token.current++;
    audio.current?.pause();
    audio.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);
  /** Habla el texto; onDone se llama al terminar (para avanzar solo a la siguiente frase). */
  const speak = useCallback((t: string, onDone: () => void) => {
    stopAll();
    const my = ++token.current;
    const done = () => { if (my === token.current) { setSpeaking(false); onDone(); } };
    const key = voiceKey(t);
    if (es && !auto && recorded) {
      const keys = recorded.has(key) ? [key] : sentences(t).map(voiceKey);
      if (keys.every((k) => recorded.has(k))) {
        const playAt = (i: number) => {
          if (my !== token.current) return;
          if (i >= keys.length) { done(); return; }
          const a = new Audio(`/voice/es/${keys[i]}.mp3`);
          audio.current = a;
          a.onplay = () => setSpeaking(true);
          a.onended = () => playAt(i + 1);
          a.onerror = () => playAt(i + 1);
          a.play().catch(() => { setSpeaking(false); });
        };
        playAt(0);
        return;
      }
    }
    if (!("speechSynthesis" in window)) { done(); return; }
    const say = (said: string, voiceFor: SpeechSynthesisVoice | undefined, langCode: string) => {
      const parts = sentences(said.replace(/•/g, " "));
      if (!parts.length) { done(); return; }
      parts.forEach((part, i) => {
        const u = new SpeechSynthesisUtterance(part);
        u.lang = voiceFor?.lang ?? langCode;
        if (voiceFor) u.voice = voiceFor;
        u.rate = prosody[mood].rate;
        if (i === 0) u.onstart = () => setSpeaking(true);
        if (i === parts.length - 1) { u.onend = done; u.onerror = done; }
        window.speechSynthesis.speak(u);
      });
    };
    if (auto) {
      // idioma traducido por el navegador: Saru lee lo que se ve en pantalla, ya traducido
      const code = globalLang.toLowerCase().split("-")[0];
      const all = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().split(/[-_]/)[0] === (code === "he" ? "he" : code));
      const voiceFor = all.find((v) => /natural|online|neural/i.test(v.name)) ?? all[0];
      const started = Date.now();
      const read = () => {
        if (my !== token.current) return;
        const ready = translatedOf(t);
        if (!ready && Date.now() - started < 4000) { window.setTimeout(read, 250); return; }
        const said = ready ?? t;
        if (!voiceFor) {
          // sin voz para ese idioma: no se lee en otro idioma; se da tiempo de lectura y sigue
          setSpeaking(true);
          window.setTimeout(done, 2200 + said.length * 45);
          return;
        }
        say(said, voiceFor, globalLang);
      };
      read();
      return;
    }
    say(t, voices[0], es ? "es-CO" : "en-US");
  }, [es, auto, globalLang, recorded, voices, mood, stopAll, translatedOf]);

  // narración continua: al terminar cada frase pasa sola a la siguiente
  const advance = useCallback(() => {
    if (aside) { setAside(null); return; }           // tras reaccionar a un sector, sigue el recorrido
    setStep((s) => (s < lines.length - 1 ? s + 1 : s));
  }, [aside, lines.length]);
  const autoNext = playing && !chatOpen && !reply && !minimized && step < lines.length - 1 + (aside ? 1 : 0);
  useEffect(() => {
    if (away || minimized || thinking || (chatOpen && !reply) || (!playing && !reply && !aside)) { stopAll(); return; }   // fuera, en pausa o pensando: calla
    const canSpeak = voice && unlocked;
    if (canSpeak) {
      speak(text, () => { if (autoNext) window.setTimeout(advance, 650); });
      return stopAll;
    }
    // con voz pero sin el primer toque todavía: espera en esta frase para no perderse nada
    if (voice && !unlocked) return;
    // sin voz: avanza cuando hubo tiempo de leer
    if (!autoNext) return;
    const wait = Math.max(2600, text.length * 55);
    const id = window.setTimeout(advance, wait);
    return () => window.clearTimeout(id);
  }, [text, voice, unlocked, minimized, autoNext, speak, stopAll, advance, playing, reply, aside, thinking, away, chatOpen]);

  const talking = hydrated && (typed.length < text.length || (voice && unlocked && speaking));
  // mientras señala algo en el mapa, Saru se inclina hacia él
  const pointing = !reply && !aside && (current?.action?.type === "point" || current?.action?.type === "hotspots");

  // ---------- preguntas ----------
  const ask = useCallback(async (question: string) => {
    const q = question.trim();
    if (!q || thinking) return;
    const z = riskZones.find((r) => r.id === zoneRef.current) ?? null;
    // Saru entiende la pregunta para mover el mapa (abrir zona, señalar puntos, explicar colores)
    const local = answer(q, { zone: z, manifest: manifestRef.current, role });
    if (local.role) setRole(local.role);
    const past = historyRef.current;
    setShowHistory(true);
    setHistory((list) => [...list, { from: "user" as const, text: q }].slice(-12));
    setInput("");
    setAside(null);
    setPlaying(false);
    setMinimized(false);
    if (local.action?.type === "open") focusZone(local.action.zoneId);
    else window.setTimeout(() => window.dispatchEvent(new CustomEvent(POINT_EVENT, { detail: local.action ?? null })), 350);

    // la respuesta la da el asistente SAROS (Groq, con la evidencia de la base); Saru la muestra y la lee
    setThinking(true);
    setReply(es ? "Déjame revisar los datos…" : "Let me check the data…");
    const context = z ? `Estoy viendo la zona «${z.name.es}» (${z.place.es}). ` : "";
    const messages = [
      ...past.slice(-6).map((m) => ({ role: m.from === "user" ? "user" : "assistant", content: m.text.slice(0, 1400) })),
      { role: "user", content: (context + q).slice(0, 1450) },
    ].slice(-8);
    let text = local.text;
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
        signal: AbortSignal.timeout(45000),
      });
      const payload = (await response.json().catch(() => ({}))) as { answer?: string };
      if (response.ok && payload.answer?.trim()) text = plainText(payload.answer);
    } catch {
      /* sin asistente disponible: responde Saru con los datos de la zona */
    }
    setThinking(false);
    setReply(text);
    setHistory((list) => [...list, { from: "saro" as const, text }].slice(-12));
  }, [role, thinking, es]);
  const listen = () => {
    const W = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Rec = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Rec) { setReply("Tu navegador no me deja escucharte. Escríbeme la pregunta, por favor."); return; }
    const rec = new Rec();
    rec.lang = "es-CO";
    rec.interimResults = false;
    rec.onresult = (e) => { const said = e.results[0]?.[0]?.transcript ?? ""; setListening(false); ask(said); };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    setListening(true);
    rec.start();
  };
  const resumeTour = () => { setReply(null); setAside(null); setPlaying(true); };
  const chatTransition = { duration: reduce ? 0 : 0.8, ease: [0.22, 1, 0.36, 1] as const };
  const closeChat = () => {
    setChatOpen(false);
    setMinimized(false);
    requestAnimationFrame(() => avatarRef.current?.focus({ preventScroll: true }));
  };
  const toggleChat = () => {
    if (chatOpen) closeChat();
    else { setMinimized(false); setShowHistory(true); setChatOpen(true); }
  };
  const avatarRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      {auto && (
        <div className="saru-pool" ref={poolRef} aria-hidden="true">
          {pool.map((t) => <p key={voiceKey(t)} data-k={voiceKey(t)}>{t}</p>)}
        </div>
      )}
      <div className={`saro${zone ? " in-zone" : ""}${watch ? " is-watch" : ""}${pointing ? " is-pointing" : ""}${thinking ? " is-thinking" : ""}${away ? " is-away" : ""}`} aria-hidden={away || undefined}>
        <motion.div layout="position" transition={chatTransition} className="saru-row">
        <AnimatePresence initial={false} mode="popLayout">
          {!minimized && !chatOpen && (
            <motion.div layout="position" key="caption" className="saru-caption" role="status" aria-live="polite"
              initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }}
              transition={chatTransition}>
              <p className={`saru-text${auto ? " notranslate" : ""}`} translate={auto ? "no" : undefined}>{auto ? shownText : typed}{thinking ? <span className="saru-dots-think" aria-hidden="true"><i /><i /><i /></span> : talking && <span className="saro-caret" aria-hidden="true" />}</p>
              <div className="saru-bar">
                <span className="saru-name">Saru</span>
                {!reply && lines.length > 1 && (
                  <span className="saru-dots">{lines.map((_, i) => <button key={i} type="button" className={i === step ? "on" : i < step ? "seen" : undefined} onClick={() => { setAside(null); setStep(i); }} aria-label={`${es ? "Frase" : "Line"} ${i + 1}`} />)}</span>
                )}
                {reply
                  ? <button type="button" className="saru-btn saru-btn-text" onClick={resumeTour}>{es ? "Seguir el recorrido" : "Resume tour"}</button>
                  : <button type="button" className="saru-btn" onClick={() => setPlaying((p) => !p)} aria-label={playing ? (es ? "Pausar" : "Pause") : (es ? "Reanudar" : "Resume")}>{playing ? <Pause size={13} /> : <Play size={13} />}</button>}
                <button type="button" className={`saru-btn${voice ? " on" : ""}`} onClick={() => setVoice((v) => !v)} aria-pressed={voice} aria-label={es ? "Voz" : "Voice"}>{voice ? <Volume2 size={13} /> : <VolumeX size={13} />}</button>
                <button type="button" className="saru-btn" onClick={() => setMinimized(true)} aria-label={es ? "Ocultar a Saru" : "Hide Saru"}><Minus size={13} /></button>
              </div>
              {voice && !unlocked && <p className="saru-hint">{es ? "🔊 Toca cualquier parte para oír a Saru" : "🔊 Tap anywhere to hear Saru"}</p>}
            </motion.div>
          )}
        </AnimatePresence>
        <motion.div layout="position" transition={chatTransition} className="saru-avatar-anchor">
        <button ref={avatarRef} type="button" className="saro-avatar saru-enter" key={`${zoneId ?? "home"}-${arrivals}`} onClick={toggleChat}
          aria-expanded={chatOpen} aria-controls={chatOpen ? "saru-chat" : undefined}
          aria-label={chatOpen ? (es ? "Cerrar chat de Saru y mostrar diálogo" : "Close Saru chat and show dialogue") : (es ? "Conversar con Saru" : "Chat with Saru")}>
          <span className="saru-trail" aria-hidden="true" />
          {/* aterrizaje: anillo de impacto y nubes de humo que se abren a los lados */}
          <span className="saru-land" aria-hidden="true">
            <b className="saru-shock" />
            {[-1, -0.7, -0.4, -0.15, 0.15, 0.4, 0.7, 1].map((d, i) => <i key={i} style={{ "--d": d, "--k": i } as React.CSSProperties} />)}
            {[-1, -0.55, -0.2, 0.2, 0.55, 1].map((d, i) => <s key={i} style={{ "--d": d, "--k": i } as React.CSSProperties} />)}
          </span>
          <SaroFigure mood={mood} talking={talking} />
        </button>
        </motion.div>
        </motion.div>

      {/* Chat: barra translúcida pegada a Saru; responde en su subtítulo y con su voz */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div key="askbar" className="saru-chat-reveal"
            initial={{ height: 0, opacity: 0, y: 28 }} animate={{ height: "auto", opacity: 1, y: 0 }} exit={{ height: 0, opacity: 0, y: 28 }} transition={chatTransition}>
          <div id="saru-chat" className={`saru-ask${zone ? " in-zone" : ""}`} role="region" aria-label={es ? "Chat con Saru" : "Chat with Saru"} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); closeChat(); } }}>
            <AnimatePresence>
              {showHistory && history.length > 0 && (
                <motion.div className="saru-history" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}>
                  {history.map((m, i) => <p key={i} className={`from-${m.from}`}>{m.text}</p>)}
                </motion.div>
              )}
            </AnimatePresence>
            {thinking && <p className="saru-chat-pending" role="status">{es ? "Revisando los datos…" : "Checking the data…"}</p>}
            <div className="saru-chips">
              {QUICK_QUESTIONS.map((q) => <button key={q} type="button" onClick={() => ask(q)}>{q}</button>)}
            </div>
            <form className="saru-input" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
              <button type="button" className={`saru-ib${showHistory ? " on" : ""}`} onClick={() => setShowHistory((h) => !h)} aria-label={es ? "Historial" : "History"} disabled={!history.length}><History size={15} /></button>
              <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={es ? "Pregúntale a Saru…" : "Ask Saru…"} aria-label={es ? "Pregunta para Saru" : "Question for Saru"} />
              <button type="button" className={`saru-ib${listening ? " rec" : ""}`} onClick={listen} aria-label={es ? "Hablarle a Saru" : "Talk to Saru"}><Mic size={15} /></button>
              <button type="submit" className="saru-ib send" aria-label={es ? "Enviar" : "Send"}><Send size={15} /></button>
              <button type="button" className="saru-ib" onClick={closeChat} aria-label={es ? "Cerrar" : "Close"}><X size={15} /></button>
            </form>
          </div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
    </>
  );
}
