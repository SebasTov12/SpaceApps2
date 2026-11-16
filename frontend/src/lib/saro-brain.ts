/**
 * Cerebro de Saru: responde preguntas con los datos de cada zona (sin inventar cifras).
 * Entiende de qué zona se habla, quién pregunta (agricultor, pescador…) y qué quiere saber.
 * Cada respuesta puede llevar una acción para el mapa (señalar puntos, explicar colores, abrir otra zona).
 */
import { emergencyFor } from "./emergency";
import { recommendations } from "./insights";
import { riskKinds, riskZones, type RiskZone } from "./risk-zones";
import { sectorEffects, sectorImpacts, type SectorKey } from "./sector-impacts";
import type { SiteManifest } from "./sites";

export type LegendKind = "deformation" | "forest" | "mining" | "flood" | "velocity";
/** Partes del panel que Saru puede resaltar mientras habla. */
export type TourKey = "level" | "now" | "watch" | "model" | "records" | "sectors" | "event" | "todo" | "call";
/** Evento para resaltar una parte del panel (y desplazarlo hasta ella). */
export const TOUR_EVENT = "saros:tour";
/** Evento para abrir la ficha de un sector desde el recorrido. */
export const OPEN_SECTOR_EVENT = "saros:open-sector";

export type SaroAction =
  | { type: "hotspots"; label: string; sub?: string }
  | { type: "point"; index: number; label: string; sub?: string }
  | { type: "legend"; kind: LegendKind }
  | { type: "open"; zoneId: string };
export type SaroReply = { text: string; action?: SaroAction; role?: SectorKey | null };

const fold = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const fmt = (v: number, d = 1) => Math.abs(v).toLocaleString("es-CO", { maximumFractionDigits: d });
const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
const firstSentence = (t: string) => (t.match(/^[^.:;]+[.:;]?/)?.[0] ?? t).trim();

/** Divide una respuesta en frases (la voz pregrabada va frase por frase). */
export const sentences = (t: string) => t.replace(/\s+/g, " ").match(/[^.!?:;]+[.!?:;]?/g)?.map((p) => p.trim()).filter(Boolean) ?? [t];

// ---------------- quién pregunta ----------------
export const ROLES: { key: SectorKey; words: RegExp; name: string }[] = [
  { key: "agriculture", words: /agricult|campesin|cultiv|siembr|finca|cosech/, name: "agricultor" },
  { key: "livestock", words: /ganad|vaca|potrer/, name: "ganadero" },
  { key: "mining", words: /miner/, name: "minero" },
  { key: "fishing", words: /pesc/, name: "pescador" },
  { key: "housing", words: /vivo|mi casa|vivienda|mi familia|mis hijos|barrio/, name: "habitante de la zona" },
  { key: "roads", words: /conduc|transport|carretera|via |camion/, name: "transportador" },
  { key: "health", words: /salud|medic|enfermer|hospital/, name: "personal de salud" },
  { key: "commerce", words: /comerci|tienda|negocio|vendo/, name: "comerciante" },
  { key: "culture", words: /indigen|afro|consejo comunitario|cabildo|resguardo|comunidad/, name: "parte de la comunidad" },
  { key: "water", words: /acueduct|agua potable/, name: "responsable del agua" },
];

// ---------------- de qué zona se habla ----------------
const ZONE_WORDS: Record<string, RegExp> = {
  "colombia-ladera": /ladera andina|norte de santander|cucuta/,
  "bogota-subsidencia": /bogota|sabana/,
  "la-mojana-inundacion": /mojana|sucre|bolivar/,
  "caqueta-deforestacion": /caqueta/,
  "nevado-ruiz": /ruiz|nevado|manizales|caldas|tolima/,
  mocoa: /mocoa|putumayo/,
  gramalote: /gramalote/,
  "rosas-cauca": /rosas|panamericana/,
  "via-llano": /llano|villavicencio/,
  galeras: /galeras|pasto|narino/,
  "choco-atrato": /quibdo|sismic/,
  "atrato-mineria": /atrato|choco/,
  "bajo-cauca-mineria": /bajo cauca|nechi|caucasia|el bagre/,
  "chiribiquete-borde": /chiribiquete|guaviare/,
};
export function findZone(q: string): RiskZone | null {
  const f = fold(q);
  for (const [id, re] of Object.entries(ZONE_WORDS)) if (re.test(f)) return riskZones.find((z) => z.id === id) ?? null;
  return riskZones.find((z) => f.includes(fold(z.name.es))) ?? null;
}

