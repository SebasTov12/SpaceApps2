"use client";

import { Bot, CalendarDays, ChartNoAxesCombined, Database, LoaderCircle, MapPin, X } from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { formatCoord } from "@/lib/sites";
import { HAZARD_KINDS, sourceName, type HazardPoint } from "@/lib/hazard-points";

type Props = { point: HazardPoint; lang: "es" | "en"; onClose: () => void };

const impactLabels: Record<string, { es: string; en: string }> = {
  affected_families: { es: "familias (estimación histórica)", en: "families (historical estimate)" },
  affected_people: { es: "personas (estimación histórica)", en: "people (historical estimate)" },
  affected_persons: { es: "personas (estimación histórica)", en: "people (historical estimate)" },
  homes_damaged: { es: "viviendas dañadas (estimación histórica)", en: "homes damaged (historical estimate)" },
  homes_destroyed: { es: "viviendas destruidas (estimación histórica)", en: "homes destroyed (historical estimate)" },
};

export default function HazardPointDetail({ point, lang, onClose }: Props) {
  const es = lang === "es";
  const [tab, setTab] = useState<"simple" | "analysis">("simple");
  const [saruAnswer, setSaruAnswer] = useState("");
  const [saruError, setSaruError] = useState("");
  const [askingSaru, setAskingSaru] = useState(false);
  const kind = HAZARD_KINDS[point.kind] ?? HAZARD_KINDS.other;
  const model = point.model_assessment ?? null;
  const records = (point.events ?? []).filter((event) => event.date);
  const estimateScope = (key: string) => {
    const scope = point.model_context?.estimate_geography[key];
    if (!scope) return "";
    return es ? ({ municipality: "municipio", department: "departamento", national: "nacional" }[scope])
      : ({ municipality: "municipality", department: "department", national: "national" }[scope]);
  };
  async function askSaru() {
    if (!point.id || askingSaru) return;
    setAskingSaru(true);
    setSaruError("");
    try {
      const response = await fetch("/api/assistant", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ point_id: point.id, messages: [{ role: "user", content: es
          ? `Resume este punto en 2 frases: qué muestran sus registros y qué acción preventiva prudente recomiendas. Aclara si no hay medición NISAR o pronóstico.`
          : `Summarize this point in 2 sentences: what its records show and one prudent preventive action. State if NISAR measurement or forecast is unavailable.` }] }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "assistant_unavailable");
      setSaruAnswer(result.answer);
    } catch (error) {
      setSaruError(error instanceof Error && error.message === "assistant_not_configured"
        ? (es ? "Saru no está configurada en el servidor." : "Saru is not configured on the server.")
        : (es ? "No se pudo consultar a Saru." : "Could not reach Saru."));
    } finally { setAskingSaru(false); }
  }

  return (
    <motion.aside className="zone-panel hz-point-panel" role="dialog" aria-modal="false" aria-labelledby="hz-point-title"
      initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }}>
      <header className="zone-head">
        <span className="zone-kind" style={{ color: kind.color }}>{kind[es ? "es" : "en"]}</span>
        <button type="button" className="zone-close" onClick={onClose} aria-label={es ? "Cerrar ficha" : "Close details"}><X size={17} /></button>
      </header>
      <h2 id="hz-point-title" className="zone-title">{point.place || (es ? "Punto georreferenciado" : "Georeferenced point")}</h2>
      <p className="zone-place"><MapPin size={13} /> {formatCoord(point.lat, point.lon)} · {Array.from(new Set(point.sources.map(sourceName))).join(" · ")}</p>
      <div className="zone-tabs" role="tablist" aria-label={es ? "Detalle del punto" : "Point details"}>
        <button type="button" role="tab" aria-selected={tab === "simple"} className={tab === "simple" ? "is-active" : undefined} onClick={() => setTab("simple")}>{es ? "Vista simple" : "Overview"}</button>
        <button type="button" role="tab" aria-selected={tab === "analysis"} className={tab === "analysis" ? "is-active" : undefined} onClick={() => setTab("analysis")}>{es ? "Análisis" : "Analysis"}</button>
      </div>

      {tab === "analysis" ? (
        <div className="zone-analysis hz-point-content" role="tabpanel">
          <section className="zs-card">
            <header className="zs-head"><span className="zs-head-icon"><ChartNoAxesCombined size={15} /></span><div><h3>{es ? "Resultado del modelo SAROS" : "SAROS model result"}</h3><p>{es ? "Salida guardada para esta ubicación" : "Saved output for this location"}</p></div></header>
            {model ? <>
              <p className="hz-model-priority">{model.priority} · {es ? "priorización exploratoria" : "exploratory prioritization"}</p>
              <dl className="hz-model-metrics">
                <div><dt>{es ? "Índice de anomalía" : "Anomaly index"}</dt><dd>{model.anomaly_index.toFixed(1)} / 100</dd></div>
                <div><dt>{es ? "Fracción de píxeles marcados" : "Flagged pixel fraction"}</dt><dd>{(model.changed_fraction * 100).toFixed(2)}%</dd></div>
                <div><dt>{es ? "Modelo" : "Model"}</dt><dd>{model.model_version}</dd></div>
                <div><dt>{es ? "Procesado" : "Processed"}</dt><dd>{new Date(model.created_at).toLocaleString(es ? "es-CO" : "en-US")}</dd></div>
              </dl>
              <p>{model.recommendation}</p>
              <p className="zone-muted">{es ? "Es una priorización relativa basada en una escena NISAR y contexto histórico municipal; no es una probabilidad, una alerta ni un pronóstico temporal." : "Relative prioritization from a NISAR scene and municipal historical context; not a probability, alert or time forecast."}</p>
              {Object.entries(model.estimated_historical_impacts ?? {}).length > 0 && <>
                <p className="hz-subhead">{es ? "Contexto histórico municipal estimado" : "Estimated municipal historical context"}</p>
                <ul className="hz-model-impacts">{Object.entries(model.estimated_historical_impacts).map(([key, value]) => <li key={key}>{(impactLabels[key] ?? { es: key.replaceAll("_", " "), en: key.replaceAll("_", " ") })[lang]}: {Number(value).toLocaleString(es ? "es-CO" : "en-US", { maximumFractionDigits: 1 })}</li>)}</ul>
              </>}
              <p className="zone-muted">{es ? "Pronóstico a 30/90 días: no disponible para este punto." : "30/90-day forecast: unavailable for this point."}</p>
            </> : <p className="zone-muted">{es ? "No hay una evaluación de movimiento NISAR para este punto. Un registro de emergencia no basta para calcular una anomalía ni un pronóstico." : "There is no NISAR movement assessment for this point. An emergency record alone cannot produce an anomaly result or forecast."}</p>}
            {point.model_context ? <>
              <p className="hz-subhead">{es ? "Contexto del modelo para el municipio" : "Municipal model context"}</p>
              <p>{es ? "Estimación de afectaciones históricas basada en datos reales reportados:" : "Estimated historical impacts from reported real data:"}</p>
              <ul className="hz-model-impacts">{Object.entries(point.model_context.estimated_historical_impacts).map(([key, value]) => <li key={key}>{(impactLabels[key] ?? { es: key.replaceAll("_", " "), en: key.replaceAll("_", " ") })[lang]}: {Number(value).toLocaleString(es ? "es-CO" : "en-US", { maximumFractionDigits: 1 })} <small>({estimateScope(key)})</small></li>)}</ul>
              <p className="zone-muted">{es ? `Modelo ${point.model_context.model_version} (${point.model_context.training_period}); percentil histórico ${point.model_context.historical_impact_percentile.toFixed(1)}. Es contexto municipal, no daño causado por este evento, riesgo actual ni predicción.` : `Model ${point.model_context.model_version} (${point.model_context.training_period}); historical percentile ${point.model_context.historical_impact_percentile.toFixed(1)}. Municipal context only, not damage caused by this event, current risk or a forecast.`}</p>
            </> : <p className="zone-muted">{es ? "El modelo histórico no tiene cobertura entrenada para este municipio." : "The historical model has no trained coverage for this municipality."}</p>}
            <p className="zone-muted">{es ? "Pronóstico futuro para este punto: no disponible." : "Future forecast for this point: unavailable."}</p>
          </section>
        </div>
      ) : (
        <div className="zone-simple zs hz-point-content" role="tabpanel">
          <section className="zs-card">
            <header className="zs-head"><span className="zs-head-icon"><Database size={15} /></span><div><h3>{es ? "Qué está pasando" : "What is recorded"}</h3><p>{es ? "Registro histórico, no alerta activa" : "Historical records, not an active alert"}</p></div></header>
            <p>{point.type || kind[es ? "es" : "en"]}: <b>{point.n.toLocaleString(es ? "es-CO" : "en-US")}</b> {es ? "registros" : "records"}{point.first && <> · {point.first}{point.last && point.last !== point.first ? ` – ${point.last}` : ""}</>}.</p>
            <p className="zone-muted">{es ? "Ubicación representativa: " : "Representative location: "}{point.location_precision === "record_coordinates" ? (es ? "coordenadas del registro" : "record coordinates") : point.location_precision === "municipality_centroid" ? (es ? "centroide municipal; no es la coordenada exacta del evento" : "municipal centroid; not the exact event coordinate") : (es ? "centroide de la geometría fuente" : "centroid of source geometry")}</p>
          </section>

          <section className="zs-card">
            <header className="zs-head"><span className="zs-head-icon"><MapPin size={15} /></span><div><h3>{es ? "A quién afecta" : "Reported impact"}</h3><p>{es ? "Cifras que aparecen en la fuente" : "Figures present in the source"}</p></div></header>
            {Number(point.impact_reports ?? 0) > 0 ? <div className="hz-impact-grid">
              {point.affected > 0 && <span><b>{point.affected.toLocaleString(es ? "es-CO" : "en-US")}</b> {es ? "personas reportadas" : "people reported"}</span>}
              {point.homes > 0 && <span><b>{point.homes.toLocaleString(es ? "es-CO" : "en-US")}</b> {es ? "viviendas reportadas" : "homes reported"}</span>}
              {point.deaths > 0 && <span><b>{point.deaths.toLocaleString(es ? "es-CO" : "en-US")}</b> {es ? "fallecimientos reportados" : "deaths reported"}</span>}
              {point.affected === 0 && point.homes === 0 && point.deaths === 0 && <span>{es ? "La fuente no incluye cifras de impacto para este grupo." : "The source includes no impact figures for this group."}</span>}
            </div> : <p className="zone-muted">{es ? "La fuente no reportó cifras de afectación para estos registros." : "The source did not report impact figures for these records."}</p>}
            {point.model_context ? <div className="hz-context-box">
              <b>{es ? "Estimación histórica del modelo para el municipio" : "Model historical estimate for this municipality"}</b>
              <ul className="hz-model-impacts">{Object.entries(point.model_context.estimated_historical_impacts).map(([key, value]) => <li key={key}>{(impactLabels[key] ?? { es: key.replaceAll("_", " "), en: key.replaceAll("_", " ") })[lang]}: {Number(value).toLocaleString(es ? "es-CO" : "en-US", { maximumFractionDigits: 1 })} <small>({estimateScope(key)})</small></li>)}</ul>
              <small>{es ? `Modelo ${point.model_context.model_version} (${point.model_context.training_period}); percentil histórico ${point.model_context.historical_impact_percentile.toFixed(1)}. No es el impacto de este evento ni riesgo actual.` : `Model ${point.model_context.model_version} (${point.model_context.training_period}); historical percentile ${point.model_context.historical_impact_percentile.toFixed(1)}. Not the impact of this event or current risk.`}</small>
            </div> : <p className="zone-muted">{es ? "No hay línea base municipal del modelo para este lugar." : "No model municipal baseline is available for this place."}</p>}
          </section>

          <section className="zs-card">
            <header className="zs-head"><span className="zs-head-icon"><CalendarDays size={15} /></span><div><h3>{es ? "Qué pasó aquí" : "History here"}</h3><p>{es ? "Eventos recientes en la base" : "Recent events in the database"}</p></div></header>
            {records.length ? <ol className="hz-event-list">{records.map((event, i) => <li key={`${event.source}-${event.date}-${i}`}><b>{event.date}</b><span>{event.type} · {sourceName(event.source)}</span>{event.affected != null && event.affected > 0 && <small>{event.affected.toLocaleString(es ? "es-CO" : "en-US")} {es ? "personas reportadas" : "people reported"}</small>}</li>)}</ol> : <p className="zone-muted">{es ? "Sin eventos individuales en el resumen recibido." : "No individual events in the received summary."}</p>}
          </section>

          <section className="zs-card">
            <header className="zs-head"><span className="zs-head-icon"><ChartNoAxesCombined size={15} /></span><div><h3>{es ? "Qué hacer" : "What to do"}</h3><p>{es ? "Recomendación basada en la salida del modelo" : "Recommendation from model output"}</p></div></header>
            {model ? <><p>{model.recommendation}</p><p className="zone-muted">{es ? "Prioridad " : "Priority "}{model.priority} · {es ? "revisión preventiva, no instrucción de emergencia." : "preventive review, not emergency guidance."}</p></> : <p className="zone-muted">{es ? "Sin evaluación NISAR puntual. Saru puede resumir el historial y dar prevención general, pero no presentarla como resultado del modelo." : "No point-specific NISAR assessment. Saru can summarize history and provide general prevention, but not as a model result."}</p>}
          </section>
        </div>
      )}
      <section className="zs-card hz-saru-card">
        <button type="button" className="hz-ask-saru" onClick={askSaru} disabled={askingSaru}>
          {askingSaru ? <LoaderCircle size={15} className="animate-spin" /> : <Bot size={15} />}{askingSaru ? (es ? "Consultando a Saru…" : "Asking Saru…") : (es ? "Saru, recomienda para este punto" : "Ask Saru about this point")}
        </button>
        {saruAnswer && <p className="hz-saru-answer">🤖 {saruAnswer}</p>}{saruError && <p className="zone-muted" role="status">{saruError}</p>}
      </section>
      <footer className="zone-source"><span>{Array.from(new Set(point.sources.map(sourceName))).join(" · ")}</span><span>{es ? "Actualizado" : "Updated"}: {point.last ?? "—"}</span></footer>
    </motion.aside>
  );
}
