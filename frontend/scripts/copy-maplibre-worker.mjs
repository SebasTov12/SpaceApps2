// MapLibre 6 carga su worker como módulo aparte; webpack no lo empaqueta,
// así que lo copiamos a public/ antes de dev y build (ver nisar-map.tsx).
import { copyFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve("maplibre-gl/package.json"));
copyFileSync(join(dist, "dist", "maplibre-gl-worker.mjs"), join(import.meta.dirname, "..", "public", "maplibre-gl-worker.mjs"));
console.log("maplibre-gl-worker.mjs copiado a public/");
