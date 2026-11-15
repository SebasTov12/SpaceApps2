/**
 * «Zona viva»: datos de la animación 3D de cada zona.
 *
 * Todo sale de lo que entrega el backend para la zona (o el pipeline mientras no esté enlazado):
 *  - manifest.json   → tipo de cambio (deformation | backscatter | velocity), unidad, fechas y evaluación
 *  - timeseries.json → rejilla rows×cols con el valor medido en cada pase de NISAR
 * Si la zona aún no tiene datos procesados, la escena es una ilustración y así se indica.
 */
import type { RiskKind, RiskZone } from "@/lib/risk-zones";
import type { Bbox, ChangeType, SiteManifest, TimeSeries } from "@/lib/sites";

export type LiveInput = {
  kind: RiskKind;
  /** Hay datos NISAR (reales o con el formato del producto) para animar el terreno. */
  measured: boolean;
  /** Los datos son de demostración con formato NISAR (no observaciones reales). */
  demo: boolean;
  change: ChangeType | null;
  unit: string;
  bbox: Bbox;
  rows: number;
  cols: number;
  dates: string[];
  /** Un campo por fecha (fila a fila, de norte a sur); null = sin dato. */
  frames: Float32Array[];
  /** Máscara: 1 si la celda tiene dato en todas las fechas. */
  valid: Uint8Array;
  /** Factor para proyectar el último campo a +90 días (solo deformación con evaluación). */
  projection: number | null;
  hotspots: { lat: number; lon: number; value: number }[];
  center: { lat: number; lon: number };
  /** Metros por unidad del dato (deformación); 1 para dB y m/día. */
  toMeters: number;
  /** Área de una celda en hectáreas. */
  cellHa: number;
};

const METERS: Record<string, number> = { mm: 0.001, cm: 0.01, m: 1 };
/** Umbrales de la señal del radar (dB, polarización cruzada): bosque, suelo desnudo y agua. */
export const DB = { forest: -12, water: -18, loss: 3 };

const metersPerDegLat = 111_320;

export function bboxSize([west, south, east, north]: Bbox) {
  const lat = (south + north) / 2;
  return { width: (east - west) * metersPerDegLat * Math.cos((lat * Math.PI) / 180), height: (north - south) * metersPerDegLat };
}

/** Arma la entrada de la escena con los datos de la zona (o una ilustración si no los hay). */
export function buildLive(zone: RiskZone, manifest: SiteManifest | null, series: TimeSeries | null): LiveInput {
  const measured = !!(manifest && series && series.values.length > 1 && series.rows > 1 && series.cols > 1);
  if (!measured || !manifest || !series) {
    const bbox: Bbox = [zone.lon - 0.05, zone.lat - 0.04, zone.lon + 0.05, zone.lat + 0.04];
    const { width, height } = bboxSize(bbox);
    return {
      kind: zone.kind, measured: false, demo: false, change: null, unit: "", bbox, rows: 0, cols: 0, dates: [], frames: [], valid: new Uint8Array(0),
      projection: null, hotspots: [], center: { lat: zone.lat, lon: zone.lon }, toMeters: 1, cellHa: (width * height) / 10_000,
    };
  }
  const n = series.rows * series.cols;
  const frames = series.values.map((frame) => {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = frame[i] ?? Number.NaN;
    return out;
  });
  const valid = new Uint8Array(n);
  for (let i = 0; i < n; i++) valid[i] = frames.every((f) => Number.isFinite(f[i])) ? 1 : 0;
  const a = manifest.assessment;
  const projection = manifest.change === "deformation" && a && Math.abs(a.current) > 1e-6 ? a.projection.d90 / a.current : null;
  const { width, height } = bboxSize(series.bbox);
  return {
    kind: zone.kind,
    measured: true,
    demo: manifest.source?.mode !== "real",
    change: manifest.change,
    unit: series.unit || manifest.unit,
    bbox: series.bbox,
    rows: series.rows,
    cols: series.cols,
    dates: series.dates,
    frames,
    valid,
    projection: projection && Number.isFinite(projection) && projection > 0 ? Math.min(projection, 4) : null,
    hotspots: a?.hotspots ?? [],
    center: { lat: manifest.lat, lon: manifest.lon },
    toMeters: METERS[series.unit] ?? METERS[manifest.unit] ?? 1,
    cellHa: (width / series.cols) * (height / series.rows) / 10_000,
  };
}

/** Último instante de la línea de tiempo: la última fecha, o una más si hay proyección a 90 días. */
export const endOf = (input: LiveInput) => (input.measured ? input.frames.length - 1 + (input.projection ? 1 : 0) : 1);
export const isProjected = (input: LiveInput, t: number) => input.measured && t > input.frames.length - 1 + 1e-6;

