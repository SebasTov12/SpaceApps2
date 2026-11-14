import type { DashboardMetric, ObservationPoint } from "@/types/territory";

/** Temporary presentation data. Replace with API responses when the backend is ready. */
export const demoMetrics: DashboardMetric[] = [
  { id: "observed-changes", label: "ZONAS CON CAMBIO OBSERVADO", value: "12", unit: "puntos", context: "+3", accent: "cyan" },
  { id: "area", label: "ÁREA ANALIZADA", value: "48.2", unit: "km²", context: "Área demo", accent: "violet" },
  { id: "population", label: "POBLACIÓN EN EL ÁREA", value: "8,420", unit: "personas", context: "Estimación demo", accent: "amber" },
];

export const demoObservations: ObservationPoint[] = [
  { id: "obs-01", date: "2026-06-17", label: "17 JUN", value: 3.1, unit: "mm / periodo demo", source: "NISAR · demo", isDemo: true },
  { id: "obs-02", date: "2026-07-03", label: "03 JUL", value: 4.6, unit: "mm / periodo demo", source: "NISAR · demo", isDemo: true },
  { id: "obs-03", date: "2026-07-19", label: "19 JUL", value: 5.2, unit: "mm / periodo demo", source: "NISAR · demo", isDemo: true },
  { id: "obs-04", date: "2026-08-04", label: "04 AGO", value: 8.4, unit: "mm / periodo demo", source: "NISAR · demo", isDemo: true },
  { id: "obs-05", date: "2026-08-20", label: "20 AGO", value: 7.3, unit: "mm / periodo demo", source: "NISAR · demo", isDemo: true },
  { id: "obs-06", date: "2026-09-05", label: "05 SEP", value: 9.1, unit: "mm / periodo demo", source: "NISAR · demo", isDemo: true },
];
