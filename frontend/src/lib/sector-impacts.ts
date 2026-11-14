import type { RiskKind } from "./risk-zones";

/**
 * Cómo un cambio del terreno puede afectar a cada sector productivo y social, y cómo reforzarlo.
 * Son efectos posibles por tipo de amenaza (no daños confirmados ni probabilidades).
 */
export type SectorKey = "agriculture" | "livestock" | "mining" | "housing" | "roads" | "forest" | "water" | "commerce" | "fishing";
export type Exposure = "low" | "medium" | "high";
type T = { es: string; en: string };
const t = (es: string, en: string): T => ({ es, en });

export const sectorNames: Record<SectorKey, T> = {
  agriculture: t("Agricultura", "Agriculture"),
  livestock: t("Ganadería", "Livestock"),
  mining: t("Minería", "Mining"),
  housing: t("Vivienda", "Housing"),
  roads: t("Vías y puentes", "Roads & bridges"),
  forest: t("Bosque", "Forest"),
  water: t("Agua y acueductos", "Water supply"),
  commerce: t("Comercio", "Commerce"),
  fishing: t("Pesca", "Fishing"),
};

export const exposureNames: Record<Exposure, T & { color: string }> = {
  low: { ...t("Exposición baja", "Low exposure"), color: "#10b981" },
  medium: { ...t("Exposición media", "Medium exposure"), color: "#f59e0b" },
  high: { ...t("Exposición alta", "High exposure"), color: "#f43f5e" },
};

type Effect = { effect: T; reinforce: T };
const e = (effectEs: string, effectEn: string, reinforceEs: string, reinforceEn: string): Effect => ({ effect: t(effectEs, effectEn), reinforce: t(reinforceEs, reinforceEn) });

