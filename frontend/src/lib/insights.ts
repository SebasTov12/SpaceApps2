/**
 * Prevención: niveles de atención, lectura de la tendencia y recomendaciones para la población.
 * Los niveles NO son alertas oficiales: orientan dónde mirar primero. Las alertas oficiales en
 * Colombia las emiten la UNGRD, el SGC (volcanes, sismos, movimientos en masa) y el IDEAM (hidrometeorología).
 */
import type { RiskKind } from "@/lib/risk-zones";
import type { AttentionLevel, Assessment, ChangeType } from "@/lib/sites";

type L = { es: string; en: string };

export const levelInfo: Record<AttentionLevel, { color: string; label: L; short: L }> = {
  baja: { color: "#10b981", label: { es: "Atención baja", en: "Low attention" }, short: { es: "BAJA", en: "LOW" } },
  moderada: { color: "#f59e0b", label: { es: "Atención moderada", en: "Moderate attention" }, short: { es: "MODERADA", en: "MODERATE" } },
  alta: { color: "#f43f5e", label: { es: "Atención alta", en: "High attention" }, short: { es: "ALTA", en: "HIGH" } },
};

/** Frase en lenguaje simple: qué está pasando y qué pasaría si sigue igual. */
export function trendSentence(a: Assessment, change: ChangeType, kind: RiskKind, lang: "es" | "en") {
  const unit = a.projection.unit;
  const rate = Math.abs(a.rate.recent).toFixed(1);
  const r = lang === "es" ? a.rate.unit : a.rate.unitEn;
  if (change === "deformation") {
    const dir = a.rate.recent < 0
      ? (lang === "es" ? "el terreno se aleja del satélite (hundimiento o desplazamiento ladera abajo)" : "the ground is moving away from the satellite (sinking or sliding downslope)")
      : (lang === "es" ? "el terreno se eleva" : "the ground is rising");
    const acc = a.accelerating ? (lang === "es" ? " y el ritmo se está acelerando" : " and the rate is accelerating") : "";
    return lang === "es"
      ? `En las últimas pasadas ${dir} a unos ${rate} ${r}${acc}. Si la tendencia continúa, en 90 días el desplazamiento acumulado llegaría a ${a.projection.d90} ${unit}.`
      : `Over the latest passes ${dir} at about ${rate} ${r}${acc}. If the trend continues, cumulative displacement would reach ${a.projection.d90} ${unit} in 90 days.`;
  }
  if (change === "backscatter") {
    const flood = kind === "flood";
    const growing = a.rate.recent > 0;
    const what = flood
      ? (growing ? (lang === "es" ? "el área inundada crece" : "the flooded area is growing") : (lang === "es" ? "el agua está retrocediendo" : "the water is receding"))
      : (growing ? (lang === "es" ? "la pérdida de bosque avanza" : "forest loss is advancing") : (lang === "es" ? "la pérdida de bosque se detuvo" : "forest loss has slowed"));
    return lang === "es"
      ? `${what[0].toUpperCase()}${what.slice(1)} a unos ${rate} ${r}. Si la tendencia continúa, en 90 días el área afectada sería de ${a.projection.d90} ${unit}.`
      : `${what[0].toUpperCase()}${what.slice(1)} at about ${rate} ${r}. If the trend continues, the affected area would be ${a.projection.d90} ${unit} in 90 days.`;
  }
  return lang === "es"
    ? `La velocidad máxima cambia a unos ${rate} ${r}. Proyección a 90 días: ${a.projection.d90} ${unit}.`
    : `Peak speed is changing by about ${rate} ${r}. 90-day projection: ${a.projection.d90} ${unit}.`;
}