// ---------------- glosario ----------------
const GLOSSARY: { words: RegExp; text: string; legend?: LegendKind }[] = [
  { words: /nisar|satelite/, text: "NISAR es un satélite de la NASA y de la India con un radar que ve a través de las nubes y de noche. Pasa por el mismo lugar cada 12 días y mide si el suelo se movió unos milímetros." },
  { words: /insar|interferom|deformacion|milimetro|\bmm\b/, text: "Comparo dos pasadas del radar sobre el mismo lugar. Si el suelo se alejó del satélite, está bajando o deslizándose; si se acercó, está subiendo. Así mido milímetros de movimiento.", legend: "deformation" },
  { words: /retrodispers|\bhv\b|backscatter/, text: "Es cuánta energía del radar regresa al satélite. El bosque la devuelve fuerte, el suelo talado menos y el agua quieta casi nada, por eso se ve muy oscura.", legend: "forest" },
  { words: /piscina/, text: "Una piscina minera es un hueco con agua quieta que deja la minería aluvial junto al río. En el radar se ve casi negra porque el agua quieta no devuelve la señal.", legend: "mining" },
  { words: /subsidencia|hund/, text: "Subsidencia es cuando el suelo se hunde poco a poco, por ejemplo cuando se saca mucha agua del subsuelo. Inclina casas y rompe tuberías.", legend: "deformation" },
  { words: /deforest|tala/, text: "Deforestación es la pérdida del bosque. El radar la detecta porque el suelo desnudo devuelve menos señal que los árboles, incluso con nubes.", legend: "forest" },
  { words: /nivel|atencion alta|moderad/, text: "Los niveles de atención los calculo con el ritmo del cambio y si se está acelerando. No son alertas oficiales: esas las dan la UNGRD, el SGC y el IDEAM." },
  { words: /proyecc|90 dias|30 dias/, text: "La proyección supone que el ritmo de ahora sigue igual. No es una probabilidad: sirve para decidir qué revisar primero." },
];

function legendFor(zone: RiskZone | null, m: SiteManifest | null): LegendKind {
  if (m?.extraction?.kind === "mining") return "mining";
  if (zone?.kind === "flood") return "flood";
  if (m?.change === "backscatter") return "forest";
  if (m?.change === "velocity") return "velocity";
  return "deformation";
}
function hotspotLabel(zone: RiskZone | null, m: SiteManifest | null) {
  if (m?.extraction?.kind === "mining") return { label: "Posible piscina nueva", sub: "cambio reciente junto al río" };
  if (zone?.kind === "deforestation") return { label: "Bosque perdido reciente", sub: "verificar en campo" };
  if (zone?.kind === "flood") return { label: "Agua que cambia rápido", sub: "zona a vigilar" };
  return { label: "Movimiento más rápido", sub: "punto a vigilar" };
}

// ---------------- respuestas ----------------
export type BrainContext = { zone: RiskZone | null; manifest: SiteManifest | null; role: SectorKey | null };

const SUGGEST = "Puedes preguntarme si es peligroso, dónde está pasando, qué significa un color, qué hacer o qué va a pasar. También dime a qué te dedicas y te respondo para tu caso.";