/** Efecto posible de cada amenaza sobre cada sector. */
export const sectorEffects: Partial<Record<RiskKind, Partial<Record<SectorKey, Effect>>>> = {
  landslide: {
    agriculture: e("El terreno que se desliza arrastra la capa fértil y deja roca o arcilla expuesta: el lote puede tardar años en volver a producir.", "Sliding ground strips the fertile topsoil and exposes rock or clay: the plot may take years to produce again.",
      "Barreras vivas y zanjas de drenaje, no arar a favor de la pendiente y reforestar la parte alta de la ladera.", "Living barriers and drainage ditches, no ploughing down the slope, and reforesting the upper hillside."),
    livestock: e("Los potreros en pendiente pierden pasto, se abren grietas peligrosas para el ganado y se cortan los caminos para sacarlo.", "Sloping pastures lose grass, cracks open that endanger cattle, and access tracks are cut.",
      "Rotar potreros, cercar grietas y zonas inestables y tener una ruta alterna para mover el ganado.", "Rotate pastures, fence off cracks and unstable areas, and keep an alternative route to move cattle."),
    mining: e("Socavones, taludes y botaderos en laderas inestables pueden colapsar o ser arrastrados.", "Tunnels, cuts and waste dumps on unstable slopes can collapse or be carried away.",
      "Revisión geotécnica de taludes y botaderos; suspender frentes de trabajo donde aparezcan grietas.", "Geotechnical review of cuts and dumps; stop work fronts where cracks appear."),
    housing: e("Grietas en muros y pisos y puertas que se traban; si el movimiento se acelera, riesgo de colapso.", "Cracks in walls and floors and sticking doors; if motion accelerates, risk of collapse.",
      "Vigilar las grietas cada semana, sacar las aguas lluvias y servidas lejos de la ladera y conocer la ruta de evacuación.", "Check cracks weekly, drain rain and waste water away from the slope and know the evacuation route."),
    roads: e("Hundimientos y derrumbes que cortan la vía y dejan aisladas a las veredas.", "Sinking and slides that cut the road and isolate rural communities.",
      "Obras de drenaje, muros de contención y monitoreo de los taludes marcados.", "Drainage works, retaining walls and monitoring of the flagged cuts."),
    water: e("Rotura de acueductos veredales y tuberías que cruzan la ladera.", "Broken rural water systems and pipes crossing the slope.",
      "Tramos de tubería flexible en las zonas inestables y tanques de reserva.", "Flexible pipe sections in unstable stretches and reserve tanks."),
    commerce: e("Cierre de vías que corta la llegada de productos y la salida de las cosechas.", "Road closures cut supplies in and harvests out.",
      "Planes de abastecimiento con rutas alternas y reservas en temporada de lluvias.", "Supply plans with alternative routes and stock for the rainy season."),
  },
  subsidence: {
    housing: e("El hundimiento desigual inclina casas y edificios y abre grietas en la estructura.", "Uneven sinking tilts houses and buildings and cracks their structure.",
      "Inspección estructural donde el hundimiento es mayor y refuerzo de cimentaciones.", "Structural inspection where sinking is greatest and foundation reinforcement."),
    water: e("Se rompen tuberías de agua y alcantarillado y aumentan los encharcamientos.", "Water and sewer pipes break and ponding increases.",
      "Reducir la extracción de agua subterránea y usar uniones flexibles en las redes.", "Reduce groundwater pumping and use flexible joints in networks."),
    roads: e("Desniveles, baches y daños en puentes y vías férreas.", "Uneven surfaces, potholes and damage to bridges and railways.",
      "Nivelación periódica y monitoreo de puentes y pasos elevados.", "Periodic levelling and monitoring of bridges and overpasses."),
    agriculture: e("Los lotes hundidos se encharcan; el suelo se satura o se saliniza y produce menos.", "Sunken plots pond; soil becomes waterlogged or salty and yields less.",
      "Drenaje de los lotes, control del bombeo de pozos y cultivos tolerantes al exceso de agua.", "Field drainage, well-pumping control and crops tolerant to excess water."),
    commerce: e("Locales y bodegas con daños y cierres temporales.", "Damaged shops and warehouses and temporary closures.",
      "Revisar estructuras y seguros de los locales en los puntos marcados.", "Review structures and insurance of premises at flagged points."),
  },
  flood: {
    agriculture: e("Cosechas perdidas; el agua estancada ahoga las raíces y deja sedimentos o sales que bajan la fertilidad del suelo.", "Lost harvests; standing water drowns roots and leaves sediment or salts that lower soil fertility.",
      "Sembrar en camellones o zonas altas, usar variedades tolerantes y ajustar la siembra al pronóstico del IDEAM.", "Plant on raised beds or high ground, use tolerant varieties and time sowing to IDEAM forecasts."),
    livestock: e("Ganado sin pasto o ahogado y enfermedades por el agua estancada.", "Cattle without pasture or drowned, and disease from standing water.",
      "Zonas altas de refugio para el ganado y reservas de forraje y sal.", "High-ground refuges for cattle and stocks of fodder and salt."),
    housing: e("Viviendas inundadas por semanas, pérdida de enseres y riesgos para la salud.", "Homes flooded for weeks, lost belongings and health risks.",
      "Elevar pisos y enseres, revisar los diques y conocer los albergues.", "Raise floors and belongings, inspect dikes and know the shelters."),
    roads: e("Vías y puentes bajo el agua; comunidades aisladas.", "Roads and bridges under water; isolated communities.",
      "Elevar los tramos críticos y prever transporte fluvial de emergencia.", "Raise critical stretches and plan emergency river transport."),
    fishing: e("Cambia el ciclo de los peces y se dañan los aparejos y las embarcaciones.", "Fish cycles change and gear and boats are damaged.",
      "Asegurar embarcaciones y coordinar vedas con la autoridad pesquera.", "Secure boats and coordinate closures with the fisheries authority."),
    water: e("Pozos y acueductos contaminados por el agua de la inundación.", "Wells and water systems contaminated by floodwater.",
      "Tapar pozos, hervir o clorar el agua y tener reservas de agua potable.", "Cap wells, boil or chlorinate water and store drinking water."),
  },
  deforestation: {
    forest: e("Pérdida de bosque y de biodiversidad; el suelo descubierto se erosiona.", "Loss of forest and biodiversity; bare soil erodes.",
      "Restauración con especies nativas y control de la tala con las autoridades ambientales.", "Restoration with native species and logging control with environmental authorities."),
    agriculture: e("Al principio el suelo produce, pero sin bosque pierde nutrientes en pocos años y se vuelve poco fértil.", "Soil produces at first, but without forest it loses nutrients within a few years and becomes poor.",
      "Sistemas agroforestales en lugar de tumbar más bosque.", "Agroforestry systems instead of clearing more forest."),
    livestock: e("Potreros nuevos que se degradan rápido y empujan a tumbar más bosque.", "New pastures degrade quickly and push for more clearing.",
      "Ganadería silvopastoril con árboles en los potreros.", "Silvopastoral ranching with trees in the pastures."),
    water: e("Ríos con menos caudal en sequía y crecientes más fuertes con la lluvia.", "Rivers with less flow in droughts and stronger floods with rain.",
      "Proteger las rondas de los ríos y los nacimientos de agua.", "Protect riverbanks and springs."),
  },
  volcano: {
    agriculture: e("La ceniza daña cultivos y pastos; en capas gruesas cubre el suelo.", "Ash damages crops and pasture; thick layers bury the soil.",
      "Cubrir cultivos sensibles y seguir los boletines del Servicio Geológico Colombiano.", "Cover sensitive crops and follow the Colombian Geological Survey bulletins."),
    livestock: e("El ganado se enferma al comer pasto con ceniza o tomar agua contaminada.", "Cattle fall ill from ash-covered grass or contaminated water.",
      "Guardar forraje y agua cubiertos y alejar el ganado de los cauces.", "Keep fodder and water covered and move cattle away from riverbeds."),
    housing: e("Techos que pueden ceder por el peso de la ceniza; los lahares bajan por los ríos.", "Roofs may give way under ash; lahars travel down rivers.",
      "Limpiar los techos y conocer las rutas de evacuación lejos de los cauces.", "Clear roofs and know evacuation routes away from riverbeds."),
    roads: e("Los lahares destruyen puentes y la ceniza vuelve resbalosas las vías.", "Lahars destroy bridges and ash makes roads slippery.",
      "Señalizar rutas alternas y vigilar los puentes sobre los ríos que nacen en el volcán.", "Mark alternative routes and monitor bridges over rivers draining the volcano."),
    water: e("La ceniza contamina bocatomas y acueductos.", "Ash contaminates intakes and water systems.",
      "Proteger las bocatomas y tener reservas de agua potable.", "Protect intakes and store drinking water."),
  },
  earthquake: {
    housing: e("Viviendas sin refuerzo sismorresistente pueden agrietarse o colapsar.", "Homes without seismic reinforcement may crack or collapse.",
      "Reforzar según la norma NSR-10, revisar muros y techos y tener un plan familiar de emergencia.", "Retrofit to the NSR-10 code, check walls and roofs and have a family emergency plan."),
    mining: e("Socavones y frentes de excavación pueden derrumbarse con el sismo o sus réplicas.", "Tunnels and pits may cave in during a quake or aftershocks.",
      "Entibar socavones, evacuar después de un sismo fuerte y revisar antes de volver a entrar.", "Shore up tunnels, evacuate after a strong quake and inspect before re-entering."),
    roads: e("Derrumbes en las vías y daños en puentes.", "Landslides on roads and damaged bridges.",
      "Inspección de puentes y taludes después de cada sismo fuerte.", "Inspect bridges and cuts after every strong quake."),
    water: e("Rotura de tuberías y daño en tanques de agua.", "Broken pipes and damaged water tanks.",
      "Anclar tanques y tener reservas de agua para 72 horas.", "Anchor tanks and keep 72 hours of water."),
    agriculture: e("El sismo puede disparar deslizamientos que sepultan cultivos y cambian el curso de quebradas.", "A quake can trigger landslides that bury crops and divert streams.",
      "Identificar las laderas inestables cercanas y no cultivar en las zonas marcadas.", "Identify nearby unstable slopes and avoid farming flagged areas."),
    forest: e("Deslizamientos en las cuencas que arrastran bosque y sedimentos a los ríos.", "Landslides in watersheds that carry forest and sediment into rivers.",
      "Conservar la cobertura vegetal de las cuencas para amarrar el suelo.", "Keep watershed vegetation to hold the soil."),
  },
};