/** Recomendaciones orientativas para quienes viven en la zona. */
const advice: Record<RiskKind, Record<AttentionLevel, L[]>> = {
  landslide: {
    alta: [
      { es: "Identifique rutas de evacuación hacia zonas altas y estables, lejos de cauces y del pie de la ladera.", en: "Identify evacuation routes to high, stable ground, away from streams and the foot of the slope." },
      { es: "Reporte grietas en paredes o suelos, postes o árboles inclinados y cambios en manantiales al Consejo Municipal de Gestión del Riesgo.", en: "Report cracks in walls or ground, tilting poles or trees and changes in springs to the municipal risk council." },
      { es: "Durante lluvias intensas o prolongadas, no permanezca en las viviendas señaladas y atienda las alertas oficiales.", en: "During heavy or prolonged rain, do not stay in flagged homes and follow official alerts." },
    ],
    moderada: [
      { es: "Revise periódicamente grietas y humedades en viviendas y vías.", en: "Regularly check for cracks and damp in homes and roads." },
      { es: "Mantenga limpios drenajes y cunetas; evite cortes y rellenos sin estudio técnico.", en: "Keep drains clear; avoid unplanned cuts and fills on the slope." },
    ],
    baja: [{ es: "Conozca el plan comunitario de gestión del riesgo de su barrio o vereda.", en: "Know your community risk management plan." }],
  },
  subsidence: {
    alta: [
      { es: "Revise fisuras en muros, puertas que se traban y fugas en tuberías; repórtelas a la oficina de gestión del riesgo.", en: "Check wall cracks, sticking doors and pipe leaks; report them to the risk office." },
      { es: "Evite pozos de extracción de agua sin permiso: aceleran el hundimiento.", en: "Avoid unpermitted water wells: they accelerate sinking." },
      { es: "Pida una inspección estructural si su vivienda está en la zona de mayor hundimiento.", en: "Request a structural inspection if your home is in the fastest-sinking area." },
    ],
    moderada: [{ es: "Vigile asentamientos en andenes, vías y redes de servicios.", en: "Watch for settling in sidewalks, roads and utility lines." }],
    baja: [{ es: "Mantenga el seguimiento: la subsidencia es lenta pero acumulativa.", en: "Keep monitoring: subsidence is slow but cumulative." }],
  },
  flood: {
    alta: [
      { es: "Suba documentos, alimentos y objetos de valor; tenga lista una maleta de emergencia.", en: "Move documents, food and valuables up; keep an emergency bag ready." },
      { es: "No cruce calles ni ríos crecidos a pie ni en vehículo.", en: "Do not cross flooded streets or rivers on foot or by vehicle." },
      { es: "Siga los avisos del IDEAM y evacúe si lo indican las autoridades.", en: "Follow IDEAM warnings and evacuate if authorities say so." },
    ],
    moderada: [
      { es: "Aunque el agua baje, los suelos siguen saturados: atención a nuevas lluvias.", en: "Even as water recedes, soils stay saturated: watch for new rain." },
      { es: "Consuma agua hervida o tratada para evitar enfermedades.", en: "Drink boiled or treated water to avoid disease." },
    ],
    baja: [{ es: "Mantenga limpios los canales y conozca los puntos de encuentro.", en: "Keep channels clean and know the meeting points." }],
  },
  glacier: {
    alta: [{ es: "Evite acercarse al frente del glaciar y a los fiordos: los desprendimientos generan olas.", en: "Stay away from the glacier front and fjords: calving generates waves." }],
    moderada: [{ es: "Siga los avisos locales sobre desprendimientos de hielo.", en: "Follow local warnings about ice calving." }],
    baja: [{ es: "Sin acciones especiales: el seguimiento continúa.", en: "No special action: monitoring continues." }],
  },
  deforestation: {
    alta: [
      { es: "Denuncie la tala o quema ilegal ante la autoridad ambiental (CAR o Corpoamazonía).", en: "Report illegal logging or burning to the environmental authority." },
      { es: "Las áreas taladas aumentan el riesgo de incendios y erosión: no queme residuos.", en: "Cleared areas raise fire and erosion risk: do not burn waste." },
    ],
    moderada: [{ es: "Apoye procesos comunitarios de restauración y vigilancia del bosque.", en: "Support community restoration and forest monitoring." }],
    baja: [{ es: "Mantenga el seguimiento de la cobertura forestal.", en: "Keep monitoring forest cover." }],
  },
  volcano: {
    alta: [
      { es: "Siga el nivel de alerta del Servicio Geológico Colombiano y conozca su ruta de evacuación.", en: "Follow the Colombian Geological Survey alert level and know your evacuation route." },
      { es: "Aléjese de los cauces que bajan del volcán: los lahares viajan por los ríos.", en: "Stay away from river channels coming down the volcano: lahars travel along rivers." },
      { es: "Tenga tapabocas y gafas por la caída de ceniza, y un kit de emergencia.", en: "Keep masks and goggles for ashfall, and an emergency kit." },
    ],
    moderada: [
      { es: "Consulte los boletines del SGC y prepare el plan familiar de emergencia.", en: "Check SGC bulletins and prepare a family emergency plan." },
      { es: "Identifique si su vivienda está en zona de amenaza por lahares o flujos.", en: "Check whether your home lies in a lahar or flow hazard zone." },
    ],
    baja: [{ es: "Conozca el mapa de amenaza volcánica de su municipio.", en: "Know your municipality's volcanic hazard map." }],
  },
  earthquake: {
    alta: [{ es: "Durante un sismo: agáchese, cúbrase y agárrese; después, evacúe con calma.", en: "During a quake: drop, cover and hold on; then evacuate calmly." }],
    moderada: [{ es: "Asegure muebles altos y defina un punto de encuentro familiar.", en: "Secure tall furniture and agree on a family meeting point." }],
    baja: [{ es: "Participe en los simulacros de evacuación.", en: "Take part in evacuation drills." }],
  },
  wildfire: {
    alta: [{ es: "Evacúe temprano si se acerca el fuego y reporte incendios a la línea 123 o a bomberos.", en: "Evacuate early if fire approaches and report fires to emergency services." }],
    moderada: [{ es: "No haga quemas y limpie la vegetación seca alrededor de la vivienda.", en: "Do not burn and clear dry vegetation around your home." }],
    baja: [{ es: "Tenga a mano el número de bomberos.", en: "Keep the fire brigade number at hand." }],
  },
};

export function recommendations(kind: RiskKind, level: AttentionLevel, colombia: boolean, lang: "es" | "en") {
  const list = advice[kind][level].map((item) => item[lang]);
  list.push(colombia
    ? (lang === "es" ? "Emergencias: línea 123. Información oficial: UNGRD, SGC e IDEAM." : "Emergencies: dial 123. Official information: UNGRD, SGC and IDEAM.")
    : (lang === "es" ? "Siga siempre las indicaciones de la protección civil local." : "Always follow local civil protection instructions."));
  return list;
}

export const adviceNote: L = {
  es: "Recomendaciones orientativas. No reemplazan las indicaciones de las autoridades.",
  en: "Guidance only. It does not replace instructions from the authorities.",
};
