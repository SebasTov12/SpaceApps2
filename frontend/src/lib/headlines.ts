/**
 * Titulares del cintillo. Contrato pensado para el backend (GET /api/v1/headlines):
 *
 *   { "headlines": Headline[] }   ordenados del más reciente al más antiguo
 *
 * Si NEXT_PUBLIC_SAROS_API está definida se piden ahí; si no (o falla), se construyen con los
 * datos estáticos del repo: escenas NISAR reales publicadas en ASF (availability.json) y las
 * cifras de cada sitio (manifest.json, marcadas como demo).
 */
import { riskZones } from "@/lib/risk-zones";
import { loadAvailability, loadManifest, loadSites } from "@/lib/sites";
import { loadHazardPoints, hazardPointId, type HazardPoint, type HazardPoints } from "@/lib/hazard-points";

export type Severity = "alta" | "media" | "baja" | "info";

export type Headline = {
  id: string;
  /** Tipo de evento: deformation, flood, glacier, deforestation, data… */
  kind: string;
  severity: Severity;
  title: { es: string; en: string };
  place?: { es: string; en: string };
  /** ISO 8601 */
  time: string;
  source: string;
  /** true si la cifra es sintética */
  demo: boolean;
  /** sitio del explorador relacionado */
  siteId?: string;
  /** Identificador del grupo de registros real que abre directamente en el mapa. */
  hazardPointId?: string;
};

const MONTHS_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const d = (iso: string, lang: "es" | "en") => {
  const month = Number(iso.slice(5, 7)) - 1;
  return lang === "es" ? `${Number(iso.slice(8, 10))} ${MONTHS_ES[month]}` : `${MONTHS_EN[month]} ${Number(iso.slice(8, 10))}`;
};

