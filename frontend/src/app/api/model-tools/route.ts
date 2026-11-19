import { connection } from "next/server";
import { isModelSessionValid, modelAccessConfigured, sameOriginRequest } from "@/lib/model-access";

const noStore = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: noStore });
const MAX_UPLOAD_BYTES = 32 * 1024 * 1024;
const ACTIONS_PER_MINUTE = 4;
const READS_PER_MINUTE = 30;
const actionWindows = new Map<string, { startedAt: number; count: number }>();

function available() {
  if (process.env.SAROS_ENABLE_MODEL_ACTIONS !== "true") return { enabled: false, reason: "disabled" };
  if (!process.env.SAROS_INTERNAL_API_URL || !process.env.SAROS_PREDICTION_TOKEN || !modelAccessConfigured()) {
    return { enabled: false, reason: "not_configured" };
  }
  return { enabled: true, reason: "ready" };
}

function allowRequest(request: Request, limit: number, bucket: "read" | "action") {
  const client = request.headers.get("x-real-ip")?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
  const key = `${bucket}:${client}`;
  const now = Date.now();
  const previous = actionWindows.get(key);
  if (!previous || now - previous.startedAt >= 60_000) actionWindows.set(key, { startedAt: now, count: 1 });
  else if (previous.count >= limit) return false;
  else previous.count++;
  if (actionWindows.size > 500) {
    for (const [key, window] of actionWindows) if (now - window.startedAt >= 60_000) actionWindows.delete(key);
  }
  return true;
}

function authorized(request: Request) {
  return isModelSessionValid(request.headers.get("cookie"));
}

async function proxyJson(response: Response, stripProbability = false) {
  const text = await response.text();
  if (!stripProbability || !response.ok) {
    return new Response(text, { status: response.status, headers: { "Content-Type": "application/json", ...noStore } });
  }
  try {
    const body: unknown = JSON.parse(text);
    if (typeof body === "object" && body !== null && !Array.isArray(body)) delete (body as Record<string, unknown>).probability;
    return json(body, response.status);
  } catch {
    return new Response(text, { status: response.status, headers: { "Content-Type": "application/json", ...noStore } });
  }
}

export async function GET(request: Request) {
  await connection();
  const status = available();
  const url = new URL(request.url);
  const hasQuery = [...url.searchParams.keys()].length > 0;
  if (!hasQuery) return json({ ...status, authorized: status.enabled && authorized(request) });
  if (!status.enabled) return json({ error: status.reason === "disabled" ? "model_actions_disabled" : "model_tools_not_configured" }, 503);
  if (!authorized(request)) return json({ error: "model_access_required" }, 401);
  if (!allowRequest(request, READS_PER_MINUTE, "read")) return json({ error: "model_read_rate_limited" }, 429);

  const base = process.env.SAROS_INTERNAL_API_URL!;
  const token = process.env.SAROS_PREDICTION_TOKEN!;
  const headers = { Authorization: `Bearer ${token}` };
  try {
    if (url.searchParams.get("status") === "1") {
      const upstream = await fetch(`${base.replace(/\/$/, "")}/api/v1/models/status`, {
        headers, cache: "no-store", signal: AbortSignal.timeout(10_000),
      });
      return proxyJson(upstream);
    }
    if (url.searchParams.get("series") === "1") {
      const aois = url.searchParams.getAll("aoi_id").map((aoi) => aoi.trim()).filter(Boolean);
      if (aois.length > 50 || aois.some((aoi) => aoi.length > 120)) return json({ error: "invalid_aoi_id" }, 400);
      const query = new URLSearchParams({ min_valid_fraction: "0.5", min_observations: "5" });
      for (const aoi of aois) query.append("aoi_id", aoi);
      const upstream = await fetch(`${base.replace(/\/$/, "")}/api/v1/nisar/observations/series?${query}`, {
        headers, cache: "no-store", signal: AbortSignal.timeout(15_000),
      });
      return proxyJson(upstream);
    }

    const aoi = url.searchParams.get("aoi_id")?.trim() ?? "";
    const stack = url.searchParams.get("stack_id")?.trim() ?? "";
    const version = url.searchParams.get("processing_version")?.trim() ?? "";
    if (![aoi, stack, version].every((value) => value.length > 0 && value.length <= 120)) return json({ error: "invalid_series_identifiers" }, 400);
    const query = new URLSearchParams({ aoi_id: aoi, stack_id: stack, processing_version: version });
    const upstream = await fetch(`${base.replace(/\/$/, "")}/api/v1/nisar/observations/checkpoint?${query}`, {
      headers, cache: "no-store", signal: AbortSignal.timeout(15_000),
    });
    return proxyJson(upstream);
  } catch { return json({ error: "model_backend_unavailable" }, 503); }
}

