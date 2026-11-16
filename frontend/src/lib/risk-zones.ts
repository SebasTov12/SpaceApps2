/**
 * Zonas de riesgo que muestra el globo. Son lugares reales y conocidos por el tipo de cambio
 * indicado; solo las que tienen `siteId` tienen capas en el explorador (las demás son ilustrativas).
 */

export type RiskKind = "landslide" | "subsidence" | "flood" | "glacier" | "deforestation" | "volcano" | "earthquake" | "wildfire" | "mining";

/** Tipos que entran en la vigilancia ambiental (huellas de extracción: tala y minería). */
export const watchKinds: ReadonlySet<RiskKind> = new Set<RiskKind>(["deforestation", "mining"]);

export type RiskZone = {
  id: string;
  kind: RiskKind;
  lat: number;
  lon: number;
  name: { es: string; en: string };
  place: { es: string; en: string };
  /** Sitio con capas en la vista de zona */
  siteId?: string;
  /** Código de país ISO; Colombia (CO) es el foco del prototipo */
  country?: string;
  /** Referencia histórica: qué pasó y cuándo (hechos documentados) */
  event?: { date: string; es: string; en: string };
};

export const riskKinds: Record<RiskKind, { color: string; es: string; en: string }> = {
  landslide: { color: "#e8b36b", es: "Deslizamiento", en: "Landslide" },
  subsidence: { color: "#e8805a", es: "Subsidencia", en: "Subsidence" },
  flood: { color: "#6fa8e8", es: "Inundación", en: "Flooding" },
  glacier: { color: "#bfe9f2", es: "Glaciar", en: "Glacier" },
  deforestation: { color: "#7fd18b", es: "Deforestación", en: "Deforestation" },
  volcano: { color: "#ff7a5c", es: "Volcán", en: "Volcano" },
  earthquake: { color: "#c9a2ff", es: "Sismo", en: "Earthquake" },
  wildfire: { color: "#ffb04a", es: "Incendio", en: "Wildfire" },
  mining: { color: "#e0b341", es: "Minería", en: "Mining" },
};

/** Evita la traducción de subsidencia como subsidio en portugués. */
export function riskKindLabel(kind: RiskKind, lang: "es" | "en", globalLang: string) {
  return kind === "subsidence" && globalLang === "pt" ? "Subsidência" : riskKinds[kind][lang];
}

// Las ubicaciones deben provenir del backend; no sembrar zonas de demostración en el globo.
export const riskZones: RiskZone[] = [];

/** Qué mide NISAR en cada tipo de riesgo, en lenguaje simple. */
export const riskKindInfo: Record<RiskKind, { es: string; en: string }> = {
  landslide: { es: "La interferometría mide milímetros de movimiento lento de la ladera antes de que falle.", en: "Interferometry measures millimetres of slow slope creep before failure." },
  subsidence: { es: "Interferogramas sucesivos revelan cuánto se hunde el suelo cada año.", en: "Successive interferograms reveal how much the ground sinks each year." },
  flood: { es: "El agua tranquila se ve oscura en la retrodispersión: la extensión se mapea aunque haya nubes.", en: "Calm water looks dark in backscatter, so flood extent is mapped even under clouds." },
  glacier: { es: "El seguimiento de desplazamientos mide cuántos metros al día avanza el hielo.", en: "Offset tracking measures how many metres per day the ice advances." },
  deforestation: { es: "La señal HV cae cuando se tala el bosque, incluso bajo nubes tropicales.", en: "HV signal drops when forest is cleared, even under tropical clouds." },
  volcano: { es: "La inflación del suelo antes de una erupción aparece como franjas en el interferograma.", en: "Ground inflation before an eruption shows up as interferogram fringes." },
  earthquake: { es: "El interferograma muestra cuánto se desplazó el terreno a cada lado de la falla.", en: "Interferograms show how far the ground moved on each side of the fault." },
  wildfire: { es: "Los cambios de retrodispersión delimitan las cicatrices de incendio.", en: "Backscatter change outlines burn scars." },
  mining: { es: "Las piscinas de minería son agua quieta: el radar las ve muy oscuras, junto al bosque que desaparece, aunque haya nubes.", en: "Mining ponds are still water: radar sees them very dark, next to vanishing forest, even under clouds." },
};