async function fromApi(): Promise<Headline[] | null> {
  const base = process.env.NEXT_PUBLIC_SAROS_API;
  if (!base) return null;
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/api/v1/headlines`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const data = (await response.json()) as { headlines?: (Partial<Headline> & { id?: string; kind?: string; severity?: string; title?: Headline["title"] | string; place?: Headline["place"] | string; time?: string; source?: string; demo?: boolean; site_id?: string; hazard_point_id?: string })[] };
    if (!Array.isArray(data.headlines)) return null;
    return data.headlines.flatMap((raw, index) => {
      const title = typeof raw.title === "string" ? { es: raw.title, en: raw.title } : raw.title;
      if (!title || typeof raw.time !== "string" || !raw.time) return [];
      const place = typeof raw.place === "string" ? { es: raw.place, en: raw.place } : raw.place;
      const severity = raw.severity === "alta" || raw.severity === "media" || raw.severity === "baja" ? raw.severity : "info";
      return [{
        id: raw.id || `api-${index}-${raw.time}`,
        kind: raw.kind || "data",
        severity,
        title: { es: title.es || title.en || "", en: title.en || title.es || "" },
        place: place ? { es: place.es || place.en || "", en: place.en || place.es || "" } : undefined,
        time: raw.time,
        source: raw.source || "SAROS",
        demo: raw.demo === true,
        siteId: raw.siteId ?? raw.site_id,
        hazardPointId: raw.hazardPointId ?? raw.hazard_point_id,
      }];
    });
  } catch {
    return null;
  }
}

function fromHazardPoints(hazardData: HazardPoints | null): Headline[] {
  return (hazardData?.points ?? [])
    .filter((point) => point.kind !== "model_assessment" && Number.isFinite(point.lat) && Number.isFinite(point.lon) && Number.isFinite(point.n))
    .flatMap((point) => {
      const time = point.last ?? point.first;
      if (!time) return [];
      const count = point.n.toLocaleString("es-CO");
      const type = point.type || point.kind;
      return [{
        id: `hazard-${hazardPointId(point)}`, hazardPointId: hazardPointId(point), kind: point.kind,
        severity: point.priority === "P1" ? "alta" as const : point.priority === "P2" ? "media" as const : "info" as const,
        title: { es: `${type}: ${count} registros · ${time}`, en: `${type}: ${point.n.toLocaleString("en-US")} records · ${time}` },
        place: { es: point.place, en: point.place }, time, source: point.sources?.[0] ?? "Backend", demo: false,
      }];
    })
    .sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
}

const foldPlace = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Une titulares del backend a una ubicación real cuando ambos señalan el mismo lugar. */
function linkApiHeadline(item: Headline, points: HazardPoint[]): Headline {
  if (item.hazardPointId && points.some((point) => hazardPointId(point) === item.hazardPointId)) return item;
  const locations = [item.place?.es, item.place?.en].filter((value): value is string => Boolean(value)).map(foldPlace);
  if (!locations.length) return item;
  const day = item.time.slice(0, 10);
  const title = foldPlace(`${item.title.es} ${item.title.en}`);
  const candidates = points.flatMap((point) => {
    if (point.kind === "model_assessment") return [];
    const place = foldPlace(point.place);
    if (!place) return [];
    const exact = locations.includes(place);
    const contained = locations.some((location) => location.length >= 5 && (location.includes(place) || place.includes(location)));
    const inTitle = title.includes(place);
    if (!exact && !contained && !inTitle) return [];
    const dateMatch = point.last === day || point.first === day;
    const kindMatch = foldPlace(`${point.kind} ${point.type}`).split(" ").some((word) => word.length > 3 && title.includes(word));
    return [{ point, score: (exact ? 100 : contained ? 60 : 35) + (dateMatch ? 25 : 0) + (kindMatch ? 8 : 0) }];
  }).sort((a, b) => b.score - a.score || Date.parse(b.point.last ?? b.point.first ?? "") - Date.parse(a.point.last ?? a.point.first ?? ""));
  const match = candidates[0]?.point;
  return match ? { ...item, hazardPointId: hazardPointId(match) } : { ...item, hazardPointId: undefined };
}

export function resolveHeadlineHazard(item: Headline, points: HazardPoint[]): HazardPoint | null {
  if (item.hazardPointId) {
    const exact = points.find((point) => hazardPointId(point) === item.hazardPointId);
    if (exact) return exact;
  }
  const linked = linkApiHeadline(item, points);
  return linked.hazardPointId ? points.find((point) => hazardPointId(point) === linked.hazardPointId) ?? null : null;
}

async function fromStaticData(hazardData: HazardPoints | null): Promise<Headline[]> {
  const [sites, availability] = await Promise.all([loadSites(), loadAvailability().catch(() => null)]);
  const items: Headline[] = [];

  items.push(...fromHazardPoints(hazardData));

  // Datos reales: escenas NISAR publicadas por ASF para cada sitio
  for (const site of availability?.sites ?? []) {
    const summary = sites.find((s) => s.id === site.id);
    if (!summary) continue;
    for (const m of site.maturities) {
      if (!m.count || !m.first || !m.last) continue;
      items.push({
        id: `asf-${site.id}-${m.maturity}`,
        kind: "data",
        severity: "info",
        title: {
          es: `NISAR publica ${m.count} escenas L2 ${site.product} ${m.maturity} (${d(m.first, "es")} – ${d(m.last, "es")})`,
          en: `NISAR releases ${m.count} L2 ${site.product} ${m.maturity} scenes (${d(m.first, "en")} – ${d(m.last, "en")})`,
        },
        place: { es: summary.place, en: summary.en?.place ?? summary.place },
        time: m.last,
        source: "NASA CMR · ASF DAAC",
        demo: false,
        siteId: site.id,
      });
    }
  }

  // Cifras de los sitios del explorador (sintéticas mientras no se procesen escenas reales)
  const manifests = await Promise.all(sites.map((s) => loadManifest(s.id).catch(() => null)));
  for (const m of manifests) {
    if (!m) continue;
    const stat = m.stats[0];
    const severity: Severity = m.change === "deformation" ? "alta" : m.change === "backscatter" ? "media" : "baja";
    items.push({
      id: `site-${m.id}`,
      kind: m.change,
      severity,
      title: {
        es: `${m.changeLabel}: ${stat.label.toLowerCase()} ${stat.value} ${stat.unit}`,
        en: `${m.en?.changeLabel ?? m.changeLabel}: ${(stat.labelEn ?? stat.label).toLowerCase()} ${stat.value} ${stat.unitEn ?? stat.unit}`,
      },
      place: { es: m.place, en: m.en?.place ?? m.place },
      time: m.dates[m.dates.length - 1],
      source: m.source.product,
      demo: m.source.mode !== "real",
      siteId: m.id,
    });
  }

  // Alertas de prevención (nivel de atención calculado de la tendencia; no son alertas oficiales)
  for (const m of manifests) {
    const a = m?.assessment;
    if (!m || !a || a.level === "baja") continue;
    const name = { es: m.changeLabel, en: m.en?.changeLabel ?? m.changeLabel };
    items.push({
      id: `alert-${m.id}`,
      kind: m.change,
      severity: a.level === "alta" ? "alta" : "media",
      title: a.accelerating
        ? { es: `Movimiento acelerado detectado · ${name.es}: ${Math.abs(a.rate.recent)} ${a.rate.unit}`, en: `Accelerating movement detected · ${name.en}: ${Math.abs(a.rate.recent)} ${a.rate.unitEn}` }
        : { es: `${a.level === "alta" ? "Atención alta" : "Atención moderada"} · ${name.es}: ${Math.abs(a.rate.recent)} ${a.rate.unit}`, en: `${a.level === "alta" ? "High attention" : "Moderate attention"} · ${name.en}: ${Math.abs(a.rate.recent)} ${a.rate.unitEn}` },
      place: { es: m.place, en: m.en?.place ?? m.place },
      time: m.dates[m.dates.length - 1] + "T12:00:00Z",
      source: "SAROS · tendencia",
      demo: m.source.mode !== "real",
      siteId: m.id,
    });
  }

  // Vigilancia ambiental: huellas de extracción (cambio sospechoso, sin atribuir responsables)
  for (const m of manifests) {
    const x = m?.extraction;
    if (!m || !x) continue;
    const mining = x.kind === "mining";
    items.push({
      id: `watch-${m.id}`,
      kind: m.change,
      severity: x.confidence === "alta" || m.assessment?.level === "alta" ? "alta" : "media",
      title: mining
        ? { es: `Cambio sospechoso · ${x.pits} piscinas nuevas junto al río y ${x.recentHa} ha intervenidas en 30 días`, en: `Suspicious change · ${x.pits} new ponds by the river and ${x.recentHa} ha disturbed in 30 days` }
        : { es: `Cambio sospechoso · ${x.recentHa} ha de bosque perdidas en 30 días`, en: `Suspicious change · ${x.recentHa} ha of forest lost in 30 days` },
      place: { es: m.place, en: m.en?.place ?? m.place },
      time: m.dates[m.dates.length - 1] + "T13:00:00Z",
      source: "SAROS · vigilancia ambiental",
      demo: m.source.mode !== "real",
      siteId: m.id,
    });
  }

  // Referencias: qué pasó y dónde (hechos documentados)
  for (const zone of riskZones) {
    if (!zone.event) continue;
    items.push({
      id: `event-${zone.id}`,
      kind: zone.kind,
      severity: "info",
      title: { es: `${zone.event.date.slice(0, 4)} · ${zone.event.es}`, en: `${zone.event.date.slice(0, 4)} · ${zone.event.en}` },
      place: zone.place,
      time: zone.event.date,
      source: "Referencia histórica",
      demo: false,
      siteId: zone.id,
    });
  }

  items.push({
    id: "watch",
    kind: "data",
    severity: "info",
    title: { es: `${riskZones.length} zonas de riesgo bajo vigilancia satelital`, en: `${riskZones.length} risk zones under satellite watch` },
    time: availability?.checked ?? new Date().toISOString(),
    source: "SAROS",
    demo: false,
  });

  const latest = (a: Headline, b: Headline) => Date.parse(b.time) - Date.parse(a.time);
  const realHazards = items.filter((item) => item.hazardPointId).sort(latest);
  const otherReal = items.filter((item) => !item.hazardPointId && !item.demo).sort(latest);
  const simulated = items.filter((item) => item.demo).sort(latest);
  return [...realHazards, ...otherReal, ...simulated];
}

/** Respaldo mínimo con referencias históricas si también faltan los archivos estáticos. */
function fromCuratedZones(): Headline[] {
  return riskZones.flatMap((zone) => zone.event ? [{
    id: `event-${zone.id}`,
    kind: zone.kind,
    severity: "info" as const,
    title: { es: `${zone.event.date.slice(0, 4)} · ${zone.event.es}`, en: `${zone.event.date.slice(0, 4)} · ${zone.event.en}` },
    place: zone.place,
    time: zone.event.date,
    source: "Referencia histórica",
    demo: false,
    siteId: zone.id,
  }] : []).sort((a, b) => b.time.localeCompare(a.time));
}

async function fallbackHeadlines(): Promise<Headline[]> {
  try {
    const items = await fromStaticData(await loadHazardPoints());
    if (items.length) return items;
  } catch {
    // Mantener el cintillo útil incluso si no se pueden leer los manifiestos locales.
  }
  return fromCuratedZones();
}

let cached: Promise<Headline[]> | null = null;
let cachedAt = 0;
const HEADLINES_TTL = 60_000;
export function loadHeadlines() {
  if (!cached || Date.now() - cachedAt >= HEADLINES_TTL) {
    cachedAt = Date.now();
    cached = Promise.all([loadHazardPoints(), fromApi()]).then(async ([hazardData, api]) => {
      const points = hazardData?.points ?? [];
      const linkedApi = (api ?? [])
        .map((item) => linkApiHeadline(item, points))
        // Evita titulares del backend sin lugar/registro que no se pueden abrir desde el mapa.
        .filter((item) => item.hazardPointId || item.siteId);
      const staticItems = await fromStaticData(hazardData).catch(() => []);
      const latestHazards = fromHazardPoints(hazardData).slice(0, 12);
      const hazardIds = new Set(latestHazards.map((item) => item.hazardPointId));
      const apiUnique = linkedApi.filter((item) => !item.hazardPointId || !hazardIds.has(item.hazardPointId));
      const staticExtras = staticItems.filter((item) => !item.hazardPointId);
      const actual = [...latestHazards, ...apiUnique].sort((a, b) => Date.parse(b.time) - Date.parse(a.time)).slice(0, 18);
      const realExtras = staticExtras.filter((item) => !item.demo).slice(0, 6);
      const simulated = staticExtras.filter((item) => item.demo).slice(0, 6);
      return [...actual, ...realExtras, ...simulated];
    }).catch(() => fallbackHeadlines());
  }
  return cached;
}
