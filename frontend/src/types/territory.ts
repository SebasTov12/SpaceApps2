export type DashboardMetric = {
  id: string;
  label: string;
  value: string;
  unit: string;
  context: string;
  accent: "cyan" | "violet" | "amber";
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
