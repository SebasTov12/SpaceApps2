import type { Metadata } from "next";
import "./operations.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "SAROS | Data & Validation",
  description: "Live SAROS source coverage, historical validation metrics, and forecast readiness.",
};

type ImpactMetric = {
  status: string;
  train_period?: string;
  holdout_period?: string;
  train_n?: number;
  holdout_n?: number;
  model_mae?: number;
  global_mean_baseline_mae?: number;
  improvement_vs_baseline_percent?: number | null;
  unit?: string;
};

type OperationsReport = {
  generated_at?: string;
  snapshot_saved_at?: string;
  persisted?: boolean;
  service?: { api: string; composite_model: boolean };
  nisar?: {
    catalog_assets: number;
    gunw_granules: number;
    raster_assets: number;
    real_los_observations: number;
    latest_los_date: string | null;
    forecast_runs: number;
    forecast_status: string;
  };
  historical_impact_backtest?: { method: string; metrics: Record<string, ImpactMetric>; interpretation: string };
  latest_exploratory_assessment?: {
    model_version: string;
    municipality: string;
    department: string;
    changed_fraction: number;
    relative_priority_score: number;
    priority: string;
    data_mode: string;
    created_at: string;
  } | null;
  limitations?: string[];
};

async function loadReport(): Promise<OperationsReport | null> {
  const base = process.env.SAROS_INTERNAL_API_URL ?? "http://spaceapps2-api:8000";
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/api/v1/operations/report`, { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json() as OperationsReport;
  } catch {
    return null;
  }
}

const labels: Record<string, string> = {
  affected_families: "Affected families",
  affected_people: "Affected people",
  homes_damaged: "Homes damaged",
  homes_destroyed: "Homes destroyed",
};

function number(value: number | undefined, digits = 2) {
  return value == null ? "—" : new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);
}

export default async function OperationsPage() {
  const report = await loadReport();
  const metrics = report?.historical_impact_backtest?.metrics ?? {};
  const assessment = report?.latest_exploratory_assessment;
  const generatedAt = report?.snapshot_saved_at ?? report?.generated_at;

  return <main lang="en" className="operations-page">
    <header className="operations-header">
      <a href="/" aria-label="SAROS home">← SAROS</a>
      <span>NASA SPACE APPS 2026 · SYSTEM TRANSPARENCY</span>
    </header>
    <section className="operations-intro">
      <p className="operations-eyebrow">DATA · METHOD · STATUS</p>
      <h1>What SAROS can measure today</h1>
      <p>Operational data coverage and reproducible historical impact scores, with model limits shown next to the results.</p>
      {generatedAt && <small>{report?.persisted ? "Last automated snapshot" : "Report generated"}: {new Date(generatedAt).toISOString().replace("T", " ").slice(0, 16)} UTC</small>}
    </section>

    {!report ? <section className="operations-card" role="status"><h2>Report unavailable</h2><p>The API could not provide the production report. Retry after the next scheduled refresh.</p></section> : <>
      <section className="operations-grid" aria-label="Production readiness">
        <article className="operations-card"><span>API</span><strong>{report.service?.api === "ready" ? "Connected" : "Unknown"}</strong></article>
        <article className="operations-card"><span>Composite model</span><strong>{report.service?.composite_model ? "Available" : "Unavailable"}</strong></article>
        <article className="operations-card"><span>Catalog granules</span><strong>{number(report.nisar?.catalog_assets, 0)}</strong></article>
        <article className="operations-card"><span>GUNW granules / raster assets</span><strong>{number(report.nisar?.gunw_granules, 0)} / {number(report.nisar?.raster_assets, 0)}</strong></article>
        <article className="operations-card"><span>Quality-controlled real LOS observations</span><strong>{number(report.nisar?.real_los_observations, 0)}</strong></article>
        <article className="operations-card"><span>Persisted LOS forecast runs</span><strong>{number(report.nisar?.forecast_runs, 0)}</strong></article>
      </section>

      <section className="operations-section">
        <p className="operations-eyebrow">RETROSPECTIVE · OUT-OF-TIME</p>
        <h2>Historical impact estimator</h2>
        <p>Train years 2019–2022; holdout year 2025. The comparison baseline predicts the training-set global mean. Each MAE is expressed in the reported unit.</p>
        <div className="operations-table-wrap"><table>
          <thead><tr><th>Target</th><th>Train records</th><th>2025 holdout</th><th>Model MAE</th><th>Baseline MAE</th><th>MAE improvement vs baseline</th></tr></thead>
          <tbody>{Object.entries(metrics).map(([key, metric]) => <tr key={key}>
            <th scope="row">{labels[key] ?? key}</th><td>{number(metric.train_n, 0)}</td><td>{number(metric.holdout_n, 0)}</td>
            <td>{number(metric.model_mae)} {metric.unit ?? ""}</td><td>{number(metric.global_mean_baseline_mae)} {metric.unit ?? ""}</td>
            <td>{metric.improvement_vs_baseline_percent == null ? "—" : `${number(metric.improvement_vs_baseline_percent)}%`}</td>
          </tr>)}</tbody>
        </table></div>
        <p className="operations-note">{report.historical_impact_backtest?.interpretation}</p>
      </section>

      <section className="operations-section">
        <p className="operations-eyebrow">LATEST STORED NISAR SCREENING</p>
        <h2>{assessment ? `${assessment.municipality}, ${assessment.department}` : "No stored assessment"}</h2>
        {assessment && <p>{(assessment.changed_fraction * 100).toFixed(3)}% of evaluated pixels were flagged as relative anomalies; relative priority {number(assessment.relative_priority_score)} / 100 ({assessment.priority}). Mode: {assessment.data_mode}. Model: {assessment.model_version}. Recorded: {assessment.created_at.slice(0, 10)}.</p>}
        <div className="operations-limit"><strong>Future LOS forecast: {report.nisar?.forecast_runs ? "Exploratory record available; skill is not established" : "No validated forecast available"}</strong><p>{report.limitations?.join(" ")}</p></div>
      </section>
    </>}
    <footer className="operations-footer">SAROS · Space Apps 2026 · Data and methods are traceable in the project documentation.</footer>
  </main>;
}
