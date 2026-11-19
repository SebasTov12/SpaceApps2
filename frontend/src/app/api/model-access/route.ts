import { connection } from "next/server";
import {
  clearSessionCookie,
  createModelSession,
  modelAccessConfigured,
  sameOriginRequest,
  sessionCookie,
  verifyModelAccessKey,
} from "@/lib/model-access";

const noStore = { "Cache-Control": "no-store" };
const attempts = new Map<string, { startedAt: number; count: number }>();

function allowAttempt(request: Request) {
  const client = request.headers.get("x-real-ip")?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
  const now = Date.now();
  const previous = attempts.get(client);
  if (!previous || now - previous.startedAt >= 60_000) attempts.set(client, { startedAt: now, count: 1 });
  else if (previous.count >= 5) return false;
  else previous.count++;
  if (attempts.size > 500) {
    for (const [key, window] of attempts) if (now - window.startedAt >= 60_000) attempts.delete(key);
  }
  return true;
}

export async function POST(request: Request) {
  await connection();
  if (!sameOriginRequest(request)) return Response.json({ error: "same_origin_request_required" }, { status: 403, headers: noStore });
  if (!modelAccessConfigured()) return Response.json({ error: "model_access_not_configured" }, { status: 503, headers: noStore });
  if (!allowAttempt(request)) return Response.json({ error: "login_rate_limited" }, { status: 429, headers: noStore });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(contentLength) || contentLength < 1 || contentLength > 2048) return Response.json({ error: "invalid_login_request_size" }, { status: 413, headers: noStore });
  const body = await request.json().catch(() => null) as { accessKey?: unknown } | null;
  if (!body || typeof body.accessKey !== "string" || !verifyModelAccessKey(body.accessKey)) {
    return Response.json({ error: "invalid_access_key" }, { status: 401, headers: noStore });
  }
  return Response.json({ authorized: true }, {
    headers: { ...noStore, "Set-Cookie": sessionCookie(createModelSession(), request) },
  });
}

export async function DELETE(request: Request) {
  await connection();
  if (!sameOriginRequest(request)) return Response.json({ error: "same_origin_request_required" }, { status: 403, headers: noStore });
  return Response.json({ authorized: false }, { headers: { ...noStore, "Set-Cookie": clearSessionCookie(request) } });
}
