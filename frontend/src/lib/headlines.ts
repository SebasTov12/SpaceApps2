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
    const response = await fetch(`${base.replace(/\/$/, "")}/api/v1/headlines`, { cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as { headlines?: Headline[] };
    return data.headlines?.length ? data.headlines : null;
  } catch {
    return null;
  }
}

async function fromStaticData(): Promise<Headline[]> {
  const [sites, availability] = await Promise.all([loadSites(), loadAvailability().catch(() => null)]);
  const items: Headline[] = [];

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

  return items.sort((a, b) => b.time.localeCompare(a.time));
}

let cached: Promise<Headline[]> | null = null;
export function loadHeadlines() {
  cached ??= fromApi().then((api) => api ?? fromStaticData());
  return cached;
}
