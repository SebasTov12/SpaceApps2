import { connection } from "next/server";

const validCode = (value: string | null) => Boolean(value && /^\d{2}$/.test(value));

export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  const department = url.searchParams.get("department");
  const divipola = url.searchParams.get("divipola");
  const year = url.searchParams.get("year");
  const resource = url.searchParams.get("resource");
  const base = process.env.SAROS_INTERNAL_API_URL || process.env.NEXT_PUBLIC_SAROS_API;
  if (!base) return Response.json({ error: "territorial_api_not_configured" }, { status: 503 });
  let path: string;
  if (resource === "municipalities" && (!department || validCode(department))) {
    path = `/api/v1/territorial/municipalities${department ? `?department=${department}` : ""}`;
  } else if (resource === "municipality" && divipola && /^\d{5}$/.test(divipola)) {
    path = `/api/v1/territorial/municipalities/${divipola}`;
  } else if (resource === "agriculture" && divipola && /^\d{5}$/.test(divipola) && (!year || /^\d{4}$/.test(year))) {
    path = `/api/v1/territorial/agriculture?divipola=${divipola}${year ? `&year=${year}` : ""}`;
  } else return Response.json({ error: "invalid_territorial_query" }, { status: 400 });
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}${path}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    return new Response(await response.text(), { status: response.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "territorial_api_unavailable" }, { status: 503 });
  }
}
