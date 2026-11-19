import { connection } from "next/server";

export async function GET() {
  await connection();
  const base = process.env.SAROS_INTERNAL_API_URL || process.env.NEXT_PUBLIC_SAROS_API;
  if (!base) return Response.json({ error: "data_api_not_configured" }, { status: 503 });
  try {
    const [datasets, manifest] = await Promise.all([
      fetch(`${base.replace(/\/$/, "")}/api/v1/datasets`, { cache: "no-store", signal: AbortSignal.timeout(12000) }),
      fetch(`${base.replace(/\/$/, "")}/api/v1/manifest`, { cache: "no-store", signal: AbortSignal.timeout(12000) }),
    ]);
    const [datasetBody, manifestBody] = await Promise.all([datasets.text(), manifest.text()]);
    if (!datasets.ok) return new Response(datasetBody, { status: datasets.status, headers: { "Content-Type": "application/json" } });
    return Response.json({ datasets: JSON.parse(datasetBody), manifest: manifest.ok ? JSON.parse(manifestBody) : null });
  } catch {
    return Response.json({ error: "data_api_unavailable" }, { status: 503 });
  }
}
