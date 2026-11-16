/**
 * Registros reales de amenazas de la base de datos (UNGRD, SGC y otras fuentes públicas),
 * agrupados por lugar y tipo en el backend: GET /api/v1/hazards/points (vía /api/hazards).
 */
export type HazardPoint = {
  /** País (ISO-2). Las fuentes actuales son colombianas: si falta, es Colombia. */
  country?: string;
  id?: string;
  lat: number;
  lon: number;
  kind: string;
  n: number;
  first: string | null;
  last: string | null;
  place: string;
  deaths: number;
  affected: number;
  homes: number;
  type: string;
  sources: string[];
  location_precision?: "record_coordinates" | "geometry_centroid" | "municipality_centroid";
  impact_reports?: number;
  events?: { date: string | null; type: string; source: string; affected: number | null; homes: number | null }[];
  model_assessment?: {
    model_version: string;
    track_id: string;
    anomaly_index: number;
    priority: string;
    changed_fraction: number;
    impact_percentile: number;
    priority_score: number;
    estimated_historical_impacts: Record<string, number>;
    recommendation: string;
    created_at: string;
    data_mode: "real_exploratory";
  } | null;
  model_context?: {
    model_version: string;
    municipality: string;
    department: string;
    method: string;
    training_period: string;
    estimated_historical_impacts: Record<string, number>;
    historical_impact_percentile: number;
    estimate_geography: Record<string, "municipality" | "department" | "national">;
    data_mode: "real_historical_context";
    interpretation: string;
  } | null;
  mode?: "real" | "real_exploratory";
  priority?: string | null;
  model_anomaly_index?: number | null;
  record_label?: { es: string; en: string };
};
export type HazardPoints = { records: number; located: number; unlocated: number; model_assessments?: number; points: HazardPoint[]; note?: string; generated_at?: string };

/** Aviso con el resumen cuando llegan los puntos (detail: HazardPoints). */
export const HAZARDS_EVENT = "saros:hazards";
export const HAZARD_POINT_SELECT = "saros:hazard-point-select";

export const HAZARD_KINDS: Record<string, { color: string; es: string; en: string }> = {
  // Mantener esta paleta sincronizada con riskKinds, que pinta los filtros del mapa.
  landslide: { color: "#e8b36b", es: "Movimiento en masa", en: "Landslide" },
  flood: { color: "#6fa8e8", es: "Inundación", en: "Flooding" },
  wildfire: { color: "#ffb04a", es: "Incendio", en: "Wildfire" },
  earthquake: { color: "#c9a2ff", es: "Sismo", en: "Earthquake" },
  volcano: { color: "#ff7a5c", es: "Volcán", en: "Volcano" },
  subsidence: { color: "#e8805a", es: "Hundimiento", en: "Subsidence" },
  glacier: { color: "#bfe9f2", es: "Glaciar", en: "Glacier" },
  deforestation: { color: "#7fd18b", es: "Deforestación", en: "Deforestation" },
  mining: { color: "#e0b341", es: "Minería", en: "Mining" },
  erosion: { color: "#d9b38c", es: "Erosión", en: "Erosion" },
  storm: { color: "#7dd3fc", es: "Vendaval o tormenta", en: "Windstorm" },
  drought: { color: "#f5d061", es: "Sequía", en: "Drought" },
  other: { color: "#cbd5e1", es: "Otra emergencia", en: "Other emergency" },
  model_assessment: { color: "#ff8c69", es: "Evaluación exploratoria", en: "Exploratory assessment" },
};
export const hazardKind = (kind: string) => HAZARD_KINDS[kind] ?? HAZARD_KINDS.other;
export const pointCountry = (p: Pick<HazardPoint, "country">) => p.country ?? "CO";

const SOURCE_NAMES: Record<string, string> = {
  ungrd_emergencies_v1: "UNGRD",
  ungrd_emergencies_v2: "UNGRD",
  sgc_mass_movement_inventory: "SGC",
  corpocaldas_landslide_inventory: "Corpocaldas",
  igac_geologic_hazard_layer: "IGAC",
  sevilla_hydromet_alerts: "Alertas Sevilla",
  saros_model: "Modelo SAROS",
};
export const sourceName = (id: string) => SOURCE_NAMES[id] ?? id;

let request: Promise<HazardPoints | null> | null = null;
export function loadHazardPoints(): Promise<HazardPoints | null> {
  request ??= fetch("/api/hazards", { signal: AbortSignal.timeout(8000) })
    .then((r) => (r.ok ? r.json() : null))
    .then((d: HazardPoints | null) => (d && Array.isArray(d.points) ? d : null))
    .catch(() => null);
  return request;
}
