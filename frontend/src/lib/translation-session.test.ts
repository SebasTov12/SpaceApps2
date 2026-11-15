import assert from "node:assert/strict";
import { test } from "node:test";
import { clearTranslationCookies, translationSession } from "./translation-session";

test("clears stale translator cookies on production parent domains and route paths", () => {
  const writes: string[] = [];
  const target = { set cookie(value: string) { writes.push(value); } };
  clearTranslationCookies(target, "app.tobaru.xyz", "/explorer/region");
  for (const domain of ["", "; domain=app.tobaru.xyz", "; domain=.app.tobaru.xyz", "; domain=tobaru.xyz", "; domain=.tobaru.xyz"]) {
    for (const path of ["/", "/explorer", "/explorer/", "/explorer/region", "/explorer/region/"]) {
      assert.ok(writes.includes(`googtrans=; Max-Age=0; path=${path}${domain}`));
    }
  }
  assert.ok(!writes.some((value) => /domain=\.?xyz$/.test(value)));
});

test("also clears host-only cookies on localhost without touching unrelated cookies", () => {
  const writes: string[] = [];
  clearTranslationCookies({ set cookie(value: string) { writes.push(value); } }, "localhost", "/");
  assert.ok(writes.includes("googtrans=; Max-Age=0; path=/"));
  assert.ok(writes.every((value) => value.startsWith("googtrans=;")));
});

test("pending Korean retries cannot change a page after returning to Spanish", (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let locale = "ko";
  let applications = 0;
  const session = translationSession(locale, () => locale);
  session.schedule(() => applications++, 250);
  session.schedule(() => applications++, 500);
  locale = "es";
  context.mock.timers.tick(1000);
  assert.equal(applications, 0);
  assert.equal(session.active(), false);
  session.dispose();
});

test("cleanup cancels retries even if the same language is selected again", (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  let applications = 0;
  const session = translationSession("fr", () => "fr");
  session.schedule(() => applications++, 250);
  context.mock.timers.tick(250);
  assert.equal(applications, 1);
  session.schedule(() => applications++, 500);
  session.dispose();
  session.schedule(() => applications++, 500);
  context.mock.timers.tick(1000);
  assert.equal(applications, 1);
});