export function answer(question: string, ctx: BrainContext): SaroReply {
  const q = fold(question);
  const { zone, manifest: m } = ctx;
  const a = m?.assessment;
  const x = m?.extraction;
  const place = zone ? zone.place.es.split(",")[0] : "";

  // 1. ¿habla de otra zona? → la abro
  const other = findZone(question);
  if (other && other.id !== zone?.id) {
    return { text: `Vamos a ${other.name.es}, en ${other.place.es.split(",")[0]}. Te muestro lo que veo allí.`, action: { type: "open", zoneId: other.id } };
  }

  // 2. ¿quién pregunta? → respuesta para su actividad
  const role = ROLES.find((r) => r.words.test(q)) ?? null;
  if (role && zone) {
    const impact = sectorImpacts(zone.id, zone.kind).find((s) => s.sector === role.key);
    const effect = impact ?? (sectorEffects[zone.kind]?.[role.key] ? { ...sectorEffects[zone.kind]![role.key]!, exposure: "medium" as const } : null);
    if (!effect) {
      return { text: `Como ${role.name}, en ${place} tu actividad no aparece entre las más expuestas. Aun así, sigue los avisos y revisa los puntos que te marco en el mapa.`, action: a?.hotspots.length ? { type: "hotspots", ...hotspotLabel(zone, m) } : undefined, role: role.key };
    }
    const level = effect.exposure === "high" ? "alta" : effect.exposure === "medium" ? "media" : "baja";
    return {
      text: `Como ${role.name} en ${place}, tu exposición es ${level}. ${firstSentence(effect.effect.es)} Te recomiendo: ${lower(firstSentence(effect.reinforce.es))}`,
      action: a?.hotspots.length ? { type: "hotspots", ...hotspotLabel(zone, m) } : undefined,
      role: role.key,
    };
  }
  if (role && !zone) {
    return { text: `¡Entendido, eres ${role.name}! Abre una zona del planeta o dime cuál, por ejemplo Bogotá o el río Atrato, y te digo cómo te afecta.`, role: role.key };
  }

  // 3. saludo y cortesía
  if (/^(hola|buenas|hey|que mas|saludos)/.test(q)) return { text: zone ? `¡Hola! Estamos viendo ${zone.name.es}. ${SUGGEST}` : `¡Hola! Soy Saru. Dime una zona de Colombia o toca un punto del planeta. ${SUGGEST}` };
  if (/gracias|chevere|genial|bacano/.test(q)) return { text: "¡Con gusto! Si tienes otra duda, aquí estoy vigilando." };

  // 4. glosario: qué significa…
  const term = GLOSSARY.find((g) => g.words.test(q));
  const meaning = /signific|que es|que son|color|rojo|azul|verde|oscur|leyenda|como leo|como se lee/.test(q);
  if (meaning && !term) {
    const kind = legendFor(zone, m);
    const text = {
      deformation: "En este mapa, el rojo es suelo que se aleja del satélite, o sea que baja o se desliza. El azul es suelo que sube. El blanco es sin cambio.",
      forest: "En este mapa, el verde es bosque en pie. Los tonos cafés son suelo sin árboles y lo muy oscuro es agua quieta.",
      mining: "En este mapa, el verde es bosque. La franja oscura es el río y las manchas oscuras pegadas a él son piscinas mineras. Lo café es bosque talado alrededor.",
      flood: "En este mapa, lo muy oscuro es agua. Si la mancha oscura crece entre pasadas, el área inundada está aumentando.",
      velocity: "En este mapa, los colores más intensos son el hielo que se mueve más rápido.",
    }[kind];
    return { text, action: { type: "legend", kind } };
  }
  if (term) return { text: term.text, action: term.legend ? { type: "legend", kind: zone ? legendFor(zone, m) : term.legend } : undefined };

  if (!zone) return { text: `Primero elige una zona: toca un punto del planeta o dime cuál, por ejemplo Mocoa, Bogotá o el Atrato. ${SUGGEST}` };

  // 5. intenciones sobre la zona abierta
  if (/donde|en que parte|que parte|ubic|lugar exacto|muestrame|señala|senala/.test(q)) {
    if (a?.hotspots.length) return { text: `Mira el mapa: te señalo los ${a.hotspots.length} puntos donde el cambio reciente es más rápido en ${place}.`, action: { type: "hotspots", ...hotspotLabel(zone, m) } };
    return { text: `En ${place} aún no tengo puntos de radar procesados; te muestro la imagen satelital del lugar.` };
  }
  if (/peligro|grave|riesgo|preocup|seguro|me afecta|debo preocup/.test(q)) {
    const lvl = a?.level ?? "baja";
    const base = lvl === "alta" ? `Sí, ${place} está en atención alta` : lvl === "moderada" ? `${place} está en atención moderada` : `${place} está en atención baja`;
    const accel = a?.accelerating ? ", y el cambio se está acelerando" : "";
    return { text: `${base}${accel}. Eso no es una alerta oficial, pero sí una razón para estar pendiente y conocer tu ruta de evacuación. ${zone.country === "CO" ? "Las alertas oficiales son de la UNGRD, el SGC y el IDEAM." : `Las alertas oficiales son de ${emergencyFor(zone, "es")?.agencies.replace(/ · /g, ", ") || "la protección civil local"}.`}`, action: a?.hotspots.length ? { type: "hotspots", ...hotspotLabel(zone, m) } : undefined };
  }
  if (/que hago|que debo|recomend|ayuda|evacu|como me protejo|que puedo hacer/.test(q)) {
    const advice = recommendations(zone.kind, a?.level ?? "baja", zone.country === "CO", "es").filter((t) => !/123/.test(t)).slice(0, 2);
    let extra = "";
    if (ctx.role) {
      const imp = sectorImpacts(zone.id, zone.kind).find((s) => s.sector === ctx.role);
      if (imp) extra = ` Y para tu caso: ${lower(firstSentence(imp.reinforce.es))}`;
    }
    const sos = emergencyFor(zone, "es");
    const call = sos?.callable ? ` Si ves una emergencia, llama al ${sos.first.n}${zone.country === "CO" ? "" : ` en ${sos.countryName} (${sos.first.label.es})`}.` : "";
    return { text: `Esto es lo más importante: ${advice.map(lower).join(" Además, ")}${extra}${call}` };
  }
  if (/va a pasar|futuro|predic|proyecc|pronost|cuanto falta|que pasara/.test(q)) {
    if (!a) return { text: `En ${place} aún no tengo una serie de datos para proyectar.` };
    return { text: `Si el ritmo de ahora sigue igual, en 30 días serían ${fmt(a.projection.d30, 0)} ${a.projection.unit} y en 90 días ${fmt(a.projection.d90, 0)} ${a.projection.unit}. No es una probabilidad: sirve para decidir qué revisar primero.`, action: { type: "legend", kind: legendFor(zone, m) } };
  }
  if (/paso antes|historia|evento|ha pasado|ya paso|antecedente/.test(q)) {
    return { text: zone.event ? `Sí: ${lower(zone.event.es)}` : `No tengo registrado un evento histórico en ${place}, pero eso no significa que no haya pasado nada.` };
  }
  if (/quien|culpa|ilegal|legal|denunci|responsable/.test(q)) {
    if (x) return { text: "Yo no sé quién lo hizo ni si es legal: solo veo el cambio en el terreno. Por eso lo marco como sospechoso y recomiendo avisar a la autoridad ambiental y al consejo comunitario para que lo verifiquen en campo.", action: { type: "hotspots", ...hotspotLabel(zone, m) } };
    return { text: "El radar ve el cambio del terreno, no a las personas. Para saber las causas hace falta una revisión técnica en campo." };
  }
  if (/fuente|dato|confiable|real|demo|de donde/.test(q)) {
    const demo = m?.source.mode !== "real";
    return { text: `${demo ? "Estos datos son una demostración con la forma de un producto NISAR" : "Estos datos vienen de productos NISAR descargados de ASF"}, del tipo ${m?.source.product ?? "NISAR"}. NISAR pasa cada 12 días, así que veo cambios por pasada, no al instante.` };
  }
  if (/que pasa|que esta pasando|explica|resumen|cuentame|como esta/.test(q)) {
    if (x?.kind === "mining") return { text: `En ${place} veo ${x.pits} piscinas nuevas junto al río y ${x.recentHa} hectáreas intervenidas en 30 días. Te las señalo en el mapa.`, action: { type: "hotspots", ...hotspotLabel(zone, m) } };
    if (x) return { text: `En ${place} se perdieron ${x.recentHa} hectáreas de bosque en el último mes. Te señalo dónde.`, action: { type: "hotspots", ...hotspotLabel(zone, m) } };
    if (a && m?.change === "deformation") return { text: `En ${place} el suelo ${a.rate.recent < 0 ? "baja" : "sube"} unos ${fmt(a.rate.recent)} ${a.rate.unit}${a.accelerating ? " y cada vez más rápido" : ""}. Te marco dónde se mueve más.`, action: { type: "hotspots", ...hotspotLabel(zone, m) } };
    return { text: `${zone.name.es}: ${riskKinds[zone.kind].es.toLowerCase()} bajo vigilancia en ${place}.` };
  }
  return { text: `No estoy seguro de entenderte. ${SUGGEST}` };
}