/** Campo en el instante t (fracción entre pases); más allá de la última fecha, la proyección. */
export function fieldAt(input: LiveInput, t: number, out?: Float32Array) {
  const n = input.rows * input.cols;
  const field = out ?? new Float32Array(n);
  const last = input.frames.length - 1;
  if (t > last && input.projection) {
    const k = 1 + (input.projection - 1) * Math.min(1, t - last);
    const f = input.frames[last];
    for (let i = 0; i < n; i++) field[i] = f[i] * k;
    return field;
  }
  const clamped = Math.max(0, Math.min(last, t));
  const i0 = Math.floor(clamped);
  const i1 = Math.min(last, i0 + 1);
  const w = clamped - i0;
  const a = input.frames[i0];
  const b = input.frames[i1];
  for (let i = 0; i < n; i++) field[i] = a[i] + (b[i] - a[i]) * w;
  return field;
}

/** Valor del campo en una posición (lon, lat) con interpolación bilineal. */
export function sampleField(input: LiveInput, field: Float32Array, lon: number, lat: number) {
  const [west, south, east, north] = input.bbox;
  const x = ((lon - west) / (east - west)) * (input.cols - 1);
  const y = ((north - lat) / (north - south)) * (input.rows - 1);
  if (x < 0 || y < 0 || x > input.cols - 1 || y > input.rows - 1) return Number.NaN;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(input.cols - 1, x0 + 1), y1 = Math.min(input.rows - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;
  const v00 = field[y0 * input.cols + x0], v10 = field[y0 * input.cols + x1];
  const v01 = field[y1 * input.cols + x0], v11 = field[y1 * input.cols + x1];
  return (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy;
}

/** Mayor magnitud que alcanza el dato en toda la serie (para escalar la animación). */
export function peakOf(input: LiveInput) {
  let peak = 0;
  const frames = input.projection ? [...input.frames, fieldAt(input, input.frames.length)] : input.frames;
  for (const f of frames) for (let i = 0; i < f.length; i++) if (input.valid[i]) peak = Math.max(peak, Math.abs(f[i]));
  return peak;
}

/** Celda con el mayor cambio entre la primera y la última fecha. */
export function strongestCell(input: LiveInput) {
  const first = input.frames[0];
  const last = input.frames[input.frames.length - 1];
  let best = -1;
  let index = 0;
  for (let i = 0; i < first.length; i++) {
    if (!input.valid[i]) continue;
    const d = input.change === "velocity" ? last[i] : Math.abs(last[i] - first[i]);
    if (d > best) { best = d; index = i; }
  }
  const [west, south, east, north] = input.bbox;
  const row = Math.floor(index / input.cols), col = index % input.cols;
  return { index, lon: west + ((col + 0.5) / input.cols) * (east - west), lat: north - ((row + 0.5) / input.rows) * (north - south) };
}

export type Readout = { label: { es: string; en: string }; value: string };

const fmt = (v: number, digits = 1) => v.toLocaleString("es-CO", { maximumFractionDigits: digits, minimumFractionDigits: 0 });

/** Lo que se lee bajo la línea de tiempo en el instante t (con los datos medidos). */
export function readoutAt(input: LiveInput, t: number, strongest: number): Readout | null {
  if (!input.measured) return null;
  const field = fieldAt(input, t);
  const first = input.frames[0];
  if (input.change === "deformation") {
    const v = field[strongest];
    return { label: { es: "Desplazamiento en el punto más activo", en: "Displacement at the most active point" }, value: `${v > 0 ? "+" : ""}${fmt(v)} ${input.unit}` };
  }
  if (input.change === "velocity") {
    let max = 0;
    for (let i = 0; i < field.length; i++) if (input.valid[i]) max = Math.max(max, field[i]);
    return { label: { es: "Velocidad máxima del hielo", en: "Peak ice speed" }, value: `${fmt(max)} ${input.unit}` };
  }
  // señal del radar (dB): bosque perdido, agua nueva o área inundada
  let lost = 0, water = 0, newWater = 0;
  for (let i = 0; i < field.length; i++) {
    if (!input.valid[i]) continue;
    if (first[i] > DB.forest && field[i] < first[i] - DB.loss) lost++;
    if (field[i] < DB.water) {
      water++;
      if (first[i] >= DB.water) newWater++;
    }
  }
  const ha = (cells: number) => `${fmt(cells * input.cellHa, 0)} ha`;
  if (input.kind === "flood") return { label: { es: "Área bajo agua", en: "Area under water" }, value: ha(water) };
  if (input.kind === "mining") return { label: { es: "Bosque abierto · agua nueva (piscinas)", en: "Forest cleared · new water (pits)" }, value: `${ha(lost)} · ${ha(newWater)}` };
  return { label: { es: "Bosque perdido desde el primer pase", en: "Forest lost since the first pass" }, value: ha(lost) };
}
