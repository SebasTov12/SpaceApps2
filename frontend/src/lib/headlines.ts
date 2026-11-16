/** Titulares proporcionados exclusivamente por el backend: GET /api/v1/headlines. */
export type Severity = "alta" | "media" | "baja" | "info";

export type Headline = {
  id: string;
  kind: string;
  severity: Severity;
  title: { es: string; en: string };
  place?: { es: string; en: string };
  /** ISO 8601 */
  time: string;
  source: string;
  /** Conservado para compatibilidad con el cintillo; el backend decide si el dato es demo. */
  demo: boolean;
  siteId?: string;
};

function isHeadline(value: unknown): value is Headline {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<Headline>;
  const localized = (text: unknown) => typeof text === "object" && text !== null
    && typeof (text as { es?: unknown }).es === "string"
    && typeof (text as { en?: unknown }).en === "string";
  return typeof item.id === "string" && typeof item.kind === "string"
    && ["alta", "media", "baja", "info"].includes(item.severity ?? "")
    && localized(item.title) && (item.place === undefined || localized(item.place))
    && typeof item.time === "string" && Number.isFinite(Date.parse(item.time))
    && typeof item.source === "string" && typeof item.demo === "boolean";
}

async function fromApi(): Promise<Headline[]> {
  const base = process.env.NEXT_PUBLIC_SAROS_API;
  if (!base) return [];
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/api/v1/headlines`, { cache: "no-store" });
    if (!response.ok) return [];
    const data: unknown = await response.json();
    if (typeof data !== "object" || data === null || !Array.isArray((data as { headlines?: unknown }).headlines)) return [];
    return (data as { headlines: unknown[] }).headlines.filter(isHeadline)
      .sort((a, b) => b.time.localeCompare(a.time));
  } catch {
    return [];
  }
}

let cached: Promise<Headline[]> | null = null;
export function loadHeadlines(): Promise<Headline[]> {
  cached ??= fromApi();
  return cached;
}
