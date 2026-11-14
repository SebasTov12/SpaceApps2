/**
 * Datos de los sitios monitoreados. Los archivos los genera pipeline/build_layers.py en public/data;
 * el modo "demo" son campos sintéticos con la forma de un producto NISAR, "real" viene de ASF.
 */

export type ChangeType = "deformation" | "backscatter" | "velocity";
export type Bbox = [number, number, number, number];

export type SiteStat = { label: string; labelEn?: string; value: string; unit: string; unitEn?: string; note: string; noteEn?: string };

/** Textos del sitio en inglés (los de la raíz están en español). */
export type SiteEnglish = { name: string; place: string; changeLabel: string; metric?: string; story: string; unit?: string };

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
  en?: SiteEnglish;
  country?: string;
  level?: AttentionLevel;
  accelerating?: boolean;
  mode: "demo" | "real";
  headline: SiteStat;
};

export type Legend = { colors: string[]; range: [number, number]; diverging: boolean };

export type AttentionLevel = "baja" | "moderada" | "alta";

/** Evaluación para prevención calculada en el pipeline (o por el backend). No es una probabilidad. */
export type Assessment = {
  level: AttentionLevel;
  rate: { recent: number; early: number; unit: string; unitEn: string };
  accelerating: boolean;
  current: number;
  projection: { d30: number; d90: number; unit: string };
  hotspots: { lat: number; lon: number; value: number }[];
  basis: string;
  basisEn: string;
};

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
  source: { mode: "demo" | "real"; product: string; granules: string[]; note: string; noteEn?: string };
  assessment?: Assessment;
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

const MONTHS = {
  es: ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"],
  en: ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"],
};
export const shortDate = (iso: string, lang: "es" | "en" = "es") => `${iso.slice(8, 10)} ${MONTHS[lang][Number(iso.slice(5, 7)) - 1]}`;
export const longDate = (iso: string, lang: "es" | "en" = "es") =>
  new Intl.DateTimeFormat(lang === "en" ? "en-US" : "es-CO", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso));

export const formatCoord = (lat: number, lon: number) =>
  `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? "N" : "S"} · ${Math.abs(lon).toFixed(3)}° ${lon >= 0 ? "E" : "W"}`;

type Explainer = { title: string; body: string; legendLow: string; legendHigh: string };

/** Explicación en lenguaje simple de qué ve el radar en cada tipo de cambio. */
export const radarExplainer: Record<"es" | "en", Record<ChangeType, Explainer>> = {
  es: {
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
  },
  en: {
    deformation: {
      title: "Interferometry (InSAR)",
      body: "The radar compares the signal phase between two passes. If the ground moves a few millimetres away from the satellite, the phase shifts. Adding consecutive pairs gives the cumulative displacement.",
      legendLow: "Moving away / sinking",
      legendHigh: "Moving closer / rising",
    },
    backscatter: {
      title: "Backscatter",
      body: "How much radar energy bounces back to the satellite. Calm water reflects it away and looks dark; forests scatter it and look bright. A sharp drop means new water or cleared forest.",
      legendLow: "Low signal (water, bare soil)",
      legendHigh: "High signal (vegetation, city)",
    },
    velocity: {
      title: "Offset tracking",
      body: "Small image windows are matched between two passes to see how many metres the ice texture moved. Dividing by the days between passes gives the speed.",
      legendLow: "Slow",
      legendHigh: "Fast",
    },
  },
};

/** Escenas NISAR publicadas en ASF para cada sitio (pipeline/search_nisar.py, catálogo CMR). */
export type Availability = {
  checked: string;
  source: string;
  sites: {
    id: string;
    product: string;
    total: number;
    maturities: { maturity: string; shortName: string; count: number; first: string | null; last: string | null }[];
    latest: string | null;
  }[];
};
export const loadAvailability = () => getJson<Availability>("/data/availability.json");
