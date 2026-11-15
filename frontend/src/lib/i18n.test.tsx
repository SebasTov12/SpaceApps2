import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProtectedTerms } from "./i18n";

test("Saru and mission names remain protected, including spaces used by subtitles and speech", () => {
  const text = "Soy Saru, el explorador de SAROS. Observo con NISAR y NASA. Uso InSAR, ASF y DAAC.";
  const html = renderToStaticMarkup(createElement(ProtectedTerms, { text }));
  assert.equal(html.replace(/<[^>]+>/g, ""), text);
  for (const term of ["Saru", "SAROS", "NISAR", "NASA", "InSAR", "ASF", "DAAC"]) {
    assert.match(html, new RegExp(`<span[^>]*translate="no"[^>]*> ${term}\\s*</span>`));
  }
});
