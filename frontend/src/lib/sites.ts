/**
 * Datos de los sitios monitoreados. Los archivos los genera pipeline/build_layers.py en public/data;
 * el modo "demo" son campos sintéticos con la forma de un producto NISAR, "real" viene de ASF.
 */

export type ChangeType = "deformation" | "backscatter" | "velocity";
export type Bbox = [number, number, number, number];

export type SiteStat = { label: string; value: string; unit: string; note: string };

export type SiteSummary = {
  id: string;
  name: string;
  place: string;
  lat: number;
  lon: number;
  bbox: Bbox;
  change: ChangeType;
  changeLabel: string;
  product: string;
  unit: string;
  story: string;
  pilot: boolean;
  mode: "demo" | "real";
  headline: SiteStat;
};

export type Legend = { colors: string[]; range: [number, number]; diverging: boolean };

export type SiteManifest = Omit<SiteSummary, "mode" | "headline"> & {
  metric: string;
  range: [number, number];
  colormap: string;
  dates: string[];
  layers: { date: string; url: string }[];
  changeLayer: { url: string; range: [number, number]; unit: string };
  legend: Legend;
  changeLegend: Legend;
  stats: SiteStat[];
  source: { mode: "demo" | "real"; product: string; granules: string[]; note: string };
  generated: string;
};

export type TimeSeries = {
  bbox: Bbox;
  rows: number;
  cols: number;
  dates: string[];
  unit: string;
  values: (number | null)[][];
};

const cache = new Map<string, Promise<unknown>>();
function getJson<T>(url: string): Promise<T> {
  if (!cache.has(url)) {
    cache.set(url, fetch(url).then((response) => {
      if (!response.ok) throw new Error(`${url}: ${response.status}`);
      return response.json();
    }));
  }
  return cache.get(url) as Promise<T>;
}

export const loadSites = () => getJson<{ sites: SiteSummary[] }>("/data/sites.json").then((data) => data.sites);
export const loadManifest = (id: string) => getJson<SiteManifest>(`/data/sites/${id}/manifest.json`);
export const loadTimeSeries = (id: string) => getJson<TimeSeries>(`/data/sites/${id}/timeseries.json`);

/** Valor de la rejilla más cercano a un punto (lon, lat) para cada fecha. */
export function seriesAt(series: TimeSeries, lon: number, lat: number) {
  const [west, south, east, north] = series.bbox;
  if (lon < west || lon > east || lat < south || lat > north) return null;
  const col = Math.round(((lon - west) / (east - west)) * (series.cols - 1));
  const row = Math.round(((north - lat) / (north - south)) * (series.rows - 1));
  const index = row * series.cols + col;
  return series.values.map((frame) => frame[index]);
}

/** Punto inicial del gráfico: mayor cambio entre la primera y la última fecha (o mayor velocidad). */
export function strongestChange(series: TimeSeries, change: ChangeType = "deformation") {
  const first = series.values[0];
  const last = series.values[series.values.length - 1];
  let best = -1;
  let bestIndex = 0;
  for (let i = 0; i < first.length; i++) {
    const a = first[i];
    const b = last[i];
    if (a === null || b === null) continue;
    // en velocidad interesa el punto más rápido; en el resto, el de mayor cambio
    const delta = change === "velocity" ? b : Math.abs(b - a);
    if (delta > best) {
      best = delta;
      bestIndex = i;
    }
  }
  const row = Math.floor(bestIndex / series.cols);
  const col = bestIndex % series.cols;
  const [west, south, east, north] = series.bbox;
  return {
    lon: west + (col / (series.cols - 1)) * (east - west),
    lat: north - (row / (series.rows - 1)) * (north - south),
  };
}

const MONTHS = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
export const shortDate = (iso: string) => `${iso.slice(8, 10)} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;
export const longDate = (iso: string) =>
  new Intl.DateTimeFormat("es-CO", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso));

export const formatCoord = (lat: number, lon: number) =>
  `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? "N" : "S"} · ${Math.abs(lon).toFixed(3)}° ${lon >= 0 ? "E" : "W"}`;

/** Explicación en lenguaje simple de qué ve el radar en cada tipo de cambio. */
export const radarExplainer: Record<ChangeType, { title: string; body: string; legendLow: string; legendHigh: string }> = {
  deformation: {
    title: "Interferometría (InSAR)",
    body: "El radar compara la fase de la señal entre dos pasadas. Si el suelo se aleja del satélite unos milímetros, la fase cambia. Sumando pares consecutivos se obtiene el desplazamiento acumulado.",
    legendLow: "Se aleja / se hunde",
    legendHigh: "Se acerca / se eleva",
  },
  backscatter: {
    title: "Retrodispersión",
    body: "Es cuánta energía del radar vuelve al satélite. El agua tranquila la refleja lejos y se ve oscura; el bosque la dispersa y se ve brillante. Una caída fuerte indica agua nueva o bosque talado.",
    legendLow: "Poca señal (agua, suelo desnudo)",
    legendHigh: "Mucha señal (vegetación, ciudad)",
  },
  velocity: {
    title: "Seguimiento de desplazamientos",
    body: "Se comparan pequeñas ventanas de la imagen entre dos pasadas para ver cuántos metros se movió la textura del hielo. Dividido por los días entre pasadas da la velocidad.",
    legendLow: "Lento",
    legendHigh: "Rápido",
  },
};
