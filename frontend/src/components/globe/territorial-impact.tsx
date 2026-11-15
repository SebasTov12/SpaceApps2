"use client";

import { useEffect, useState } from "react";
import { ProtectedTerms, useI18n } from "@/lib/i18n";
import { exposureScenarios, type TerritorialAssessment } from "@/lib/socioeconomic";
import { loadAssessment, loadMunicipalProfile, type MunicipalProfile } from "@/lib/territorial-api";

/** Embedded disclosure in the existing region view, opened by selecting the globe. */
export default function TerritorialImpact({ zoneId, lat, lon, assessment, observation }: {
  zoneId: string;
  lat: number;
  lon: number;
  /** undefined loads the configured API or local demo; null means no assessment. */
  assessment?: TerritorialAssessment | null;
  observation?: { date: string; value: number | null; unit: string; demo: boolean };
}) {
  const { lang } = useI18n();
  const en = lang === "en";
  const [scenario, setScenario] = useState(0);
  const [result, setResult] = useState<{ zoneId: string; data: TerritorialAssessment | null; error: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  const [now, setNow] = useState(0);
  const [liveResult, setLiveResult] = useState<{ zoneId: string; data: MunicipalProfile | null; error: boolean } | null>(null);
  const hasBackend = Boolean(process.env.NEXT_PUBLIC_SAROS_API);
  const hasLiveRegion = hasBackend && ["colombia-ladera", "bogota-subsidencia", "la-mojana-inundacion", "caqueta-deforestacion", "atrato-mineria", "bajo-cauca-mineria", "chiribiquete-borde"].includes(zoneId);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (assessment !== undefined || hasLiveRegion) return;
    // Production shows only backend-backed profiles. Demo assessments remain
    // available to local development when no public SAROS API is configured.
    if (hasBackend) {
      setResult({ zoneId, data: null, error: false });
      return;
    }
    const controller = new AbortController();
    loadAssessment(zoneId, controller.signal).then((data) => {
      if (!controller.signal.aborted) setResult({ zoneId, data, error: false });
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ zoneId, data: null, error: true });
    });
    return () => controller.abort();
  }, [zoneId, assessment, retry, hasBackend, hasLiveRegion]);
  useEffect(() => {
    if (!hasLiveRegion) return;
    const controller = new AbortController();
    loadMunicipalProfile(zoneId, lon, lat, controller.signal).then((data) => {
      if (!controller.signal.aborted) setLiveResult({ zoneId, data, error: false });
    }).catch(() => {
      if (!controller.signal.aborted) setLiveResult({ zoneId, data: null, error: true });
    });
    return () => controller.abort();
  }, [zoneId, lon, lat, retry, hasLiveRegion]);
  const loading = hasLiveRegion
    ? liveResult?.zoneId !== zoneId
    : assessment === undefined && result?.zoneId !== zoneId;
  const failed = hasLiveRegion
    ? liveResult?.zoneId === zoneId && liveResult.error
    : assessment === undefined && result?.zoneId === zoneId && result.error;
  const profile = liveResult?.zoneId === zoneId ? liveResult.data : null;
  const candidate = assessment === undefined ? result?.data : assessment;
  const data = candidate?.zoneId === zoneId ? candidate : null;
  const alerts = data?.alerts?.filter((item) => Date.parse(item.issuedAt) <= now && Date.parse(item.expiresAt) > now) ?? [];
  const selected = exposureScenarios[scenario];
  const format = (value: number) => Math.round(value).toLocaleString(en ? "en-US" : "es-CO");
  const formatNullable = (value: number | null) => value === null ? "—" : format(value);
  const retryLoad = () => {
    setResult(null);
    setLiveResult(null);
    setRetry((n) => n + 1);
  };
  return (
    <details className="zone-explain territorial-impact">
      <summary>{en ? "Territory & livelihoods" : "Territorio y medios de vida"}<span className="territorial-badge notranslate" translate="no">{hasLiveRegion ? "DANE" : data?.mode === "demo" ? "DEMO" : "SAROS"}</span></summary>
      {loading ? <p role="status">{en ? "Loading territorial data…" : "Cargando datos territoriales…"}</p>
        : failed ? <div role="alert"><p>{en ? "The backend could not provide territorial data." : "El backend no pudo entregar los datos territoriales."}</p><button className="territorial-retry" onClick={retryLoad}>{en ? "Retry" : "Reintentar"}</button></div>
          : hasLiveRegion ? profile ? <>
            <p>{en ? "Official municipal indicators from SAROS. The selected point is matched to the DANE municipal boundary." : "Indicadores municipales oficiales consultados a SAROS. El punto seleccionado se cruza con el límite municipal del DANE."}</p>
            <strong>{profile.municipality}, {profile.department} · DIVIPOLA {profile.divipola}</strong>
            <div className="zone-stats" aria-live="polite">
              {[
                { label: en ? "Population" : "Población", value: profile.population },
                { label: en ? "Households" : "Hogares", value: profile.households },
                { label: en ? "Dwellings" : "Viviendas", value: profile.dwellings },
                { label: en ? "Occupied dwellings" : "Viviendas ocupadas", value: profile.occupiedDwellings },
              ].map(({ label, value }) => <div key={label}><small>{label}</small><strong>{formatNullable(value)}</strong><em>{en ? `DANE census ${profile.censusVintage}` : `Censo DANE ${profile.censusVintage}`}</em></div>)}
            </div>
            <p>{en ? "Housing deficit" : "Déficit habitacional"}: {profile.housingDeficitPercent === null ? "—" : `${profile.housingDeficitPercent.toFixed(1)}%`} · {en ? "Multidimensional poverty index (source value)" : "Índice de pobreza multidimensional (valor de la fuente)"}: {formatNullable(profile.multidimensionalPovertyIndex)}</p>
            <p>{en ? "Health facilities" : "Centros de salud"}: {formatNullable(profile.healthFacilities)} · {en ? "School sites" : "Establecimientos educativos"}: {formatNullable(profile.schools)}</p>
            <p>{en ? "Source: DANE municipal framework and census; health and education counts are shown when available." : "Fuente: marco geoestadístico y censo municipal del DANE; los conteos de salud y educación se muestran cuando están disponibles."}</p>
            <p>{en ? "These are municipal baseline indicators, not people exposed to this radar change, confirmed losses, or a risk forecast." : "Son indicadores base del municipio; no representan personas expuestas a este cambio de radar, daños confirmados ni un pronóstico de riesgo."}</p>
            {profile.updatedAt && <small className="territorial-provenance">{en ? "Backend refresh" : "Actualizado en backend"}: {profile.updatedAt}</small>}
          </> : <p>{en ? "No DANE municipal profile covers this point yet." : "Aún no hay un perfil municipal DANE que cubra este punto."}</p>
            : !data ? <p>{en ? "No backend assessment is available for this region." : "No hay una evaluación del backend disponible para esta región."}</p> : <>
              <p><ProtectedTerms text={en ? "SAROS connects surface observations with territorial exposure and preventive review." : "SAROS relaciona cambios de la superficie con exposición territorial y revisión preventiva."} /></p>
              <strong>{en ? "1. Surface observation" : "1. Observación de la superficie"}</strong>
              <p>{observation ? `${observation.date} · ${observation.value == null ? "—" : observation.value.toFixed(1)} ${observation.unit}${observation.demo ? " · DEMO" : ""}` : (en ? "Observation unavailable" : "Observación no disponible")}</p>
              <p>{en ? "Use the existing map timeline and chart to review the selected point. Exposure assumptions are independent of this measurement." : "Usa la línea de tiempo y la gráfica del mapa para revisar el punto seleccionado. Los supuestos de exposición son independientes de esta medición."}</p>
              <strong>{en ? "2. Territorial vulnerability" : "2. Vulnerabilidad territorial"}</strong>
              <p>{data.vulnerability.status === "unassessed" ? (en ? "Assessment pending" : "Evaluación pendiente") : (en ? "Assessed" : "Evaluada")}: {data.vulnerability.factors.map((factor) => factor[lang]).join(" · ")}</p>
              <p>{en ? "Risk assessment" : "Evaluación de riesgo"}: {data.risk.level === "unassessed" ? (en ? "Undetermined" : "Sin determinar") : ({ low: en ? "Low" : "Bajo", moderate: en ? "Moderate" : "Moderado", high: en ? "High" : "Alto" }[data.risk.level])}. {data.risk.method[lang]}</p>
              <strong>{en ? "3. Socioeconomic scenario" : "3. Escenario socioeconómico"}</strong>
              <p>{data.sectors.map((sector) => sector[lang]).join(" · ")}</p>
              <p>{data.source[lang]}</p>
              <label htmlFor={`scenario-${zoneId}`}>{en ? "Hypothetical exposure scenario" : "Escenario hipotético de exposición"}</label>
              <select id={`scenario-${zoneId}`} value={scenario} onChange={(event) => setScenario(Number(event.target.value))}>
                {exposureScenarios.map((item, index) => <option key={index} value={index}>{item.label[lang]} · {item.fraction * 100}%</option>)}
              </select>
              <div className="zone-stats" aria-live="polite">
                {[[en ? "People exposed" : "Personas expuestas", data.population], [en ? "Homes exposed" : "Viviendas expuestas", data.homes], [en ? "Productive hectares" : "Hectáreas productivas", data.productiveHa]].map(([label, value]) => <div key={label}><small>{label}</small><strong>{format(Number(value) * selected.fraction)}</strong><em>{en ? "Simulated exposure" : "Exposición simulada"}</em></div>)}
              </div>
              <p>{data.infrastructure.map((item) => `${item.label[lang]}: ${format(item.count * selected.fraction)}`).join(" · ")}</p>
              <p>{en ? "Assumed share of the inventory; no forecast probability, confirmed loss or monetary damage estimate." : "Fracción supuesta del inventario; no es probabilidad de ocurrencia, pérdida confirmada ni estimación monetaria de daños."}</p>
              <p>{data.consequence[lang]}</p>
              <strong>{en ? "Preventive review" : "Revisión preventiva"}</strong>
              <p>{data.prevention[lang]}</p>
              <p>{en ? "Scenario review priority" : "Prioridad de revisión del escenario"}: {selected.label[lang]}. {en ? "Review the exposed inventory and local response capacity before choosing interventions." : "Revisar el inventario expuesto y la capacidad de respuesta local antes de definir intervenciones."}</p>
              <details>
                <summary>{en ? "Historical socioeconomic impacts" : "Afectaciones socioeconómicas históricas"}</summary>
                {data.historicalImpacts.length ? <ul>{data.historicalImpacts.map((entry, index) => <li key={`${entry.date}-${index}`}>{entry.date} · {entry.description[lang]} · {entry.source}</li>)}</ul> : <p>{en ? "No verified records loaded. Absence of records does not mean absence of impacts." : "No hay registros verificados cargados. La ausencia de registros no significa ausencia de afectaciones."}</p>}
              </details>
              <details>
                <summary>{en ? "Forecast & notices" : "Pronóstico y avisos"}</summary>
                {data.forecast && data.forecast.status !== "unavailable" ? <>
                  <p>{data.forecast.status === "experimental" ? (en ? "Experimental model" : "Modelo experimental") : (en ? "Validated according to provider" : "Validado según el proveedor")} · {data.forecast.horizon[lang]}</p>
                  <p>{data.forecast.summary[lang]}</p><p>{data.forecast.method} · {data.forecast.uncertainty[lang]}</p>
                </> : <p>{en ? "No validated forecast available." : "No hay un pronóstico validado disponible."}</p>}
                {alerts.length ? alerts.map((alert) => <article className="territorial-alert" data-severity={alert.severity} key={alert.id}>
                  <strong>{alert.severity === "warning" ? (en ? "Warning" : "Advertencia") : alert.severity === "watch" ? (en ? "Watch" : "Vigilancia") : (en ? "Information" : "Información")}{data.mode === "demo" ? " · DEMO" : ""}</strong>
                  <p>{alert.message[lang]}</p><p>{alert.action[lang]}</p><small>{alert.source} · {alert.issuedAt} → {alert.expiresAt}</small>
                </article>) : <p>{en ? "No current notices received. This does not establish safe conditions." : "Sin avisos vigentes recibidos. Esto no determina condiciones seguras."}</p>}
              </details>
              <p className="territorial-provenance">{data.assessedAt ? `${en ? "Assessment date" : "Fecha de evaluación"}: ${data.assessedAt}` : (en ? "Illustrative assessment without validation date." : "Evaluación ilustrativa sin fecha de validación.")} <ProtectedTerms text={en ? "SAROS does not predict earthquakes. Decisions require local expert review." : "SAROS no predice terremotos. Las decisiones requieren revisión técnica local."} /></p>
            </>}
    </details>
  );
}
