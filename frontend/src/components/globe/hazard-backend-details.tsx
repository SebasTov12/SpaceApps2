"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Database, FileUp, Radar, Sprout } from "lucide-react";
import { loadNisarScenes, variableLabel, type NisarFrame, type NisarScenes, type NisarSeries } from "@/lib/nisar-scenes";
import { pointCountry, type HazardPoint } from "@/lib/hazard-points";

type Lang = "es" | "en";
type JsonRecord = Record<string, unknown>;
type Feature = { geometry?: { type?: string; coordinates?: unknown } | null; properties?: JsonRecord };
type CatalogEntry = { id: string; source: string; kind: string; records: number; latest_record_at: string | null; note: string };
type LosSeries = {
  aoi_id: string; stack_id: string; processing_version: string;
  observation_count: number; valid_observation_count: number;
  first_valid_date: string | null; last_valid_date: string | null;
  best_valid_fraction: number;
};
type ModelCapabilities = { service_ready?: boolean; composite_ready?: boolean; unet_ready?: boolean; model_version?: string | null; supported_tracks?: string[] };

async function requestModelStatus() {
  const response = await fetch("/api/model-tools", { cache: "no-store" });
  const status = await response.json() as { enabled?: boolean; authorized?: boolean };
  if (!response.ok || !status.enabled) return { state: "disabled" as const, capabilities: null };
  if (!status.authorized) return { state: "locked" as const, capabilities: null };
  const capabilityResponse = await fetch("/api/model-tools?status=1", { cache: "no-store" });
  if (!capabilityResponse.ok) return { state: "enabled" as const, capabilities: null };
  return { state: "enabled" as const, capabilities: await capabilityResponse.json() as ModelCapabilities };
}

