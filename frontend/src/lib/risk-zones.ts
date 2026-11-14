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
};

export const riskZones: RiskZone[] = [
  { id: "colombia-ladera", kind: "landslide", lat: 7.88, lon: -72.5, siteId: "colombia-ladera", country: "CO",
    name: { es: "Ladera andina", en: "Andean hillside" }, place: { es: "Norte de Santander, Colombia", en: "Norte de Santander, Colombia" } },
  { id: "cdmx-subsidencia", kind: "subsidence", lat: 19.4, lon: -99.08, siteId: "cdmx-subsidencia",
    name: { es: "Hundimiento urbano", en: "Sinking city" }, place: { es: "Ciudad de México, México", en: "Mexico City, Mexico" } },
  { id: "sylhet-inundacion", kind: "flood", lat: 24.85, lon: 91.75, siteId: "sylhet-inundacion",
    name: { es: "Humedales inundables", en: "Flooded wetlands" }, place: { es: "Sylhet, Bangladés", en: "Sylhet, Bangladesh" } },
  { id: "jakobshavn-glaciar", kind: "glacier", lat: 69.17, lon: -49.9, siteId: "jakobshavn-glaciar",
    name: { es: "Glaciar en movimiento", en: "Moving glacier" }, place: { es: "Sermeq Kujalleq, Groenlandia", en: "Sermeq Kujalleq, Greenland" } },
  { id: "rondonia-deforestacion", kind: "deforestation", lat: -9.9, lon: -63.0, siteId: "rondonia-deforestacion",
    name: { es: "Pérdida de bosque", en: "Forest loss" }, place: { es: "Rondônia, Brasil", en: "Rondônia, Brazil" } },
  // ---- Colombia: foco del prototipo ----
  { id: "bogota-subsidencia", kind: "subsidence", lat: 4.66, lon: -74.12, siteId: "bogota-subsidencia", country: "CO",
    name: { es: "Sabana que se hunde", en: "Sinking savanna" }, place: { es: "Bogotá, Colombia", en: "Bogotá, Colombia" } },
  { id: "la-mojana-inundacion", kind: "flood", lat: 8.55, lon: -74.75, siteId: "la-mojana-inundacion", country: "CO",
    event: { date: "2021-08-27", es: "Ruptura del dique de Cara de Gato: inundaciones prolongadas en La Mojana.", en: "Cara de Gato dike breach: prolonged flooding in La Mojana." },
    name: { es: "La Mojana inundada", en: "Flooded La Mojana" }, place: { es: "Sucre y Bolívar, Colombia", en: "Sucre & Bolívar, Colombia" } },
  { id: "caqueta-deforestacion", kind: "deforestation", lat: 1.35, lon: -74.85, siteId: "caqueta-deforestacion", country: "CO",
    name: { es: "Arco de deforestación", en: "Deforestation arc" }, place: { es: "Caquetá, Colombia", en: "Caquetá, Colombia" } },
  { id: "nevado-ruiz", kind: "volcano", lat: 4.892, lon: -75.324, siteId: "nevado-ruiz", country: "CO",
    event: { date: "2023-03-30", es: "El SGC elevó la alerta a naranja por aumento de la actividad sísmica.", en: "SGC raised the alert to orange due to increased seismic activity." },
    name: { es: "Volcán Nevado del Ruiz", en: "Nevado del Ruiz volcano" }, place: { es: "Caldas y Tolima, Colombia", en: "Caldas & Tolima, Colombia" } },
  { id: "mocoa", kind: "landslide", lat: 1.15, lon: -76.65, country: "CO",
    event: { date: "2017-03-31", es: "Avenida torrencial tras lluvias extremas: más de 300 víctimas.", en: "Debris flow after extreme rainfall: more than 300 victims." },
    name: { es: "Avenida torrencial", en: "Debris flow" }, place: { es: "Mocoa, Putumayo, Colombia", en: "Mocoa, Putumayo, Colombia" } },
  { id: "gramalote", kind: "landslide", lat: 7.89, lon: -72.79, country: "CO",
    event: { date: "2010-12-17", es: "Un movimiento en masa destruyó el casco urbano; el pueblo fue reubicado.", en: "A mass movement destroyed the town centre; the town was relocated." },
    name: { es: "Pueblo reubicado", en: "Relocated town" }, place: { es: "Gramalote, Norte de Santander, Colombia", en: "Gramalote, Norte de Santander, Colombia" } },
  { id: "rosas-cauca", kind: "landslide", lat: 2.26, lon: -76.74, country: "CO",
    event: { date: "2023-01-09", es: "Deslizamiento destruyó viviendas y cortó la vía Panamericana.", en: "Landslide destroyed homes and cut the Pan-American Highway." },
    name: { es: "Falla de la Panamericana", en: "Pan-American landslide" }, place: { es: "Rosas, Cauca, Colombia", en: "Rosas, Cauca, Colombia" } },
  { id: "via-llano", kind: "landslide", lat: 4.27, lon: -73.86, country: "CO",
    event: { date: "2019-06-15", es: "Derrumbe en el km 58 cerró la vía Bogotá–Villavicencio por semanas.", en: "A landslide at km 58 closed the Bogotá–Villavicencio road for weeks." },
    name: { es: "Vía al Llano, km 58", en: "Llano road, km 58" }, place: { es: "Guayabetal, Cundinamarca, Colombia", en: "Guayabetal, Cundinamarca, Colombia" } },
  { id: "galeras", kind: "volcano", lat: 1.22, lon: -77.36, country: "CO",
    event: { date: "2010-08-25", es: "Erupción explosiva; el volcán sigue bajo vigilancia permanente del SGC.", en: "Explosive eruption; the volcano remains under permanent SGC monitoring." },
    name: { es: "Volcán Galeras", en: "Galeras volcano" }, place: { es: "Pasto, Nariño, Colombia", en: "Pasto, Nariño, Colombia" } },
  // ---- Resto del mundo ----
  { id: "jakarta", kind: "subsidence", lat: -6.2, lon: 106.85,
    name: { es: "Ciudad que se hunde", en: "Sinking coastal city" }, place: { es: "Yakarta, Indonesia", en: "Jakarta, Indonesia" } },
  { id: "central-valley", kind: "subsidence", lat: 36.6, lon: -119.8,
    name: { es: "Acuífero sobreexplotado", en: "Over-pumped aquifer" }, place: { es: "Valle Central, California", en: "Central Valley, California" } },
  { id: "tehran", kind: "subsidence", lat: 35.6, lon: 51.3,
    name: { es: "Subsidencia acelerada", en: "Rapid subsidence" }, place: { es: "Teherán, Irán", en: "Tehran, Iran" } },
  { id: "kilauea", event: { date: "2018-05-03", es: "Erupción en la zona de rift baja: lava sobre barrios de Puna durante tres meses.", en: "Lower East Rift Zone eruption: lava over Puna neighbourhoods for three months." }, kind: "volcano", lat: 19.42, lon: -155.29,
    name: { es: "Volcán activo", en: "Active volcano" }, place: { es: "Kīlauea, Hawái", en: "Kīlauea, Hawaii" } },
  { id: "campi-flegrei", event: { date: "2024-05-20", es: "Enjambre sísmico (M4.4) asociado al levantamiento del suelo en la caldera.", en: "Seismic swarm (M4.4) linked to ground uplift in the caldera." }, kind: "volcano", lat: 40.83, lon: 14.14,
    name: { es: "Caldera que se eleva", en: "Uplifting caldera" }, place: { es: "Campi Flegrei, Italia", en: "Campi Flegrei, Italy" } },
  { id: "reykjanes", event: { date: "2023-12-18", es: "Erupción fisural cerca de Grindavík tras meses de deformación del terreno.", en: "Fissure eruption near Grindavík after months of ground deformation." }, kind: "volcano", lat: 63.88, lon: -22.27,
    name: { es: "Erupciones fisurales", en: "Fissure eruptions" }, place: { es: "Reykjanes, Islandia", en: "Reykjanes, Iceland" } },
  { id: "kahramanmaras", event: { date: "2023-02-06", es: "Terremotos de magnitud 7.8 y 7.5 en el sureste de Turquía y Siria.", en: "Magnitude 7.8 and 7.5 earthquakes in southeastern Türkiye and Syria." }, kind: "earthquake", lat: 37.6, lon: 37.0,
    name: { es: "Falla de Anatolia Oriental", en: "East Anatolian Fault" }, place: { es: "Kahramanmaraş, Turquía", en: "Kahramanmaraş, Türkiye" } },
  { id: "nepal", event: { date: "2015-04-25", es: "El sismo de Gorkha desencadenó miles de deslizamientos en el Himalaya.", en: "The Gorkha earthquake triggered thousands of Himalayan landslides." }, kind: "landslide", lat: 28.0, lon: 85.3,
    name: { es: "Laderas del Himalaya", en: "Himalayan slopes" }, place: { es: "Nepal", en: "Nepal" } },
  { id: "indus", event: { date: "2022-08-25", es: "Inundaciones del monzón cubrieron grandes extensiones de Sindh.", en: "Monsoon floods covered vast areas of Sindh." }, kind: "flood", lat: 26.0, lon: 68.0,
    name: { es: "Llanura del Indo", en: "Indus floodplain" }, place: { es: "Sindh, Pakistán", en: "Sindh, Pakistan" } },
  { id: "mekong", kind: "flood", lat: 10.0, lon: 105.8,
    name: { es: "Delta del Mekong", en: "Mekong Delta" }, place: { es: "Vietnam", en: "Vietnam" } },
  { id: "thwaites", kind: "glacier", lat: -75.5, lon: -106.75,
    name: { es: "Glaciar Thwaites", en: "Thwaites Glacier" }, place: { es: "Antártida Occidental", en: "West Antarctica" } },
  { id: "para", kind: "deforestation", lat: -3.5, lon: -52.0,
    name: { es: "Frente de deforestación", en: "Deforestation front" }, place: { es: "Pará, Brasil", en: "Pará, Brazil" } },
  { id: "nsw", event: { date: "2019-12-31", es: "Temporada de incendios «Black Summer» en el sureste de Australia.", en: "“Black Summer” bushfire season in southeastern Australia." }, kind: "wildfire", lat: -33.5, lon: 150.3,
    name: { es: "Cicatrices de incendio", en: "Burn scars" }, place: { es: "Nueva Gales del Sur, Australia", en: "New South Wales, Australia" } },
  { id: "british-columbia", event: { date: "2023-08-18", es: "Temporada de incendios récord en Columbia Británica.", en: "Record wildfire season in British Columbia." }, kind: "wildfire", lat: 55.0, lon: -123.0,
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