export async function POST(request: Request) {
  await connection();
  const status = available();
  if (!status.enabled) return json({ error: status.reason === "disabled" ? "model_actions_disabled" : "model_tools_not_configured" }, 503);
  if (!sameOriginRequest(request)) return json({ error: "same_origin_request_required" }, 403);
  if (!authorized(request)) return json({ error: "model_access_required" }, 401);
  const rawContentLength = request.headers.get("content-length");
  const contentLength = Number(rawContentLength ?? 0);
  if (!rawContentLength || !Number.isFinite(contentLength) || contentLength < 1) return json({ error: "content_length_required" }, 411);
  if (contentLength > MAX_UPLOAD_BYTES + 128 * 1024) return json({ error: "upload_exceeds_32mb_limit" }, 413);
  if (!allowRequest(request, ACTIONS_PER_MINUTE, "action")) return json({ error: "model_action_rate_limited" }, 429);

  const form = await request.formData().catch(() => null);
  if (!form) return json({ error: "expected_multipart_form" }, 400);
  const action = String(form.get("action") ?? "");
  const base = process.env.SAROS_INTERNAL_API_URL!;
  const token = process.env.SAROS_PREDICTION_TOKEN!;
  const headers = { Authorization: `Bearer ${token}` };

  try {
    if (action === "analysis" || action === "prediction") {
      const file = form.get("file");
      if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".npz") || file.size < 1 || file.size > MAX_UPLOAD_BYTES) return json({ error: "expected_npz_file_under_32mb" }, 400);
      let route = "/api/v1/predictions";
      if (action === "analysis") {
        const params = new URLSearchParams();
        for (const key of ["track_id", "municipality", "department"] as const) {
          const value = String(form.get(key) ?? "").trim();
          if (!value || value.length > 100) return json({ error: "analysis_context_required" }, 400);
          params.set(key, value);
        }
        route = `/api/v1/analysis?${params}`;
      }
      const upstream = await fetch(`${base.replace(/\/$/, "")}${route}`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/octet-stream" },
        body: await file.arrayBuffer(), cache: "no-store", signal: AbortSignal.timeout(120_000),
      });
      return proxyJson(upstream, action === "prediction");
    }

    if (action === "forecast") {
      const body: Record<string, string | number> = {};
      for (const key of ["aoi_id", "stack_id", "processing_version"] as const) {
        const value = String(form.get(key) ?? "").trim();
        if (!value || value.length > 120) return json({ error: "forecast_series_identifiers_required" }, 400);
        body[key] = value;
      }
      const numeric: Record<string, { min: number; max: number }> = {
        horizon_days: { min: 1, max: 365 }, tolerance_days: { min: 0, max: 365 },
        min_train_observations: { min: 3, max: 1000 }, min_valid_fraction: { min: 0, max: 1 },
      };
      for (const [key, limits] of Object.entries(numeric)) {
        const raw = form.get(key);
        if (raw === null || raw === "") continue;
        const value = Number(raw);
        if (!Number.isFinite(value) || value < limits.min || value > limits.max) return json({ error: `invalid_${key}` }, 400);
        body[key] = value;
      }
      const upstream = await fetch(`${base.replace(/\/$/, "")}/api/v1/nisar/forecasts/run`, {
        method: "POST", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(120_000),
      });
      return proxyJson(upstream);
    }
    return json({ error: "unsupported_model_action" }, 400);
  } catch { return json({ error: "model_backend_unavailable" }, 503); }
}
