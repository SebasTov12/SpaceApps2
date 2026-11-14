export type DashboardMetric = {
  id: string;
  label: string;
  value: string;
  unit: string;
  context: string;
  accent: "cyan" | "violet" | "amber";
};

/** Bloque del resumen para decisión (doc 06): qué cambió, exposición, economía y acción. */
export type DecisionInsight = {
  id: "change" | "social" | "economic" | "action";
  eyebrow: string;
  title: string;
  points: string[];
  source: string;
  limitation: string;
};

export type ObservationPoint = {
  id: string;
  date: string;
  label: string;
  value: number;
  unit: string;
  source: string;
  isDemo: boolean;
};
