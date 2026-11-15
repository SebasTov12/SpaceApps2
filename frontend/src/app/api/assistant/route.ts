// Con cacheComponents las rutas POST ya son dinámicas y usan Node: no hace falta declarar runtime ni dynamic.

const requestTimes = new Map<string, number[]>();

export async function POST(request: Request) {
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const recent = (requestTimes.get(address) || []).filter((time) => now - time < 60_000);
  if (recent.length >= 10) return Response.json({ error: "assistant_rate_limited" }, { status: 429 });
  recent.push(now);
  requestTimes.set(address, recent);
  if (requestTimes.size > 5000) requestTimes.clear();
  const apiUrl = process.env.SAROS_INTERNAL_API_URL;
  const token = process.env.SAROS_ASSISTANT_TOKEN;
  if (!apiUrl || !token) {
    return Response.json({ error: "assistant_proxy_not_configured" }, { status: 503 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (JSON.stringify(body).length > 15000) {
    return Response.json({ error: "request_too_large" }, { status: 413 });
  }
  try {
    const upstream = await fetch(`${apiUrl.replace(/\/$/, "")}/api/v1/assistant/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(40000),
    });
    const payload = await upstream.json().catch(() => ({ error: "invalid_backend_response" }));
    return Response.json(payload, { status: upstream.status });
  } catch {
    return Response.json({ error: "assistant_backend_unavailable" }, { status: 503 });
  }
}
