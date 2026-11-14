import { demoAssessments, type TerritorialAssessment } from "./socioeconomic";

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
  if (!base) return demoAssessments.find((item) => item.zoneId === zoneId) ?? null;
  const response = await fetch(`${base.replace(/\/$/, "")}/api/v1/regions/${encodeURIComponent(zoneId)}/assessment`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(12000)]), cache: "no-store",
  });
  if (response.status === 404 || response.status === 204) return null;
  if (!response.ok) throw new Error(`Assessment HTTP ${response.status}`);
  const payload: unknown = await response.json();
  return parseAssessment(payload, zoneId);
}
