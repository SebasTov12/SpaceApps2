import { connection } from "next/server";

// Puntos del planeta con los registros reales de amenazas de la base (vía el backend Flask).
// En el servidor se usa la red interna; así funciona igual en local y sin depender de CORS.
let cache: { at: number; body: string; status: number } | null = null;
const TTL = 2 * 60 * 1000;

export async function GET() {
  await connection(); // siempre en el momento de la petición, nunca prerenderizado
  if (cache && Date.now() - cache.at < TTL) {
    return new Response(cache.body, { status: cache.status, headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" } });
  }
  const base = process.env.SAROS_INTERNAL_API_URL || process.env.NEXT_PUBLIC_SAROS_API;
  if (!base) return Response.json({ points: [], error: "hazard_api_not_configured" }, { status: 503 });
  try {
    const upstream = await fetch(`${base.replace(/\/$/, "")}/api/v1/hazards/points`, { cache: "no-store", signal: AbortSignal.timeout(30000) });
    const body = await upstream.text();
    if (upstream.ok) cache = { at: Date.now(), body, status: 200 };
    return new Response(body, { status: upstream.status, headers: { "Content-Type": "application/json", "Cache-Control": upstream.ok ? "public, max-age=60" : "no-store" } });
  } catch {
    return Response.json({ points: [], error: "hazard_api_unavailable" }, { status: 503 });
  }
}
