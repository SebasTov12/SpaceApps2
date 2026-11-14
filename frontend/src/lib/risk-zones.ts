/**
 * Zonas de riesgo que muestra el globo. Son lugares reales y conocidos por el tipo de cambio
 * indicado; solo las que tienen `siteId` tienen capas en el explorador (las demás son ilustrativas).
 */

export type RiskKind = "landslide" | "subsidence" | "flood" | "glacier" | "deforestation" | "volcano" | "earthquake" | "wildfire";

export type RiskZone = {
  id: string;
  kind: RiskKind;
  lat: number;
  lon: number;
  name: { es: string; en: string };
  place: { es: string; en: string };
  /** Sitio con datos en el explorador */
  siteId?: string;
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
};

export const riskZones: RiskZone[] = [
  { id: "colombia-ladera", kind: "landslide", lat: 7.88, lon: -72.5, siteId: "colombia-ladera",
    name: { es: "Ladera andina", en: "Andean hillside" }, place: { es: "Norte de Santander, Colombia", en: "Norte de Santander, Colombia" } },
  { id: "cdmx-subsidencia", kind: "subsidence", lat: 19.4, lon: -99.08, siteId: "cdmx-subsidencia",
    name: { es: "Hundimiento urbano", en: "Sinking city" }, place: { es: "Ciudad de México, México", en: "Mexico City, Mexico" } },
  { id: "sylhet-inundacion", kind: "flood", lat: 24.85, lon: 91.75, siteId: "sylhet-inundacion",
    name: { es: "Humedales inundables", en: "Flooded wetlands" }, place: { es: "Sylhet, Bangladés", en: "Sylhet, Bangladesh" } },
  { id: "jakobshavn-glaciar", kind: "glacier", lat: 69.17, lon: -49.9, siteId: "jakobshavn-glaciar",
    name: { es: "Glaciar en movimiento", en: "Moving glacier" }, place: { es: "Sermeq Kujalleq, Groenlandia", en: "Sermeq Kujalleq, Greenland" } },
  { id: "rondonia-deforestacion", kind: "deforestation", lat: -9.9, lon: -63.0, siteId: "rondonia-deforestacion",
    name: { es: "Pérdida de bosque", en: "Forest loss" }, place: { es: "Rondônia, Brasil", en: "Rondônia, Brazil" } },
  { id: "jakarta", kind: "subsidence", lat: -6.2, lon: 106.85,
    name: { es: "Ciudad que se hunde", en: "Sinking coastal city" }, place: { es: "Yakarta, Indonesia", en: "Jakarta, Indonesia" } },
  { id: "central-valley", kind: "subsidence", lat: 36.6, lon: -119.8,
    name: { es: "Acuífero sobreexplotado", en: "Over-pumped aquifer" }, place: { es: "Valle Central, California", en: "Central Valley, California" } },
  { id: "tehran", kind: "subsidence", lat: 35.6, lon: 51.3,
    name: { es: "Subsidencia acelerada", en: "Rapid subsidence" }, place: { es: "Teherán, Irán", en: "Tehran, Iran" } },
  { id: "kilauea", kind: "volcano", lat: 19.42, lon: -155.29,
    name: { es: "Volcán activo", en: "Active volcano" }, place: { es: "Kīlauea, Hawái", en: "Kīlauea, Hawaii" } },
  { id: "campi-flegrei", kind: "volcano", lat: 40.83, lon: 14.14,
    name: { es: "Caldera que se eleva", en: "Uplifting caldera" }, place: { es: "Campi Flegrei, Italia", en: "Campi Flegrei, Italy" } },
  { id: "reykjanes", kind: "volcano", lat: 63.88, lon: -22.27,
    name: { es: "Erupciones fisurales", en: "Fissure eruptions" }, place: { es: "Reykjanes, Islandia", en: "Reykjanes, Iceland" } },
  { id: "kahramanmaras", kind: "earthquake", lat: 37.6, lon: 37.0,
    name: { es: "Falla de Anatolia Oriental", en: "East Anatolian Fault" }, place: { es: "Kahramanmaraş, Turquía", en: "Kahramanmaraş, Türkiye" } },
  { id: "nepal", kind: "landslide", lat: 28.0, lon: 85.3,
    name: { es: "Laderas del Himalaya", en: "Himalayan slopes" }, place: { es: "Nepal", en: "Nepal" } },
  { id: "indus", kind: "flood", lat: 26.0, lon: 68.0,
    name: { es: "Llanura del Indo", en: "Indus floodplain" }, place: { es: "Sindh, Pakistán", en: "Sindh, Pakistan" } },
  { id: "mekong", kind: "flood", lat: 10.0, lon: 105.8,
    name: { es: "Delta del Mekong", en: "Mekong Delta" }, place: { es: "Vietnam", en: "Vietnam" } },
  { id: "thwaites", kind: "glacier", lat: -75.5, lon: -106.75,
    name: { es: "Glaciar Thwaites", en: "Thwaites Glacier" }, place: { es: "Antártida Occidental", en: "West Antarctica" } },
  { id: "para", kind: "deforestation", lat: -3.5, lon: -52.0,
    name: { es: "Frente de deforestación", en: "Deforestation front" }, place: { es: "Pará, Brasil", en: "Pará, Brazil" } },
  { id: "nsw", kind: "wildfire", lat: -33.5, lon: 150.3,
    name: { es: "Cicatrices de incendio", en: "Burn scars" }, place: { es: "Nueva Gales del Sur, Australia", en: "New South Wales, Australia" } },
  { id: "british-columbia", kind: "wildfire", lat: 55.0, lon: -123.0,
    name: { es: "Incendios boreales", en: "Boreal wildfires" }, place: { es: "Columbia Británica, Canadá", en: "British Columbia, Canada" } },
];

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
};
