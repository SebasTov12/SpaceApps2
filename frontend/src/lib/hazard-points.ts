/**
 * Registros reales de amenazas de la base de datos (UNGRD, SGC y otras fuentes públicas),
 * agrupados por lugar y tipo en el backend: GET /api/v1/hazards/points (vía /api/hazards).
 */
export type HazardPoint = {
  /** País (ISO-2). Las fuentes actuales son colombianas: si falta, es Colombia. */
  country?: string;
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
  mode?: "real" | "real_exploratory";
  priority?: string | null;
  model_anomaly_index?: number | null;
  record_label?: { es: string; en: string };
};
export type HazardPoints = { records: number; located: number; unlocated: number; model_assessments?: number; points: HazardPoint[]; note?: string; generated_at?: string };

/** Aviso con el resumen cuando llegan los puntos (detail: HazardPoints). */
export const HAZARDS_EVENT = "saros:hazards";

export const HAZARD_KINDS: Record<string, { color: string; es: string; en: string }> = {
  landslide: { color: "#e8b36b", es: "Movimiento en masa", en: "Landslide" },
  flood: { color: "#5aa8ff", es: "Inundación", en: "Flooding" },
  wildfire: { color: "#ff7a3d", es: "Incendio", en: "Wildfire" },
  earthquake: { color: "#c084fc", es: "Sismo", en: "Earthquake" },
  volcano: { color: "#ff5a5a", es: "Volcán", en: "Volcano" },
  subsidence: { color: "#e8805a", es: "Hundimiento", en: "Subsidence" },
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
  request ??= fetch("/api/hazards")
    .then((r) => (r.ok ? r.json() : null))
    .then((d: HazardPoints | null) => (d && Array.isArray(d.points) ? d : null))
    .catch(() => null);
  return request;
}
