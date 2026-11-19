import { createHmac, timingSafeEqual } from "node:crypto";

export const MODEL_SESSION_COOKIE = "saros_model_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;

function signature(expiresAt: string, secret: string) {
  return createHmac("sha256", secret).update(`saros-model-session:${expiresAt}`).digest("base64url");
}

export function modelAccessConfigured() {
  return (process.env.SAROS_MODEL_TOOLS_ACCESS_KEY?.length ?? 0) >= 24
    && (process.env.SAROS_MODEL_TOOLS_SESSION_SECRET?.length ?? 0) >= 32;
}

export function verifyModelAccessKey(candidate: string) {
  const expected = process.env.SAROS_MODEL_TOOLS_ACCESS_KEY;
  if (!expected || !candidate || candidate.length > 256) return false;
  const actualBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function createModelSession(now = Date.now()) {
  const secret = process.env.SAROS_MODEL_TOOLS_SESSION_SECRET;
  if (!secret) throw new Error("model_session_secret_missing");
  const expiresAt = String(Math.floor(now / 1000) + SESSION_TTL_SECONDS);
  return `${expiresAt}.${signature(expiresAt, secret)}`;
}

export function isModelSessionValid(cookieHeader: string | null, now = Date.now()) {
  const secret = process.env.SAROS_MODEL_TOOLS_SESSION_SECRET;
  if (!secret || !cookieHeader) return false;
  const cookie = cookieHeader.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${MODEL_SESSION_COOKIE}=`));
  if (!cookie) return false;
  let token: string;
  try { token = decodeURIComponent(cookie.slice(MODEL_SESSION_COOKIE.length + 1)); }
  catch { return false; }
  const [expiresAt, supplied, extra] = token.split(".");
  if (extra || !/^\d{10}$/.test(expiresAt) || Number(expiresAt) <= Math.floor(now / 1000) || !supplied) return false;
  const expected = Buffer.from(signature(expiresAt, secret));
  const actual = Buffer.from(supplied);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function sameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || request.headers.get("host");
    const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || requestUrl.protocol.replace(":", "");
    return originUrl.origin === requestUrl.origin || Boolean(host && originUrl.origin === `${protocol}://${host}`);
  } catch { return false; }
}

export function sessionCookie(value: string, request: Request) {
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const secure = new URL(request.url).protocol === "https:" || forwardedProtocol === "https";
  return `${MODEL_SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}${secure ? "; Secure" : ""}`;
}

export function clearSessionCookie(request: Request) {
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const secure = new URL(request.url).protocol === "https:" || forwardedProtocol === "https";
  return `${MODEL_SESSION_COOKIE}=; Path=/api; HttpOnly; SameSite=Strict; Max-Age=0${secure ? "; Secure" : ""}`;
}