/** Sectores expuestos por zona (ilustrativo, sin fuente estadística). */
export const zoneSectors: Record<string, [SectorKey, Exposure][]> = {
  "colombia-ladera": [["agriculture", "high"], ["housing", "high"], ["livestock", "medium"], ["mining", "medium"], ["roads", "medium"]],
  "bogota-subsidencia": [["housing", "high"], ["water", "high"], ["roads", "medium"], ["agriculture", "medium"], ["commerce", "medium"]],
  "la-mojana-inundacion": [["agriculture", "high"], ["livestock", "high"], ["housing", "high"], ["fishing", "medium"], ["water", "medium"]],
  "caqueta-deforestacion": [["forest", "high"], ["livestock", "high"], ["agriculture", "medium"], ["water", "medium"]],
  "nevado-ruiz": [["agriculture", "high"], ["livestock", "medium"], ["housing", "medium"], ["roads", "medium"], ["water", "medium"]],
  mocoa: [["housing", "high"], ["roads", "high"], ["water", "medium"], ["commerce", "medium"]],
  gramalote: [["housing", "high"], ["agriculture", "medium"], ["roads", "medium"]],
  "rosas-cauca": [["roads", "high"], ["housing", "high"], ["commerce", "medium"], ["agriculture", "medium"]],
  "via-llano": [["roads", "high"], ["commerce", "high"], ["agriculture", "medium"]],
  galeras: [["agriculture", "high"], ["housing", "medium"], ["livestock", "medium"], ["water", "medium"]],
  "choco-atrato": [["mining", "high"], ["housing", "high"], ["forest", "medium"], ["water", "medium"], ["agriculture", "medium"]],
  "cdmx-subsidencia": [["housing", "high"], ["water", "high"], ["roads", "medium"], ["commerce", "medium"]],
  "sylhet-inundacion": [["agriculture", "high"], ["housing", "high"], ["livestock", "medium"], ["fishing", "medium"]],
  "rondonia-deforestacion": [["forest", "high"], ["livestock", "high"], ["agriculture", "medium"], ["water", "medium"]],
};

export type SectorImpact = { sector: SectorKey; exposure: Exposure; effect: T; reinforce: T };

const order: Record<Exposure, number> = { high: 0, medium: 1, low: 2 };

/** Afectaciones posibles por sector para una zona. Sin perfil, usa los sectores típicos de la amenaza con exposición media. */
export function sectorImpacts(zoneId: string, kind: RiskKind): SectorImpact[] {
  const effects = sectorEffects[kind] ?? {};
  const profile = zoneSectors[zoneId] ?? (Object.keys(effects) as SectorKey[]).slice(0, 4).map((key) => [key, "medium"] as [SectorKey, Exposure]);
  return profile
    .filter(([key]) => effects[key])
    .map(([key, exposure]) => ({ sector: key, exposure, ...effects[key]! }))
    .sort((a, b) => order[a.exposure] - order[b.exposure]);
}
