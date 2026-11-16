import type { TerritorialAssessment } from "./socioeconomic";

export type MunicipalProfile = {
  divipola: string;
  municipality: string;
  department: string;
  censusVintage: string;
  population: number | null;
  households: number | null;
  dwellings: number | null;
  occupiedDwellings: number | null;
  housingDeficitPercent: number | null;
  multidimensionalPovertyIndex: number | null;
  healthFacilities: number | null;
  schools: number | null;
  updatedAt: string | null;
};

const departmentsByZone: Record<string, string[]> = {
  "colombia-ladera": ["54"],
  "bogota-subsidencia": ["11"],
  "la-mojana-inundacion": ["13", "70"],
  "caqueta-deforestacion": ["18"],
  "atrato-mineria": ["27"],
  "bajo-cauca-mineria": ["05"],
  "chiribiquete-borde": ["95"],
};

type MunicipalFeature = {
  geometry?: { type?: unknown; coordinates?: unknown } | null;
  properties?: Record<string, unknown>;
};

const numberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};

function pointInRing(lon: number, lat: number, ring: unknown): boolean {
  if (!Array.isArray(ring) || ring.length < 4) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) continue;
    const [xi, yi] = a as number[];
    const [xj, yj] = b as number[];
    if (![xi, yi, xj, yj].every(Number.isFinite)) continue;
    const crosses = (yi > lat) !== (yj > lat)
      && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function containsPoint(feature: MunicipalFeature, lon: number, lat: number): boolean {
  const geometry = feature.geometry;
  if (!geometry || !Array.isArray(geometry.coordinates)) return false;
  const polygonContains = (polygon: unknown) => Array.isArray(polygon)
    && polygon.length > 0
    && pointInRing(lon, lat, polygon[0])
    && !polygon.slice(1).some((hole) => pointInRing(lon, lat, hole));
  if (geometry.type === "Polygon") return polygonContains(geometry.coordinates);
  if (geometry.type === "MultiPolygon") return geometry.coordinates.some(polygonContains);
  return false;
}

/** Find the official municipal profile whose DANE polygon contains the selected Colombian zone. */
export async function loadMunicipalProfile(
  zoneId: string,
  lon: number,
  lat: number,
  signal: AbortSignal,
): Promise<MunicipalProfile | null> {
  const base = process.env.NEXT_PUBLIC_SAROS_API;
  const departments = departmentsByZone[zoneId];
  if (!base || !departments) return null;
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(12000)]);
  const collections = await Promise.all(departments.map(async (department) => {
    const response = await fetch(
      `${base.replace(/\/$/, "")}/api/v1/territorial/municipalities?department=${department}`,
      { signal: requestSignal, cache: "no-store" },
    );
    if (!response.ok) throw new Error(`Territorial API HTTP ${response.status}`);
    const payload: unknown = await response.json();
    if (!record(payload) || payload.type !== "FeatureCollection" || !Array.isArray(payload.features)) {
      throw new Error("Invalid municipal feature collection");
    }
    return payload.features as MunicipalFeature[];
  }));
  const feature = collections.flat().find((candidate) => containsPoint(candidate, lon, lat));
  const properties = feature?.properties;
  if (!properties || typeof properties.divipola !== "string"
    || typeof properties.municipality_name !== "string" || typeof properties.department_name !== "string") return null;
  return {
    divipola: properties.divipola,
    municipality: properties.municipality_name,
    department: properties.department_name,
    censusVintage: typeof properties.census_vintage === "string" ? properties.census_vintage : "2018",
    population: numberOrNull(properties.population_total),
    households: numberOrNull(properties.households_total),
    dwellings: numberOrNull(properties.dwellings_total),
    occupiedDwellings: numberOrNull(properties.occupied_dwellings),
    housingDeficitPercent: numberOrNull(properties.housing_deficit_percent),
    multidimensionalPovertyIndex: numberOrNull(properties.multidimensional_poverty_index),
    healthFacilities: numberOrNull(properties.health_facility_count),
    schools: numberOrNull(properties.school_site_count),
    updatedAt: typeof properties.data_updated_at === "string" ? properties.data_updated_at : null,
  };
}

const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): boolean => record(v) && typeof v.es === "string" && typeof v.en === "string";
const count = (v: unknown): boolean => typeof v === "number" && Number.isFinite(v) && v >= 0;
const date = (v: unknown): boolean => typeof v === "string" && Number.isFinite(Date.parse(v));
const list = (v: unknown, check: (item: unknown) => boolean): boolean => Array.isArray(v) && v.every(check);
const member = (v: unknown, options: string[]): boolean => typeof v === "string" && options.includes(v);

/** Reject malformed or cross-region data before it reaches the UI. */
export function parseAssessment(value: unknown, zoneId: string): TerritorialAssessment {
  if (!record(value) || value.zoneId !== zoneId || !member(value.mode, ["demo", "real"])
    || !text(value.source) || !count(value.population) || !count(value.homes) || !count(value.productiveHa)
    || !list(value.sectors, text) || !text(value.consequence) || !text(value.prevention)
    || !(value.assessedAt === null || date(value.assessedAt))
    || !list(value.infrastructure, (v) => record(v) && text(v.label) && count(v.count))
    || !record(value.vulnerability) || !member(value.vulnerability.status, ["unassessed", "assessed"]) || !list(value.vulnerability.factors, text)
    || !record(value.risk) || !member(value.risk.level, ["unassessed", "low", "moderate", "high"]) || !text(value.risk.method)
    || !list(value.historicalImpacts, (v) => record(v) && date(v.date) && text(v.description) && typeof v.source === "string")
    || (value.alerts !== undefined && !list(value.alerts, (v) => record(v) && typeof v.id === "string" && date(v.issuedAt) && date(v.expiresAt) && Date.parse(String(v.expiresAt)) > Date.parse(String(v.issuedAt)) && member(v.severity, ["info", "watch", "warning"]) && text(v.message) && text(v.action) && typeof v.source === "string"))
    || (value.forecast !== undefined && !(record(value.forecast) && member(value.forecast.status, ["unavailable", "experimental", "validated"]) && text(value.forecast.horizon) && typeof value.forecast.method === "string" && text(value.forecast.uncertainty) && text(value.forecast.summary)))) {
    throw new Error("Invalid territorial assessment");
  }
  return value as TerritorialAssessment;
}

export async function loadAssessment(zoneId: string, signal: AbortSignal): Promise<TerritorialAssessment | null> {
  const base = process.env.NEXT_PUBLIC_SAROS_API;
  // Sin backend no hay evaluación: no rellenar la interfaz con métricas sintéticas.
  if (!base) return null;
  const response = await fetch(`${base.replace(/\/$/, "")}/api/v1/regions/${encodeURIComponent(zoneId)}/assessment`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]), cache: "no-store",
  });
  if (response.status === 404 || response.status === 204) return null;
  if (!response.ok) throw new Error(`Assessment HTTP ${response.status}`);
  const payload: unknown = await response.json();
  return parseAssessment(payload, zoneId);
}