const DEPARTMENTS: Record<string, string> = {
  amazonas: "91", antioquia: "05", arauca: "81", atlantico: "08", bogota: "11", bolivar: "13",
  boyaca: "15", caldas: "17", caqueta: "18", casanare: "85", cauca: "19", cesar: "20",
  choco: "27", cordoba: "23", cundinamarca: "25", guainia: "94", guaviare: "95", huila: "41",
  guajira: "44", magdalena: "47", meta: "50", narino: "52", santander: "68",
  "norte de santander": "54", putumayo: "86", quindio: "63", risaralda: "66", "san andres": "88",
  sucre: "70", tolima: "73", "valle del cauca": "76", vaupes: "97", vichada: "99",
};

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function pointInRing(lon: number, lat: number, ring: unknown): boolean {
  if (!Array.isArray(ring) || ring.length < 4) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (!Array.isArray(a) || !Array.isArray(b)) continue;
    const [ax, ay, bx, by] = [a[0], a[1], b[0], b[1]];
    if (![ax, ay, bx, by].every((value) => typeof value === "number" && Number.isFinite(value))) continue;
    if ((ay > lat) !== (by > lat) && lon < ((bx - ax) * (lat - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

function containsPoint(feature: Feature, lon: number, lat: number): boolean {
  const geometry = feature.geometry;
  if (!geometry || !Array.isArray(geometry.coordinates)) return false;
  const polygonContains = (polygon: unknown) => Array.isArray(polygon)
    && polygon.length > 0
    && pointInRing(lon, lat, polygon[0])
    && !polygon.slice(1).some((hole) => pointInRing(lon, lat, hole));
  if (geometry.type === "Polygon") return polygonContains(geometry.coordinates);
  if (geometry.type === "MultiPolygon") return geometry.coordinates.some(polygonContains);
  return false;
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

function numberText(value: unknown, lang: Lang, digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return value.toLocaleString(lang === "es" ? "es-CO" : "en-US", { maximumFractionDigits: digits });
}

function dateText(value: unknown, lang: Lang) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return "—";
  return new Date(value).toLocaleDateString(lang === "es" ? "es-CO" : "en-US", { dateStyle: "medium", timeZone: "UTC" });
}

function friendlyError(error: unknown, lang: Lang) {
  const value = String(error instanceof Error ? error.message : error);
  const messages: Record<string, [string, string]> = {
    model_backend_unavailable: ["El servicio de análisis no responde. Inténtalo de nuevo más tarde.", "The analysis service is unavailable. Try again later."],
    model_access_required: ["La sesión de análisis expiró. Vuelve a ingresar la clave autorizada.", "The analysis session expired. Enter the authorized key again."],
    model_actions_disabled: ["El servidor mantiene desactivadas las operaciones de modelos.", "Model operations are disabled on the server."],
    insufficient_real_observations: ["La serie no tiene suficientes observaciones LOS reales para calcular el pronóstico.", "This series does not have enough real LOS observations for a forecast."],
    upload_exceeds_32mb_limit: ["El archivo supera el límite de 32 MB.", "The file exceeds the 32 MB limit."],
    expected_npz_file_under_32mb: ["Selecciona un archivo NPZ válido de hasta 32 MB.", "Select a valid NPZ file under 32 MB."],
  };
  return messages[value]?.[lang === "es" ? 0 : 1] ?? (value.startsWith("HTTP ")
    ? (lang === "es" ? `El servidor respondió ${value}. Revisa los datos o inténtalo de nuevo.` : `The server returned ${value}. Check the input or try again.`)
    : value);
}

function pointInFrame(lon: number, lat: number, frame: NisarFrame) {
  return pointInRing(lon, lat, frame.footprint);
}

function MaskPreview({ value, title }: { value: unknown; title: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!Array.isArray(value) || !canvas.current) return;
    const rows = value as unknown[];
    const height = rows.length;
    const width = Array.isArray(rows[0]) ? rows[0].length : 0;
    if (!width || !height || width * height > 4_000_000) return;
    const element = canvas.current;
    element.width = width;
    element.height = height;
    const context = element.getContext("2d");
    if (!context) return;
    const pixels = context.createImageData(width, height);
    for (let y = 0; y < height; y++) {
      const row = rows[y];
      if (!Array.isArray(row)) continue;
      for (let x = 0; x < width; x++) {
        if (!Number(row[x])) continue;
        const index = (y * width + x) * 4;
        pixels.data[index] = 153;
        pixels.data[index + 1] = 104;
        pixels.data[index + 2] = 255;
        pixels.data[index + 3] = 220;
      }
    }
    context.putImageData(pixels, 0, 0);
  }, [value]);
  if (!Array.isArray(value)) return null;
  return <figure className="backend-mask"><canvas ref={canvas} role="img" aria-label={title} /><figcaption>{title}</figcaption></figure>;
}

type Props = { point: HazardPoint; lang: Lang };

export default function HazardBackendDetails({ point, lang }: Props) {
  const es = lang === "es";
  const parts = point.place.split(",").map((part) => part.trim());
  const department = point.model_context?.department ?? parts[1] ?? "";
  const departmentCode = DEPARTMENTS[normalize(department)];
  const longitude = point.lon;
  const latitude = point.lat;
  const country = pointCountry(point);
  const [busy, setBusy] = useState(true);
  const [profileState, setProfileState] = useState<"loading" | "found" | "missing" | "unavailable">("loading");
  const [municipality, setMunicipality] = useState<JsonRecord | null>(null);
  const [agricultureState, setAgricultureState] = useState<"loading" | "found" | "empty" | "unavailable">("loading");
  const [agriculture, setAgriculture] = useState<JsonRecord[]>([]);
  const [scenes, setScenes] = useState<NisarScenes | null>(null);
  const [seriesKey, setSeriesKey] = useState("");
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [manifestDate, setManifestDate] = useState<string | null>(null);
  const [catalogState, setCatalogState] = useState<"loading" | "found" | "unavailable">("loading");
  const [modelTools, setModelTools] = useState<"checking" | "enabled" | "locked" | "disabled">("checking");
  const [modelCapabilities, setModelCapabilities] = useState<ModelCapabilities | null>(null);
  const [modelAccessKey, setModelAccessKey] = useState("");
  const [modelAccessError, setModelAccessError] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [losSeriesResult, setLosSeriesResult] = useState<{ aoiKey: string; series: LosSeries[]; unavailable?: boolean } | null>(null);
  const [losSeriesKey, setLosSeriesKey] = useState("");
  const [action, setAction] = useState<"analysis" | "prediction" | "forecast">("analysis");
  const [result, setResult] = useState<{ action: string; data: JsonRecord } | null>(null);
  const [running, setRunning] = useState(false);
  const [formError, setFormError] = useState("");
  const [sceneKey, setSceneKey] = useState("");
  const [checkpoint, setCheckpoint] = useState<JsonRecord | null>(null);
  const [checkpointError, setCheckpointError] = useState("");
  const [checkingCheckpoint, setCheckingCheckpoint] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    void requestModelStatus()
      .then(({ state, capabilities }) => {
        if (controller.signal.aborted) return;
        setModelTools(state);
        setModelCapabilities(capabilities);
      })
      .catch(() => { if (!controller.signal.aborted) setModelTools("disabled"); });

    void Promise.allSettled([
      loadNisarScenes(),
      fetchJson<{ datasets?: { datasets?: CatalogEntry[] }; manifest?: { generated_at?: string } }>("/api/data-catalog", controller.signal),
      country === "CO" && departmentCode
        ? fetchJson<{ features?: Feature[] }>(`/api/territorial?resource=municipalities&department=${departmentCode}`, controller.signal)
        : Promise.resolve(null),
    ]).then(async ([sceneResult, catalogResult, geoResult]) => {
      if (controller.signal.aborted) return;
      if (sceneResult.status === "fulfilled") {
        setScenes(sceneResult.value);
      }
      if (catalogResult.status === "fulfilled") {
        setCatalog(catalogResult.value?.datasets?.datasets ?? []);
        setManifestDate(catalogResult.value?.manifest?.generated_at ?? null);
        setCatalogState(catalogResult.value?.datasets?.datasets ? "found" : "unavailable");
      } else setCatalogState("unavailable");

      if (country !== "CO" || !departmentCode) {
        setProfileState("missing");
        setAgricultureState("empty");
        setBusy(false);
        return;
      }
      if (geoResult.status !== "fulfilled" || !geoResult.value) {
        setProfileState("unavailable");
        setAgricultureState("unavailable");
        setBusy(false);
        return;
      }
      const feature = geoResult.value.features?.find((item) => containsPoint(item, longitude, latitude));
      const code = String(feature?.properties?.divipola ?? "").padStart(5, "0");
      if (!/^\d{5}$/.test(code)) {
        setProfileState("missing");
        setAgricultureState("empty");
        setBusy(false);
        return;
      }
      const [profileResult, agricultureResult] = await Promise.allSettled([
        fetchJson<{ properties?: JsonRecord }>(`/api/territorial?resource=municipality&divipola=${code}`, controller.signal),
        fetchJson<{ records?: JsonRecord[] }>(`/api/territorial?resource=agriculture&divipola=${code}`, controller.signal),
      ]);
      if (controller.signal.aborted) return;
      if (profileResult.status === "fulfilled" && profileResult.value.properties) {
        setMunicipality(profileResult.value.properties);
        setProfileState("found");
      } else setProfileState("unavailable");
      if (agricultureResult.status === "fulfilled") {
        const records = agricultureResult.value.records ?? [];
        setAgriculture(records);
        setAgricultureState(records.length ? "found" : "empty");
      } else setAgricultureState("unavailable");
      setBusy(false);
    });
    return () => controller.abort();
  }, [longitude, latitude, country, departmentCode]);

  const matchedFrames = useMemo(
    () => scenes?.frames.filter((frame) => frame.footprint.length >= 3 && pointInFrame(point.lon, point.lat, frame)) ?? [],
    [scenes, point.lat, point.lon],
  );
  const matchedAois = useMemo(() => [...new Set(matchedFrames.map((frame) => frame.aoi))], [matchedFrames]);
  const matchedSeries = useMemo(
    () => scenes?.series.filter((series) => matchedAois.includes(series.aoi)) ?? [],
    [scenes, matchedAois],
  );
  const selectedSeries = matchedSeries.find((series) => `${series.aoi}|${series.variable}` === seriesKey) ?? matchedSeries[0];
  const matchedAoiKey = matchedAois.join("|");
  const eligibleLosSeries = useMemo(
    () => losSeriesResult?.aoiKey === matchedAoiKey ? losSeriesResult.series : [],
    [losSeriesResult, matchedAoiKey],
  );
  const selectedLosSeries = eligibleLosSeries.find((series) => `${series.aoi_id}|${series.stack_id}|${series.processing_version}` === losSeriesKey) ?? eligibleLosSeries[0];
  const supportedTracksForPoint = useMemo(() => {
    const available = new Set(matchedFrames.flatMap((frame) => {
      if (!frame.track || !frame.frame || !frame.direction) return [];
      const orbit = frame.direction.toUpperCase().startsWith("D") ? "D" : frame.direction.toUpperCase().startsWith("A") ? "A" : "";
      if (!orbit) return [];
      return [`${String(frame.track).padStart(3, "0")}-${orbit}-${String(frame.frame).padStart(3, "0")}`];
    }));
    return (modelCapabilities?.supported_tracks ?? []).filter((track) => available.has(track));
  }, [matchedFrames, modelCapabilities?.supported_tracks]);
  const analysisFrames = useMemo(() => matchedFrames.filter((frame) => {
    if (!frame.products.some((product) => product.toUpperCase().includes("GUNW"))) return false;
    const orbit = frame.direction?.toUpperCase().startsWith("D") ? "D" : frame.direction?.toUpperCase().startsWith("A") ? "A" : "";
    return supportedTracksForPoint.includes(`${String(frame.track ?? "").padStart(3, "0")}-${orbit}-${String(frame.frame ?? "").padStart(3, "0")}`);
  }), [matchedFrames, supportedTracksForPoint]);
  const selectedFrame = analysisFrames.find((frame) => `${frame.aoi}|${frame.track}|${frame.direction}|${frame.frame}` === sceneKey) ?? analysisFrames.find((frame) => {
    const orbit = frame.direction?.toUpperCase().startsWith("D") ? "D" : frame.direction?.toUpperCase().startsWith("A") ? "A" : "";
    return supportedTracksForPoint.includes(`${String(frame.track ?? "").padStart(3, "0")}-${orbit}-${String(frame.frame ?? "").padStart(3, "0")}`);
  }) ?? null;
  const selectedFrameTrack = selectedFrame ? `${String(selectedFrame.track ?? "").padStart(3, "0")}-${selectedFrame.direction?.toUpperCase().startsWith("D") ? "D" : "A"}-${String(selectedFrame.frame ?? "").padStart(3, "0")}` : "";
  const selectedTrack = selectedFrameTrack && supportedTracksForPoint.includes(selectedFrameTrack)
    ? selectedFrameTrack
    : supportedTracksForPoint[0] ?? "";
  const losSeriesResultMatchesPoint = losSeriesResult?.aoiKey === matchedAoiKey;

  useEffect(() => {
    if (modelTools !== "enabled" || !matchedAois.length) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ series: "1" });
    for (const aoiId of matchedAois) query.append("aoi_id", aoiId);
    void fetch(`/api/model-tools?${query}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body = await response.json() as { series?: LosSeries[] };
        if (!response.ok) throw new Error("series_unavailable");
        const series = Array.isArray(body.series) ? body.series : [];
        if (!controller.signal.aborted) setLosSeriesResult({ aoiKey: matchedAoiKey, series });
      })
      .catch(() => { if (!controller.signal.aborted) setLosSeriesResult({ aoiKey: matchedAoiKey, series: [], unavailable: true }); });
    return () => controller.abort();
  }, [modelTools, matchedAois, matchedAoiKey]);

  async function unlockModelTools(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUnlocking(true);
    setModelAccessError("");
    try {
      const response = await fetch("/api/model-access", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessKey: modelAccessKey }),
      });
      const body = await response.json() as JsonRecord;
      if (!response.ok) {
        if (body.error === "invalid_access_key") throw new Error(es ? "La clave de acceso no es válida." : "The access key is invalid.");
        throw new Error(String(body.error ?? `HTTP ${response.status}`));
      }
      setModelAccessKey("");
      const status = await requestModelStatus();
      setModelTools(status.state);
      setModelCapabilities(status.capabilities);
    } catch (error) {
      setModelAccessError(String(error instanceof Error ? error.message : error));
    } finally { setUnlocking(false); }
  }

  async function lockModelTools() {
    await fetch("/api/model-access", { method: "DELETE" }).catch(() => undefined);
    setModelTools("locked");
    setModelCapabilities(null);
    setLosSeriesResult(null);
    setCheckpoint(null);
    setResult(null);
  }

  async function inspectCheckpoint() {
    if (!selectedLosSeries) return;
    setCheckingCheckpoint(true);
    setCheckpoint(null);
    setCheckpointError("");
    try {
      const query = new URLSearchParams({ aoi_id: selectedLosSeries.aoi_id, stack_id: selectedLosSeries.stack_id, processing_version: selectedLosSeries.processing_version });
      const response = await fetch(`/api/model-tools?${query}`, { cache: "no-store" });
      const body = await response.json() as JsonRecord;
      if (!response.ok) throw new Error(String(body.error ?? body.detail ?? `HTTP ${response.status}`));
      setCheckpoint(body);
    } catch (error) {
      setCheckpointError(friendlyError(error, lang));
    } finally { setCheckingCheckpoint(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRunning(true);
    setResult(null);
    setFormError("");
    try {
      const form = new FormData(event.currentTarget);
      form.set("action", action);
      const response = await fetch("/api/model-tools", { method: "POST", body: form });
      const body = await response.json() as JsonRecord;
      if (!response.ok) throw new Error(String(body.error ?? body.detail ?? `HTTP ${response.status}`));
      setResult({ action, data: body });
    } catch (error) {
      setFormError(friendlyError(error, lang));
    } finally { setRunning(false); }
  }

  return <section className="zone-trend backend-evidence" data-tour="backend-evidence">
    <strong><Database size={13} />{es ? "Fuentes y datos disponibles" : "Sources and available data"}</strong>
    {busy && <p className="zone-muted">{es ? "Consultando fuentes territoriales…" : "Loading territorial sources…"}</p>}

    {profileState === "found" && municipality && <div className="backend-evidence-block">
      <b>{String(municipality.municipality_name)}, {String(municipality.department_name)}</b>
      <div className="backend-result-metrics">
        <span>{es ? "Población municipal" : "Municipal population"}<b>{numberText(municipality.population_total, lang, 0)}</b></span>
        <span>{es ? "Hogares" : "Households"}<b>{numberText(municipality.households_total, lang, 0)}</b></span>
        <span>{es ? "Viviendas" : "Dwellings"}<b>{numberText(municipality.dwellings_total, lang, 0)}</b></span>
        <span>{es ? "Déficit habitacional" : "Housing deficit"}<b>{numberText(municipality.housing_deficit_percent, lang)}%</b></span>
        <span>{es ? "Índice de pobreza multidimensional" : "Multidimensional poverty index"}<b>{numberText(municipality.multidimensional_poverty_index, lang)}</b></span>
        <span>{es ? "Centros de salud" : "Health facilities"}<b>{numberText(municipality.health_facility_count, lang, 0)}</b></span>
        <span>{es ? "Instituciones educativas" : "Schools"}<b>{numberText(municipality.school_site_count, lang, 0)}</b></span>
        <span>{es ? "Censo" : "Census"}<b>{String(municipality.census_vintage ?? "—")}</b></span>
      </div>
      <small>{es ? "Contexto municipal agregado; no es exposición medida para este evento." : "Aggregated municipal context; not measured exposure for this event."}</small>
    </div>}
    {profileState === "missing" && <p className="zone-muted">{es ? "No se encontró un municipio DANE que contenga las coordenadas del registro." : "No DANE municipality polygon contains this record's coordinates."}</p>}
    {profileState === "unavailable" && <p className="zone-muted">{es ? "La ficha DIVIPOLA no está disponible ahora." : "The DIVIPOLA profile is unavailable right now."}</p>}

    {agricultureState === "found" && <div className="backend-evidence-block">
      <b><Sprout size={13} /> {es ? "Producción agrícola municipal (UPRA EVA)" : "Municipal agricultural production (UPRA EVA)"}</b>
      {agriculture.slice(0, 5).map((record, index) => <p key={`${record.crop}-${record.year}-${index}`}>
        {String(record.crop ?? record.crop_group ?? (es ? "Cultivo" : "Crop"))} · {String(record.year ?? "—")} · {es ? "cosechadas" : "harvested"}: {numberText(record.area_harvested_ha, lang)} ha · {es ? "producción" : "production"}: {numberText(record.production_tonnes, lang)} t
      </p>)}
      <small>{es ? "Contexto productivo municipal; no estima pérdidas causadas por la afectación." : "Municipal production context; it does not estimate losses caused by the event."}</small>
    </div>}
    {agricultureState === "empty" && profileState === "found" && <p className="zone-muted">{es ? "No hay registros agrícolas EVA para este municipio en el catálogo consultado." : "No EVA agricultural records are available for this municipality in the current catalog."}</p>}
    {agricultureState === "unavailable" && <p className="zone-muted">{es ? "La consulta agrícola no está disponible ahora." : "The agricultural query is unavailable right now."}</p>}

    <div className="backend-evidence-block">
      <b><Radar size={13} /> {es ? "Cobertura NISAR en este punto" : "NISAR coverage at this point"}</b>
      {scenes?.summary && <p>{es ? "Catálogo consultado" : "Catalog queried"}: {numberText(scenes.summary.scenes, lang, 0)} {es ? "escenas" : "scenes"} · {numberText(scenes.summary.rasters, lang, 0)} {es ? "activos raster" : "raster assets"} · {matchedFrames.length} {es ? "marcos coincidentes" : "matching frames"}</p>}
      {matchedFrames.length ? matchedFrames.slice(0, 5).map((frame, index) => <p key={`${frame.aoi}-${frame.track}-${frame.frame}-${index}`}>
        {frame.aoi} · {frame.direction ?? "—"} {frame.track ?? ""}/{frame.frame ?? ""} · {frame.passes} {es ? "pasadas" : "passes"} · {dateText(frame.first, lang)} – {dateText(frame.last, lang)} · {frame.products.join(", ") || (es ? "sin producto declarado" : "no product listed")} · {frame.maturity.join("/") || (es ? "madurez no declarada" : "maturity not listed")} · {frame.granules.slice(0, 2).join(", ") || (es ? "sin granule listado" : "no granule listed")}
      </p>) : <p className="zone-muted">{scenes ? (es ? "El catálogo NISAR consultado no contiene una huella que cubra este punto." : "The current NISAR catalog has no footprint covering this point.") : (es ? "El catálogo NISAR no está disponible ahora." : "The NISAR catalog is unavailable right now.")}</p>}
      {matchedSeries.slice(0, 5).map((series, index) => <small key={`${series.aoi}-${series.variable}-${index}`}>
        {variableLabel(series.variable, es)} · {series.points.length} {es ? "resúmenes raster" : "raster summaries"} · {series.units ?? (es ? "unidad no declarada" : "unit not declared")}
      </small>)}
      {selectedSeries && <RasterSeriesChart series={selectedSeries} options={matchedSeries} lang={lang} onChange={setSeriesKey} />}
      {!!matchedFrames.length && <small>{es ? "Una huella/activo confirma cobertura de catálogo, no que exista una medición LOS validada del evento." : "A catalog footprint/asset confirms coverage, not a validated LOS measurement for this event."}</small>}
    </div>

    <div className="backend-evidence-block">
      <b>{es ? "Inventario y procedencia registrados" : "Registered inventory and provenance"}</b>
      {catalogState === "loading" && <p className="zone-muted">{es ? "Cargando inventario…" : "Loading inventory…"}</p>}
      {catalogState === "unavailable" && <p className="zone-muted">{es ? "El inventario no está disponible ahora." : "The inventory is unavailable right now."}</p>}
      {catalog.map((dataset) => <p key={dataset.id}>
        <span>{dataset.source} · {dataset.kind}</span><br />
        <b>{numberText(dataset.records, lang, 0)}</b> {es ? "registros de predicción" : "prediction records"} · {es ? "último" : "latest"}: {dateText(dataset.latest_record_at, lang)}
        {dataset.note && <small>{dataset.note}</small>}
      </p>)}
      {manifestDate && <small>{es ? "Manifiesto generado" : "Manifest generated"}: {dateText(manifestDate, lang)}</small>}
      {catalogState === "found" && !catalog.length && <p className="zone-muted">{es ? "El inventario aún no contiene registros de predicción." : "The inventory has no prediction records yet."}</p>}
      <small>{es ? "Este inventario cuenta registros de predicción publicados; no equivale al número de escenas ni de rasters NISAR." : "This inventory counts published prediction records; it is not a count of NISAR scenes or rasters."}</small>
    </div>

    <details className="backend-model-tools">
      <summary><FileUp size={13} />{es ? "Análisis y pronóstico del backend" : "Backend analysis and forecasting"}</summary>
      {modelTools === "checking" && <p className="zone-muted">{es ? "Consultando disponibilidad…" : "Checking availability…"}</p>}
      {modelTools === "disabled" && <p className="zone-muted">{es ? "El cómputo está desactivado hasta que el servidor configure su clave de acceso, sesión privada y token; después debe habilitarlo explícitamente. La consulta territorial y de cobertura anterior sigue disponible." : "Compute remains disabled until the server configures its access key, private session secret and token, then explicitly enables it. Territorial and coverage queries above remain available."}</p>}
      {modelTools === "locked" && <>
        <p className="zone-muted">{es ? "El cómputo está protegido. Ingresa la clave autorizada del equipo para consultar series y ejecutar modelos." : "Compute is protected. Enter the team access key to inspect series and run models."}</p>
        <form onSubmit={unlockModelTools}>
          <label>{es ? "Clave de acceso" : "Access key"}<input type="password" autoComplete="current-password" value={modelAccessKey} onChange={(event) => setModelAccessKey(event.target.value)} maxLength={256} required /></label>
          <button type="submit" disabled={unlocking || !modelAccessKey}>{unlocking ? (es ? "Validando…" : "Checking…") : (es ? "Desbloquear herramientas" : "Unlock tools")}</button>
        </form>
        {modelAccessError && <p className="zone-muted">{modelAccessError}</p>}
      </>}
      {modelTools === "enabled" && <>
        <div className="backend-model-status">
          <span>{es ? "Modelo compuesto" : "Composite model"}: <b>{modelCapabilities?.composite_ready ? (es ? "disponible" : "ready") : (es ? "no disponible" : "unavailable")}</b></span>
          <span>U-Net: <b>{modelCapabilities?.unet_ready ? (es ? "disponible" : "ready") : (es ? "sin pesos compatibles" : "compatible weights unavailable")}</b></span>
          {modelCapabilities?.model_version && <small>{es ? "Versión" : "Version"}: {modelCapabilities.model_version}</small>}
        </div>
        <p className="zone-muted">{es ? "El análisis usa una muestra NPZ de capas GUNW ya inspeccionadas. U-Net requiere un par temporal co-registrado y pesos ONNX compatibles. El pronóstico utiliza series LOS reales que superan el umbral de calidad mostrado." : "Analysis uses an NPZ sample from inspected GUNW layers. U-Net requires a co-registered temporal pair and compatible ONNX weights. Forecasting uses real LOS series that pass the displayed quality threshold."}</p>
        <form onSubmit={submit}>
          <label>{es ? "Operación" : "Operation"}
            <select value={action} onChange={(event) => { setAction(event.target.value as typeof action); setResult(null); }}>
              <option value="analysis" disabled={!modelCapabilities?.composite_ready}>{es ? "Análisis compuesto GUNW" : "GUNW composite analysis"}</option>
              <option value="prediction" disabled={!modelCapabilities?.unet_ready}>U-Net · {es ? "máscara de cambio" : "change mask"}</option>
              <option value="forecast">{es ? "Pronóstico LOS" : "LOS forecast"}</option>
            </select>
          </label>
          {action === "analysis" && <div className="backend-form-grid">
            <label>{es ? "Escena GUNW que cubre el punto" : "GUNW scene covering this point"}<select value={selectedFrame ? `${selectedFrame.aoi}|${selectedFrame.track}|${selectedFrame.direction}|${selectedFrame.frame}` : ""} onChange={(event) => setSceneKey(event.target.value)} disabled={!analysisFrames.length}>
              {analysisFrames.map((frame) => <option key={`${frame.aoi}|${frame.track}|${frame.direction}|${frame.frame}`} value={`${frame.aoi}|${frame.track}|${frame.direction}|${frame.frame}`}>{frame.aoi} · {frame.direction} {frame.track}/{frame.frame} · {dateText(frame.first, lang)}–{dateText(frame.last, lang)}</option>)}
            </select></label>
            <input type="hidden" name="track_id" value={selectedTrack} />
            <label>{es ? "Municipio" : "Municipality"}<input name="municipality" required defaultValue={String(municipality?.municipality_name ?? parts[0] ?? "")} /></label>
            <label>{es ? "Departamento" : "Department"}<input name="department" required defaultValue={department} /></label>
            {!analysisFrames.length && <p className="zone-muted">{es ? "No hay una escena GUNW catalogada que cubra este punto." : "No catalogued GUNW scene covers this point."}</p>}
            {selectedFrame && <p className="zone-muted">{es ? "Granules disponibles en el catálogo" : "Granules listed in the catalog"}: {selectedFrame.granules.slice(0, 3).join(", ") || (es ? "sin granules asociados" : "no associated granules")}. {es ? "El NPZ debe prepararse con rásteres de esta escena y conservar su procedencia." : "Prepare the NPZ from this scene's rasters and retain its provenance."}</p>}
            {!supportedTracksForPoint.length && <p className="zone-muted">{es ? "El modelo no tiene un track entrenado que coincida con la huella NISAR registrada para este punto." : "No trained model track matches the NISAR footprint recorded for this point."}</p>}
          </div>}
          {action === "prediction" && <p className="zone-muted">{es ? "NPZ con arreglos `before` y `after` co-registrados, misma forma [canales, alto, ancho] y dimensiones divisibles por 16. La predicción se habilita solo cuando el servicio confirma pesos ONNX." : "NPZ with co-registered `before` and `after` arrays, matching [channels, height, width] shapes, and dimensions divisible by 16. Prediction is enabled only when the service confirms ONNX weights."}</p>}
          {action !== "forecast" ? <label>NPZ<input name="file" type="file" accept=".npz,application/octet-stream" required /></label> : <>
            <div className="backend-form-grid">
              <label>{es ? "Serie LOS elegible para este punto" : "Eligible LOS series for this point"}
                <select value={selectedLosSeries ? `${selectedLosSeries.aoi_id}|${selectedLosSeries.stack_id}|${selectedLosSeries.processing_version}` : ""} onChange={(event) => { setLosSeriesKey(event.target.value); setCheckpoint(null); setCheckpointError(""); }} required disabled={!eligibleLosSeries.length}>
                  {eligibleLosSeries.map((series) => {
                    const key = `${series.aoi_id}|${series.stack_id}|${series.processing_version}`;
                    return <option key={key} value={key}>{series.aoi_id} · {series.stack_id} · {series.processing_version}</option>;
                  })}
                </select>
              </label>
              <label>{es ? "Horizonte (días)" : "Horizon (days)"}<input name="horizon_days" type="number" defaultValue="24" min="1" max="365" /></label>
            </div>
            {matchedAois.length > 0 && !losSeriesResultMatchesPoint && modelTools === "enabled" && <p className="zone-muted">{es ? "Buscando series LOS reales con al menos 5 observaciones y validez ≥ 50 %…" : "Finding real LOS series with at least 5 observations and ≥ 50% validity…"}</p>}
            {modelTools === "enabled" && !matchedAois.length && <p className="zone-muted">{es ? "No hay una huella NISAR registrada que cubra este punto." : "No registered NISAR footprint covers this point."}</p>}
            {losSeriesResultMatchesPoint && losSeriesResult?.unavailable && <p className="zone-muted">{es ? "No fue posible consultar las series LOS." : "Unable to load LOS series."}</p>}
            {losSeriesResultMatchesPoint && !losSeriesResult?.unavailable && !eligibleLosSeries.length && <p className="zone-muted">{matchedAois.length ? (es ? "No hay series LOS reales elegibles guardadas para este punto. No se genera un pronóstico sin observaciones suficientes." : "No eligible real LOS series are stored for this point. A forecast is not generated without sufficient observations.") : (es ? "No hay una huella NISAR registrada que cubra este punto." : "No registered NISAR footprint covers this point.")}</p>}
            {selectedLosSeries && <>
              <input type="hidden" name="aoi_id" value={selectedLosSeries.aoi_id} />
              <input type="hidden" name="stack_id" value={selectedLosSeries.stack_id} />
              <input type="hidden" name="processing_version" value={selectedLosSeries.processing_version} />
              <input type="hidden" name="min_valid_fraction" value="0.5" />
              <input type="hidden" name="min_train_observations" value="5" />
              <p className="zone-muted">{numberText(selectedLosSeries.valid_observation_count, lang, 0)} {es ? "observaciones válidas" : "valid observations"} · {dateText(selectedLosSeries.first_valid_date, lang)} – {dateText(selectedLosSeries.last_valid_date, lang)} · {es ? "validez máxima" : "best validity"}: {numberText(selectedLosSeries.best_valid_fraction * 100, lang)}%</p>
            </>}
            <button type="button" className="backend-secondary" onClick={() => void inspectCheckpoint()} disabled={checkingCheckpoint || !selectedLosSeries}>{checkingCheckpoint ? (es ? "Consultando…" : "Checking…") : (es ? "Consultar observaciones LOS" : "Check LOS observations")}</button>
            {checkpoint && <p className="backend-checkpoint">{numberText(checkpoint.observation_count, lang, 0)} {es ? "observaciones reales guardadas" : "stored real observations"} · {es ? "última fecha" : "latest date"}: {dateText(checkpoint.last_processed_date, lang)}</p>}
            {checkpointError && <p className="zone-muted">{checkpointError}</p>}
          </>}
          <button type="submit" disabled={running || (action === "analysis" && (!modelCapabilities?.composite_ready || !selectedFrame || !supportedTracksForPoint.length)) || (action === "prediction" && !modelCapabilities?.unet_ready) || (action === "forecast" && !selectedLosSeries)}>{running ? (es ? "Procesando…" : "Processing…") : (es ? "Ejecutar en el backend" : "Run on backend")}</button>
        </form>
        {formError && <p className="zone-muted">{formError}</p>}
        {result && <ModelResult action={result.action} data={result.data} lang={lang} />}
        <button type="button" className="backend-secondary" onClick={() => void lockModelTools()}>{es ? "Bloquear herramientas" : "Lock tools"}</button>
      </>}
    </details>
  </section>;
}

function RasterSeriesChart({ series, options, lang, onChange }: { series: NisarSeries; options: NisarSeries[]; lang: Lang; onChange: (key: string) => void }) {
  const es = lang === "es";
  const points = series.points
    .filter((point) => point.date && typeof point.mean === "number" && Number.isFinite(point.mean))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-24);
  const min = points.length ? Math.min(...points.map((point) => point.mean!)) : 0;
  const max = points.length ? Math.max(...points.map((point) => point.mean!)) : 0;
  const span = max - min || 1;
  const coordinates = points.map((point, index) => {
    const x = points.length === 1 ? 150 : 12 + (index * 276) / (points.length - 1);
    const y = 76 - ((point.mean! - min) / span) * 60;
    return `${x},${y}`;
  });
  const currentKey = `${series.aoi}|${series.variable}`;
  return <div className="backend-raster-series">
    <label>{es ? "Serie estadística por pasada" : "Raster summary series by pass"}
      <select value={currentKey} onChange={(event) => onChange(event.target.value)}>
        {options.map((item) => <option key={`${item.aoi}|${item.variable}`} value={`${item.aoi}|${item.variable}`}>{item.aoi} · {variableLabel(item.variable, es)}</option>)}
      </select>
    </label>
    {points.length > 0 ? <>
      <svg viewBox="0 0 300 92" role="img" aria-label={`${variableLabel(series.variable, es)} ${es ? "media raster por fecha" : "raster mean over time"}`}>
        <path d="M12 16H288M12 46H288M12 76H288" />
        {points.length > 1 && <polyline points={coordinates.join(" ")} />}
        {points.map((point, index) => {
          const [cx, cy] = coordinates[index].split(",");
          return <circle key={`${point.date}-${point.granule}`} cx={cx} cy={cy} r="2.6"><title>{`${dateText(point.date, lang)}: ${numberText(point.mean, lang)} ${series.units ?? ""}`}</title></circle>;
        })}
      </svg>
      <div><span>{dateText(points[0].date, lang)}</span><b>{es ? "Media raster" : "Raster mean"}: {numberText(points.at(-1)?.mean, lang)} {series.units ?? ""}</b><span>{dateText(points.at(-1)?.date, lang)}</span></div>
      <small>{es ? "Resumen de la huella/AOI, no una serie LOS medida exactamente en el marcador." : "Summary for the footprint/AOI, not a LOS series measured exactly at the marker."}</small>
    </> : <p className="zone-muted">{es ? "No hay valores de media con fecha para graficar." : "No dated mean values are available to chart."}</p>}
  </div>;
}

function ModelResult({ action, data, lang }: { action: string; data: JsonRecord; lang: Lang }) {
  const es = lang === "es";
  if (action === "analysis") {
    const impacts = data.estimated_historical_impacts as JsonRecord | undefined;
    return <div className="backend-result-card">
      <b>{es ? "Cribado exploratorio completado" : "Exploratory screening complete"} · {String(data.priority ?? "—")}</b>
      <div className="backend-result-metrics">
        <span>{es ? "Índice de anomalía" : "Anomaly index"}<b>{numberText(data.anomaly_index, lang)} / 100</b></span>
        <span>{es ? "Fracción con cambio" : "Changed fraction"}<b>{numberText(typeof data.changed_fraction === "number" ? data.changed_fraction * 100 : null, lang, 2)}%</b></span>
        <span>{es ? "Percentil histórico" : "Historical percentile"}<b>{numberText(data.impact_percentile, lang)}</b></span>
      </div>
      <MaskPreview value={data.anomaly_mask} title={es ? "Máscara exploratoria de anomalía" : "Exploratory anomaly mask"} />
      {impacts && <div className="backend-impact-list">{Object.entries(impacts).map(([name, value]) => <span key={name}>{name.replaceAll("_", " ")} <b>{numberText(value, lang)}</b></span>)}</div>}
      {typeof data.recommendation === "string" && <p>{data.recommendation}</p>}
      <small>{es ? "Priorización relativa para revisión; no es una probabilidad, alerta ni impacto medido del evento." : "Relative prioritization for review; not a probability, alert, or measured event impact."}</small>
    </div>;
  }
  if (action === "prediction") return <div className="backend-result-card">
    <b>{es ? "Predicción U-Net completada" : "U-Net prediction complete"}</b>
    <div className="backend-result-metrics">
      <span>{es ? "Área marcada" : "Area flagged"}<b>{numberText(typeof data.changed_fraction === "number" ? data.changed_fraction * 100 : null, lang, 2)}%</b></span>
      <span>{es ? "Umbral" : "Threshold"}<b>{numberText(data.threshold, lang, 2)}</b></span>
      <span>{es ? "Dimensiones" : "Dimensions"}<b>{String(data.width ?? "—")} × {String(data.height ?? "—")}</b></span>
    </div>
    <MaskPreview value={data.mask} title={es ? "Máscara de cambio del modelo" : "Model change mask"} />
    <small>{es ? "Vista de píxeles de la máscara, todavía sin alineación geográfica sobre el mapa. Es una salida del modelo sobre el par entregado y requiere validación antes de interpretarse como afectación." : "Pixel preview of the mask; it is not yet georeferenced on the map. This model output for the supplied pair requires validation before it is interpreted as an impact."}</small>
  </div>;

  const forecast = data.forecast as JsonRecord | undefined;
  const model = data.model as JsonRecord | undefined;
  const backtest = data.backtest as JsonRecord | undefined;
  const quality = data.quality as JsonRecord | undefined;
  const trend = backtest?.robust_linear_trend as JsonRecord | undefined;
  const persistence = backtest?.persistence as JsonRecord | undefined;
  const origins = Array.isArray(backtest?.origins) ? backtest.origins as JsonRecord[] : [];
  const chartPoints = origins.filter((origin) => typeof origin.actual_los_mm === "number" && typeof origin.trend_prediction_mm === "number").slice(-12);
  const chartValues = chartPoints.flatMap((origin) => [Number(origin.actual_los_mm), Number(origin.trend_prediction_mm)]);
  const chartMin = chartValues.length ? Math.min(...chartValues) : 0;
  const chartMax = chartValues.length ? Math.max(...chartValues) : 1;
  const chartSpan = chartMax - chartMin || 1;
  const chartX = (index: number) => chartPoints.length < 2 ? 150 : 12 + index * 276 / (chartPoints.length - 1);
  const chartY = (value: number) => 78 - ((value - chartMin) / chartSpan) * 62;
  return <div className="backend-result-card">
    <b>{es ? "Pronóstico LOS exploratorio" : "Exploratory LOS forecast"}</b>
    <div className="backend-result-metrics">
      <span>{es ? "LOS estimado" : "Estimated LOS"}<b>{numberText(forecast?.los_mm, lang)} mm</b></span>
      <span>{es ? "Fecha objetivo" : "Target date"}<b>{dateText(forecast?.target_date, lang)}</b></span>
      <span>{es ? "Pendiente" : "Slope"}<b>{numberText(model?.slope_mm_per_day, lang, 4)} mm/día</b></span>
      <span>{es ? "MAE tendencia" : "Trend MAE"}<b>{numberText(trend?.mae_mm, lang)} mm</b></span>
      <span>{es ? "MAE persistencia" : "Persistence MAE"}<b>{numberText(persistence?.mae_mm, lang)} mm</b></span>
      <span>{es ? "Objetivos independientes" : "Independent targets"}<b>{numberText(backtest?.unique_target_count, lang, 0)}</b></span>
    </div>
    {chartPoints.length > 1 && <figure className="backend-forecast-chart">
      <svg viewBox="0 0 300 92" role="img" aria-label={es ? "Backtest LOS: valores reales y tendencia estimada" : "LOS backtest: actual values and trend estimates"}>
        <path d="M12 16H288M12 47H288M12 78H288" />
        <polyline className="backend-forecast-actual" points={chartPoints.map((origin, index) => `${chartX(index)},${chartY(Number(origin.actual_los_mm))}`).join(" ")} />
        <polyline className="backend-forecast-trend" points={chartPoints.map((origin, index) => `${chartX(index)},${chartY(Number(origin.trend_prediction_mm))}`).join(" ")} />
        {chartPoints.map((origin, index) => <circle key={`${origin.target_date}-${index}`} cx={chartX(index)} cy={chartY(Number(origin.actual_los_mm))} r="2.5"><title>{`${dateText(origin.target_date, lang)} · ${numberText(origin.actual_los_mm, lang)} mm`}</title></circle>)}
      </svg>
      <figcaption><span>{es ? "Observado" : "Observed"}</span><span>{es ? "Tendencia del backtest" : "Backtest trend"}</span></figcaption>
      <small>{es ? "Comparación de objetivos históricos del backtest; la última fecha no es una observación futura." : "Historical backtest targets; the latest date is not a future observation."}</small>
    </figure>}
    <p>{es ? "Estado" : "Status"}: {String(data.status ?? "—")} · {es ? "intervalo de confianza" : "confidence interval"}: {String(quality?.confidence_interval_status ?? "—")} · {es ? "fiabilidad" : "reliability"}: {String(quality?.reliability_status ?? "—")}</p>
    <small>{typeof quality?.reliability_note === "string" ? quality.reliability_note : ""}</small>
    <small>{es ? "Extrapolación de LOS con backtest; no es un pronóstico de deslizamiento ni una alerta operativa." : "LOS extrapolation with backtest; not a landslide forecast or operational alert."}</small>
  </div>;
}
