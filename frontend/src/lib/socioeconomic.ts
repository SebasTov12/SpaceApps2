/** Serializable contract for a future territorial assessment API. Demo figures are invented. */
export type LocalText = { es: string; en: string };
export type TerritorialAssessment = {
  zoneId: string;
  mode: "demo" | "real";
  source: LocalText;
  population: number;
  homes: number;
  productiveHa: number;
  infrastructure: { label: LocalText; count: number }[];
  vulnerability: { status: "unassessed" | "assessed"; factors: LocalText[] };
  risk: { level: "unassessed" | "low" | "moderate" | "high"; method: LocalText };
  assessedAt: string | null;
  alerts?: { id: string; issuedAt: string; expiresAt: string; severity: "info" | "watch" | "warning"; message: LocalText; action: LocalText; source: string }[];
  forecast?: { status: "unavailable" | "experimental" | "validated"; horizon: LocalText; method: string; uncertainty: LocalText; summary: LocalText };
  sectors: LocalText[];
  consequence: LocalText;
  prevention: LocalText;
  historicalImpacts: { date: string; description: LocalText; source: string }[];
};
const txt = (es: string, en: string): LocalText => ({ es, en });
const profiles = [
  ["colombia-ladera", 2400, 620, 850, txt("Agricultura · Ganadería · Minería · Vivienda", "Agriculture · Livestock · Mining · Housing"), txt("Un escenario de inestabilidad podría interrumpir accesos, riego y actividad productiva. La exposición no confirma daños.", "An instability scenario could disrupt access, irrigation and production. Exposure does not confirm damage."), txt("Priorizar inspección de laderas, drenajes, caminos rurales y viviendas expuestas con las autoridades locales.", "Prioritize local-authority inspections of slopes, drainage, rural roads and exposed homes.")],
  ["cdmx-subsidencia", 18000, 4600, 120, txt("Vivienda · Comercio · Redes de agua", "Housing · Commerce · Water networks"), txt("La deformación diferencial podría afectar servicios y accesibilidad, según la vulnerabilidad de las construcciones.", "Differential deformation could affect services and access, depending on building vulnerability."), txt("Solicitar evaluación técnica de redes y estructuras; contrastar deformación con inventarios de daños.", "Request technical assessment of networks and structures; compare deformation with damage inventories.")],
  ["sylhet-inundacion", 6500, 1500, 2200, txt("Agricultura · Ganadería · Vivienda", "Agriculture · Livestock · Housing"), txt("La exposición a inundación podría interrumpir cosechas, movilidad y acceso a servicios.", "Flood exposure could disrupt harvests, mobility and access to services."), txt("Revisar rutas de acceso, drenaje y continuidad de medios de vida con responsables territoriales.", "Review access routes, drainage and livelihood continuity with local authorities.")],
  ["jakobshavn-glaciar", 900, 240, 0, txt("Pesca · Turismo · Infraestructura costera", "Fishing · Tourism · Coastal infrastructure"), txt("Cambios glaciares podrían requerir evaluar navegación y actividades costeras; el movimiento no determina por sí solo el impacto local.", "Glacier changes may warrant assessing navigation and coastal activity; motion alone does not determine local impact."), txt("Contrastar observaciones con información oceanográfica y especialistas locales.", "Compare observations with oceanographic information and local specialists.")],
  ["rondonia-deforestacion", 3200, 780, 3100, txt("Bosque · Agricultura · Ganadería", "Forest · Agriculture · Livestock"), txt("Cambios de cobertura podrían afectar medios de vida y servicios ecosistémicos. No demuestran infertilidad del suelo.", "Land-cover changes could affect livelihoods and ecosystem services. They do not demonstrate soil infertility."), txt("Verificar uso del suelo en campo y evaluar conservación, erosión y actividades productivas.", "Verify land use in the field and assess conservation, erosion and productive activities.")],
] as const;
export const demoAssessments: TerritorialAssessment[] = profiles.map(([zoneId, population, homes, productiveHa, sector, consequence, prevention]) => ({
  zoneId, mode: "demo", population, homes, productiveHa, sectors: [sector], consequence, prevention,
  source: txt("Supuestos ilustrativos sin fuente estadística; no representan un censo regional.", "Illustrative assumptions without a statistical source; not a regional census."),
  historicalImpacts: [],
  assessedAt: null,
  infrastructure: [{ label: txt("Tramos de acceso", "Access segments"), count: 12 }, { label: txt("Instalaciones de servicios", "Service facilities"), count: 4 }],
  vulnerability: { status: "unassessed", factors: [txt("Estado de construcciones y redes", "Building and network condition"), txt("Dependencia de accesos y actividades productivas", "Dependence on access and productive activities"), txt("Condiciones del suelo y capacidad de respuesta", "Soil conditions and response capacity")] },
  risk: { level: "unassessed", method: txt("Pendiente de evaluación territorial validada", "Validated territorial assessment pending") },
}));

/** Fractions are user-selected assumptions, never probabilities inferred from radar. */
export const exposureScenarios = [
  { label: txt("Limitado", "Limited"), fraction: 0.1 },
  { label: txt("Intermedio", "Intermediate"), fraction: 0.3 },
  { label: txt("Amplio", "Extensive"), fraction: 0.6 },
] as const;
