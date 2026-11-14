import type { DashboardMetric, DecisionInsight, ObservationPoint } from "@/types/territory";

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

/** Resumen para decisión. Contenido ilustrativo: ninguna cifra procede de datos reales. */
export const demoInsights: DecisionInsight[] = [
  {
    id: "change",
    eyebrow: "QUÉ CAMBIÓ",
    title: "Desplazamiento en la ladera norte",
    points: [
      "Señal acumulada de +8.4 mm entre junio y agosto.",
      "El cambio se concentra en 2 de los 12 puntos observados.",
      "Coincide con la temporada de lluvias de la serie demo.",
    ],
    source: "NISAR · demo",
    limitation: "Sin validar en campo",
  },
  {
    id: "social",
    eyebrow: "QUIÉN PODRÍA ESTAR EXPUESTO",
    title: "Viviendas y servicios cercanos",
    points: [
      "≈ 8,420 personas viven en el área analizada.",
      "2 escuelas y 1 puesto de salud a menos de 1 km.",
      "1 vía secundaria conecta 3 veredas con la cabecera.",
    ],
    source: "Censo y cartografía · demo",
    limitation: "Exposición, no daño confirmado",
  },
  {
    id: "economic",
    eyebrow: "ACTIVIDAD ECONÓMICA",
    title: "Cultivos y acceso a mercados",
    points: [
      "Café y cacao en la cuenca alta.",
      "La vía expuesta es la salida de productos al mercado municipal.",
      "Dependencia alta de una sola ruta de transporte.",
    ],
    source: "Uso del suelo · demo",
    limitation: "Sin estimación monetaria",
  },
  {
    id: "action",
    eyebrow: "ACCIÓN PREVENTIVA SUGERIDA",
    title: "Inspección técnica de la ladera",
    points: [
      "Visita de evaluación geotécnica en la ladera norte.",
      "Verificar drenajes de la vía secundaria.",
      "Identificar puntos de encuentro con la comunidad.",
    ],
    source: "Reglas de priorización v0 · demo",
    limitation: "Propuesta, no decisión de autoridad",
  },
];
