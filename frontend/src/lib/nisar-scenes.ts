/**
 * Escenas NISAR reales guardadas en la base: marcos (pista/frame) con su huella y número de pasadas,
 * y series por fecha de las estadísticas de cada variable procesada en el servidor.
 * GET /api/v1/nisar/scenes (vía /api/nisar).
 */
export type NisarFrame = {
  aoi: string; track: string | null; frame: string | null; direction: string | null;
  footprint: [number, number][]; passes: number; first: string | null; last: string | null;
  products: string[]; maturity: string[]; granules: string[];
};
export type NisarAssetReference = {
  asset_id: number; granule: string; product: string; collection: string; maturity: string;
  track: string | null; frame: string | null; orbit_direction: string | null;
  date: string | null; reference_date: string | null; secondary_date: string | null;
  variable: string; band: number; units: string | null; storage_key: string | null;
  file_name: string; sha256: string; byte_size: number; width: number | null;
  height: number | null; crs: string | null; bounds: unknown;
  valid_pixel_count: number | null; valid_fraction: number | null;
  statistics: Record<string, number>; footprint: [number, number][] | null;
};
export type NisarPoint = {
  date: string | null; reference: string | null; mean: number | null; min: number | null;
  max: number | null; std: number | null; valid: number | null; granule: string;
  asset?: NisarAssetReference;
};
export type NisarSeries = { aoi: string; variable: string; product: string; units: string | null; points: NisarPoint[] };
export type NisarScenes = {
  summary: { scenes: number; rasters: number; frames: number; products: Record<string, number>; first: string | null; last: string | null; aois: string[] };
  frames: NisarFrame[];
  series: NisarSeries[];
  source?: string;
};

/** Clave del filtro «Qué ver en el mapa» para las huellas NISAR. */
export const NISAR_KIND = "nisar_scene";
export const NISAR_COLOR = "#5ef0ff";

/** Nombre corto y legible de una variable de NISAR (la ruta HDF5 completa es muy larga). */
export function variableLabel(path: string, es: boolean) {
  const last = path.split("/").filter(Boolean).pop() ?? path;
  const names: Record<string, [string, string]> = {
    unwrappedPhase: ["Fase desenrollada", "Unwrapped phase"],
    coherenceMagnitude: ["Coherencia", "Coherence"],
    ionospherePhaseScreen: ["Fase ionosférica", "Ionospheric phase"],
    connectedComponents: ["Componentes conectados", "Connected components"],
    HHHH: ["Retrodispersión HH", "HH backscatter"],
    HVHV: ["Retrodispersión HV", "HV backscatter"],
    VVVV: ["Retrodispersión VV", "VV backscatter"],
    VHVH: ["Retrodispersión VH", "VH backscatter"],
  };
  const pol = path.match(/\/(HH|HV|VH|VV)\//)?.[1];
  const name = names[last]?.[es ? 0 : 1] ?? last;
  return pol && !/HH|HV|VV|VH/.test(name) ? `${name} ${pol}` : name;
}

/** País de un marco por el centro de su huella (por ahora solo se distingue Colombia). */
export function frameCountry(frame: NisarFrame) {
  const lon = frame.footprint.reduce((s, p) => s + p[0], 0) / frame.footprint.length;
  const lat = frame.footprint.reduce((s, p) => s + p[1], 0) / frame.footprint.length;
  return lat > -4.5 && lat < 13.5 && lon > -80 && lon < -66.8 ? "CO" : null;
}

/** Aviso cuando llegan las escenas (detail: NisarScenes). */
export const NISAR_EVENT = "saros:nisar-scenes";

let request: Promise<NisarScenes | null> | null = null;
export function loadNisarScenes(): Promise<NisarScenes | null> {
  request ??= fetch("/api/nisar", { signal: AbortSignal.timeout(8000) })
    .then((r) => (r.ok ? r.json() : null))
    .then((d: NisarScenes | null) => (d && Array.isArray(d.frames) ? d : null))
    .catch(() => null);
  return request;
}
