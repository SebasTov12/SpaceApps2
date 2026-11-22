import assert from "node:assert/strict";
import { test } from "node:test";
import { demoAssessments } from "./socioeconomic";
import { loadAssessment, parseAssessment } from "./territorial-api";

test("accepts demo contract and rejects malformed, mismatched and unsafe numerical data", () => {
  const data = demoAssessments[0];
  assert.equal(parseAssessment(data, data.zoneId), data);
  for (const bad of [null, {}, { ...data, zoneId: "other" }, { ...data, population: -1 }, { ...data, homes: Infinity }, { ...data, risk: { level: "critical" } }, { ...data, historicalImpacts: [{}] }, { ...data, alerts: [{}] }, { ...data, forecast: {} }]) {
    assert.throws(() => parseAssessment(bad, data.zoneId));
  }
});

test("API supports empty results, HTTP errors and invalid payloads without demo fallback", async () => {
  const originalFetch = globalThis.fetch;
  const originalBase = process.env.NEXT_PUBLIC_SAROS_API;
  const data = demoAssessments[0];
  const lat = 6.2;
  const lon = -72.4;
  const signal = () => new AbortController().signal;
  try {
    process.env.NEXT_PUBLIC_SAROS_API = "https://example.test";
    globalThis.fetch = async (url) => {
      assert.equal(url, `https://example.test/api/v1/regions/${data.zoneId}/assessment?lat=${lat}&lon=${lon}`);
      return Response.json(data);
    };
    assert.equal((await loadAssessment(data.zoneId, lat, lon, signal()))?.zoneId, data.zoneId);
    globalThis.fetch = async () => new Response(null, { status: 404 });
    assert.equal(await loadAssessment(data.zoneId, lat, lon, signal()), null);
    globalThis.fetch = async () => new Response(null, { status: 503 });
    await assert.rejects(loadAssessment(data.zoneId, lat, lon, signal()));
    globalThis.fetch = async () => Response.json({ zoneId: "wrong" });
    await assert.rejects(loadAssessment(data.zoneId, lat, lon, signal()));
    delete process.env.NEXT_PUBLIC_SAROS_API;
    assert.equal(await loadAssessment(data.zoneId, lat, lon, signal()), data);
    assert.equal(await loadAssessment("unknown", lat, lon, signal()), null);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalBase === undefined) delete process.env.NEXT_PUBLIC_SAROS_API;
    else process.env.NEXT_PUBLIC_SAROS_API = originalBase;
  }
});