/** Preguntas de ejemplo (sirven de botones rápidos y para pregrabar la voz). */
export const QUICK_QUESTIONS = ["¿Es peligroso?", "¿Dónde está pasando?", "¿Qué significan los colores?", "¿Qué hago si vivo aquí?", "¿Qué va a pasar?", "Soy agricultor"];
const SAMPLE = [...QUICK_QUESTIONS, "hola", "gracias", "¿qué está pasando?", "¿pasó algo antes?", "¿quién es el responsable?", "¿de dónde salen los datos?", "¿qué es NISAR?", "¿qué es InSAR?", "¿qué es la retrodispersión?", "¿qué es una piscina minera?", "¿qué es subsidencia?", "¿qué es deforestación?", "¿qué significa el nivel?", "¿qué es la proyección?", "xyz", "¿qué hago?"];

/** Todas las frases posibles de las respuestas (para pregrabar la voz). */
export async function allReplySentences(load: (id: string) => Promise<SiteManifest | null>) {
  const out = new Set<string>();
  const addReply = (r: SaroReply) => sentences(r.text).forEach((s) => out.add(s));
  const zones: (RiskZone | null)[] = [null, ...riskZones];
  for (const zone of zones) {
    const m = zone?.siteId ? await load(zone.siteId) : null;
    for (const q of SAMPLE) addReply(answer(q, { zone, manifest: m, role: null }));
    for (const r of ROLES) {
      addReply(answer(`soy ${r.name}`, { zone, manifest: m, role: null }));
      addReply(answer("¿qué hago?", { zone, manifest: m, role: r.key }));
    }
    if (zone) for (const other of riskZones) if (other.id !== zone.id) addReply(answer(other.name.es, { zone, manifest: m, role: null }));
  }
  for (const other of riskZones) addReply(answer(other.name.es, { zone: null, manifest: null, role: null }));
  return [...out];
}
