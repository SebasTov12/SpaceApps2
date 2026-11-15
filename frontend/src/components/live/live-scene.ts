/**
 * «Zona viva»: escena three.js sobre el relieve 3D de MapLibre (capa personalizada).
 *
 * Lo medido por NISAR mueve el terreno (lámina de datos que se hunde, se infla o se colorea pase a pase,
 * árboles que caen en la celda y la fecha en que el radar detectó la tala, agua que cubre o deja las
 * celdas que el radar ve como agua). Lo ilustrativo (partículas de tierra, vapor, humo, chispas) solo
 * acompaña y la interfaz lo marca como ilustración.
 */
import * as THREE from "three";
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from "maplibre-gl";
import { DB, bboxSize, fieldAt, peakOf, sampleField, strongestCell, type LiveInput } from "./live-data";

/** Reloj compartido entre la línea de tiempo (React) y la escena (cada cuadro). */
export const liveClock = { t: 0, end: 1, playing: false, startedAt: 0, exaggeration: 1 };

type MercatorClass = {
  fromLngLat: (lngLat: [number, number], altitude?: number) => { x: number; y: number; z: number; meterInMercatorCoordinateUnits: () => number };
};

const MESH = 72; // vértices por lado de la lámina
const KIND_COLOR: Record<string, string> = {
  landslide: "#e8b36b", subsidence: "#e8805a", flood: "#4fb3ff", glacier: "#bfe9f2", deforestation: "#7fd18b",
  volcano: "#ff6a3d", earthquake: "#c084fc", wildfire: "#ff8a3d", mining: "#e0b341",
};

/** Colores de la deformación: rojo = se aleja del satélite (baja), azul = se acerca (sube). */
const DIVERGING = ["#ff2d55", "#ff6a3d", "#ffb347", "#5ef0ff", "#5aa3ff", "#3b6bff", "#7c4dff"].map((c) => new THREE.Color(c));
function diverging(v: number, out: THREE.Color) {
  const x = Math.max(0, Math.min(1, (v + 1) / 2)) * (DIVERGING.length - 1);
  const i = Math.min(DIVERGING.length - 2, Math.floor(x));
  return out.copy(DIVERGING[i]).lerp(DIVERGING[i + 1], x - i);
}

const VIOLET = new THREE.Color("#7c4dff");
const BARE = new THREE.Color("#a0632f");

const rand = (() => {
  let s = 1234567;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
})();

export function createLiveLayer(map: MapLibreMap, Mercator: MercatorClass, input: LiveInput): CustomLayerInterface {
  const [west, south, east, north] = input.bbox;
  const origin: [number, number] = [(west + east) / 2, (south + north) / 2];
  const size = bboxSize(input.bbox);
  const kind = input.kind;
  const accent = new THREE.Color(KIND_COLOR[kind] ?? "#5ef0ff");

  let renderer: THREE.WebGLRenderer | null = null;
  const camera = new THREE.Camera();
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.4);
  sun.position.set(-0.5, 0.6, 1);
  scene.add(sun);

  // ---------- posiciones locales (metros, x = este, y = norte, z = arriba respecto al origen) ----------
  const lonToX = (lon: number) => ((lon - origin[0]) / (east - west)) * size.width;
  const latToY = (lat: number) => ((lat - origin[1]) / (north - south)) * size.height;

  // relieve muestreado en la rejilla de la lámina (se refina mientras cargan las teselas)
  const ground = new Float32Array(MESH * MESH);
  const groundOk = new Uint8Array(MESH * MESH);
  let groundReady = false;
  const elevation = (lon: number, lat: number) => map.queryTerrainElevation([lon, lat]);
  const sampleGround = (all: boolean) => {
    const base = elevation(origin[0], origin[1]);
    if (base === null || base === undefined) return;
    let missing = 0;
    for (let j = 0; j < MESH; j++) for (let i = 0; i < MESH; i++) {
      const k = j * MESH + i;
      if (groundOk[k] && !all) continue;
      const e = elevation(west + (i / (MESH - 1)) * (east - west), north - (j / (MESH - 1)) * (north - south));
      if (e === null || e === undefined) { missing++; continue; }
      ground[k] = e - base;
      groundOk[k] = 1;
    }
    groundReady = missing < MESH * MESH * 0.5;
  };
  /** Altura del suelo (respecto al origen) en una posición local, interpolada. */
  const groundAt = (x: number, y: number) => {
    const gi = ((x / size.width) + 0.5) * (MESH - 1);
    const gj = (0.5 - y / size.height) * (MESH - 1);
    const i0 = Math.max(0, Math.min(MESH - 2, Math.floor(gi))), j0 = Math.max(0, Math.min(MESH - 2, Math.floor(gj)));
    const fx = Math.max(0, Math.min(1, gi - i0)), fy = Math.max(0, Math.min(1, gj - j0));
    const a = ground[j0 * MESH + i0], b = ground[j0 * MESH + i0 + 1], c = ground[(j0 + 1) * MESH + i0], d = ground[(j0 + 1) * MESH + i0 + 1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  };
  const groundOkAt = (x: number, y: number) => {
    const i = Math.round(((x / size.width) + 0.5) * (MESH - 1)), j = Math.round((0.5 - y / size.height) * (MESH - 1));
    return i >= 0 && j >= 0 && i < MESH && j < MESH && groundOk[j * MESH + i] === 1;
  };
  /** Dirección cuesta abajo (para tierra que se desliza, hielo que fluye). */
  const downhill = (x: number, y: number) => {
    const h = 60;
    const gx = groundAt(x + h, y) - groundAt(x - h, y);
    const gy = groundAt(x, y + h) - groundAt(x, y - h);
    const len = Math.hypot(gx, gy) || 1;
    return { dx: -gx / len, dy: -gy / len, slope: len / (2 * h) };
  };

  // ---------- escala vertical de lo medido ----------
  const deform = input.measured && input.change === "deformation";
  const peak = input.measured ? peakOf(input) * (deform ? input.toMeters : 1) : 0;
  const lift = Math.max(size.width, size.height) * 0.035;            // altura visual máxima de la deformación
  const exaggeration = deform && peak > 0 ? lift / peak : 1;
  liveClock.exaggeration = Math.round(exaggeration / 10) * 10;
  const strongest = input.measured ? strongestCell(input) : null;
  const measuredPeak = input.measured ? peakOf({ ...input, projection: null }) : 0;
  const fringeStep = deform && kind === "volcano" ? niceStep((peak / input.toMeters) / 4) : 0; // unidades del dato por franja

  // ---------- lámina de datos (deformación, velocidad del hielo) ----------
  const field = input.measured ? new Float32Array(input.rows * input.cols) : null;
  let sheet: THREE.Mesh | null = null;
  const sheetGeo = new THREE.PlaneGeometry(size.width, size.height, MESH - 1, MESH - 1);
  const sheetAlpha = new Float32Array(MESH * MESH);
  if (input.measured && (deform || input.change === "velocity")) {
    sheetGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(MESH * MESH * 3), 3));
    sheetGeo.setAttribute("alpha", new THREE.BufferAttribute(sheetAlpha, 1));
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `attribute vec3 color; attribute float alpha; varying vec3 vColor; varying float vAlpha; varying vec2 vUv;
        void main(){ vColor=color; vAlpha=alpha; vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; varying vec3 vColor; varying float vAlpha; varying vec2 vUv;
        void main(){
          // retícula fina: la lámina se lee como una superficie medida, no como una mancha
          vec2 g = abs(fract(vUv*36.0)-0.5); float line = smoothstep(0.47,0.5,max(g.x,g.y));
          float edge = smoothstep(0.0,0.08,vUv.x)*smoothstep(1.0,0.92,vUv.x)*smoothstep(0.0,0.08,vUv.y)*smoothstep(1.0,0.92,vUv.y);
          float strong = smoothstep(0.22,0.6,vAlpha);
          gl_FragColor = vec4(mix(vColor, vec3(1.0), line*0.45*strong), edge*min(1.0, vAlpha*0.85 + line*0.4*strong));
        }`,
    });
    sheet = new THREE.Mesh(sheetGeo, material);
    sheet.renderOrder = 2;
    scene.add(sheet);
  }

  // ---------- agua (inundación y piscinas de minería): celdas que el radar ve como agua ----------
  let water: THREE.Mesh | null = null;
  const waterAlpha = new Float32Array(MESH * MESH);
  const waterGeo = new THREE.PlaneGeometry(size.width, size.height, MESH - 1, MESH - 1);
  if (input.measured && input.change === "backscatter" && (kind === "flood" || kind === "mining")) {
    waterGeo.setAttribute("alpha", new THREE.BufferAttribute(waterAlpha, 1));
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(kind === "mining" ? "#3fc7b4" : "#3f9cff") } },
      vertexShader: `attribute float alpha; varying float vAlpha; varying vec2 vUv;
        void main(){ vAlpha=alpha; vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; uniform vec3 uColor; varying float vAlpha; varying vec2 vUv;
        void main(){
          float w = sin(vUv.x*220.0+uTime*2.2)*sin(vUv.y*180.0-uTime*1.7);
          vec3 c = uColor*(0.85+0.25*w) + vec3(0.9,0.97,1.0)*smoothstep(0.75,1.0,w)*0.35;
          gl_FragColor = vec4(c, smoothstep(0.05,0.6,vAlpha)*0.72);
        }`,
    });
    water = new THREE.Mesh(waterGeo, material);
    water.renderOrder = 3;
    scene.add(water);
  }

  // ---------- árboles (tala y minería): uno por celda con bosque al inicio; cae cuando el radar ve la pérdida ----------
  let trees: THREE.InstancedMesh | null = null;
  const treeCells: { i: number; x: number; y: number; h: number; s: number }[] = [];
  const treeFall = new Float32Array(4096);
  if (input.measured && input.change === "backscatter" && (kind === "deforestation" || kind === "mining")) {
    const first = input.frames[0];
    // más copas cerca del centro (lo que se ve al entrar), menos hacia los bordes
    const cellW = size.width / input.cols, cellH = size.height / input.rows;
    const near = 2600; // m
    for (let r = 0; r < input.rows; r++) for (let c = 0; c < input.cols; c++) {
      const i = r * input.cols + c;
      if (!input.valid[i] || first[i] <= DB.forest) continue;
      const cx = (c + 0.5) * cellW - size.width / 2, cy = size.height / 2 - (r + 0.5) * cellH;
      const dist = Math.hypot(cx, cy);
      if (dist > near * 2.2) continue; // lejos no se ve y el relieve llega con menos detalle
      const per = Math.round(Math.min(60, (cellW * cellH) / (110 * 110)) * (dist < near ? 1 : 0.25));
      for (let k = 0; k < per && treeCells.length < 7000; k++) {
        const lon = west + ((c + rand()) / input.cols) * (east - west);
        const lat = north - ((r + rand()) / input.rows) * (north - south);
        treeCells.push({ i, x: lonToX(lon), y: latToY(lat), h: 0, s: 0.75 + rand() * 0.6 });
      }
    }
    // copa vista desde arriba: icosaedro achatado (ligero y se lee como dosel)
    const geo = new THREE.IcosahedronGeometry(1, 0);
    geo.translate(0, 0, 0.6);
    trees = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: "#ffffff", flatShading: true }), treeCells.length);
    trees.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(trees);
  }
  const treeSize = 38; // m: radio de cada copa (exagerado para verse desde la vista 3D)

  // ---------- partículas ilustrativas (tierra, hielo, vapor, brasas) ----------
  const PARTICLES = 900;
  const pPos = new Float32Array(PARTICLES * 3);
  const pLife = new Float32Array(PARTICLES);
  const pVel = new Float32Array(PARTICLES * 2);
  const pAlpha = new Float32Array(PARTICLES);
  const pointsGeo = new THREE.BufferGeometry();
  pointsGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
  pointsGeo.setAttribute("alpha", new THREE.BufferAttribute(pAlpha, 1));
  const particleColor = kind === "glacier" ? "#5ef0ff" : kind === "volcano" ? "#f2f2f2" : kind === "wildfire" ? "#ffb347" : kind === "flood" ? "#bfe6ff" : "#c79a62";
  const points = new THREE.Points(pointsGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: kind === "wildfire" ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { uColor: { value: new THREE.Color(particleColor) }, uSize: { value: kind === "volcano" ? 11 : 6 } },
    vertexShader: `attribute float alpha; varying float vAlpha; uniform float uSize;
      void main(){ vAlpha=alpha; vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position=p; gl_PointSize=uSize*clamp(2.2/p.w*1000.0,0.6,2.4); }`,
    fragmentShader: `uniform vec3 uColor; varying float vAlpha;
      void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d); if(r>0.5) discard; gl_FragColor=vec4(uColor, vAlpha*smoothstep(0.5,0.15,r)); }`,
  }));
  points.renderOrder = 4;
  const wantsParticles = ["landslide", "glacier", "volcano", "wildfire"].includes(kind) || (!input.measured && kind !== "earthquake");
  if (wantsParticles) scene.add(points);

  // fuentes de las partículas: los puntos medidos más activos; sin datos, el centro de la zona
  const sources = (input.hotspots.length ? input.hotspots : [{ lat: input.center.lat, lon: input.center.lon, value: 1 }]).map((h) => ({ x: lonToX(h.lon), y: latToY(h.lat) }));
  let summit = { x: 0, y: 0 };
  const spawn = (k: number) => {
    const src = kind === "volcano" ? summit : sources[k % sources.length];
    const spread = kind === "volcano" ? 260 : kind === "glacier" ? size.width * 0.35 : input.measured ? 900 : 1600;
    const r = (spread / 2) * Math.sqrt(rand()), a = rand() * Math.PI * 2;
    pPos[k * 3] = src.x + Math.cos(a) * r;
    pPos[k * 3 + 1] = src.y + Math.sin(a) * r;
    pLife[k] = rand();
    pVel[k * 2] = (rand() - 0.5);
    pVel[k * 2 + 1] = (rand() - 0.5);
  };

  // ---------- anillos de los puntos más activos (y ondas del sismo) ----------
  const rings: THREE.Mesh[] = [];
  const ringSources = kind === "earthquake" ? [sources[0]] : sources.slice(0, 4);
  const perRing = kind === "earthquake" ? 4 : 2;
  for (let k = 0; k < ringSources.length * perRing; k++) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 64), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    ring.renderOrder = 5;
    rings.push(ring);
    scene.add(ring);
  }

  // ---------- regla del hundimiento: columna en el punto más activo ----------
  let ruler: THREE.Mesh | null = null;
  if (deform && strongest && (kind === "subsidence" || kind === "landslide")) {
    ruler = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 12, 1, true), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.55, depthWrite: false }));
    ruler.rotation.x = Math.PI / 2;
    scene.add(ruler);
  }

  const color = new THREE.Color();
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  let lastSample = 0;
  let clock0 = performance.now();

  /** Actualiza todo para el instante t de la línea de tiempo y el reloj real (s). */
  function update(t: number, seconds: number) {
    const f = field ? fieldAt(input, t, field) : null;
    const projected = input.measured && t > input.frames.length - 1;

    // lámina de deformación / velocidad
    if (sheet && f) {
      const pos = sheetGeo.attributes.position as THREE.BufferAttribute;
      const col = sheetGeo.attributes.color as THREE.BufferAttribute;
      const range = measuredPeak || 1;
      for (let j = 0; j < MESH; j++) for (let i = 0; i < MESH; i++) {
        const k = j * MESH + i;
        const lon = west + (i / (MESH - 1)) * (east - west), lat = north - (j / (MESH - 1)) * (north - south);
        const v = sampleField(input, f, lon, lat);
        const ok = Number.isFinite(v);
        const g = ground[k];
        if (deform) {
          // flota sobre el relieve y se hunde o se infla con lo medido (altura exagerada)
          pos.setZ(k, g + lift + 25 + (ok ? v * input.toMeters * exaggeration : 0));
          if (fringeStep) {
            // franjas de color: cada vuelta completa = fringeStep unidades del dato (como un interferograma)
            const phase = ok ? ((v / fringeStep) % 1 + 1) % 1 : 0;
            color.setHSL(phase, 0.85, 0.55);
          } else diverging(ok ? v / range : 0, color);
          sheetAlpha[k] = ok ? 0.06 + 0.86 * Math.min(1, Math.abs(v) / range) ** 0.7 : 0;
        } else {
          // velocidad del hielo: más claro y opaco donde fluye más rápido
          pos.setZ(k, g + 30);
          const s = ok ? Math.min(1, Math.max(0, v / range)) : 0;
          color.set("#2bd9ff").lerp(VIOLET, s);
          sheetAlpha[k] = ok ? 0.04 + 0.6 * s * s : 0;
        }
        if (projected) sheetAlpha[k] *= 0.6;
        col.setXYZ(k, color.r, color.g, color.b);
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
      (sheetGeo.attributes.alpha as THREE.BufferAttribute).needsUpdate = true;
      (sheet.material as THREE.ShaderMaterial).uniforms.uTime.value = seconds;
    }

    // agua: celdas bajo el umbral de agua del radar, con orilla suave
    if (water && f) {
      const pos = waterGeo.attributes.position as THREE.BufferAttribute;
      const first = input.frames[0];
      for (let j = 0; j < MESH; j++) for (let i = 0; i < MESH; i++) {
        const k = j * MESH + i;
        const lon = west + (i / (MESH - 1)) * (east - west), lat = north - (j / (MESH - 1)) * (north - south);
        const v = sampleField(input, f, lon, lat);
        const v0 = sampleField(input, first, lon, lat);
        let a = Number.isFinite(v) ? Math.max(0, Math.min(1, (DB.water + 2 - v) / 4)) : 0;
        if (kind === "mining" && Number.isFinite(v0) && v0 < DB.water) a = 0; // solo el agua nueva (piscinas)
        waterAlpha[k] = a;
        pos.setZ(k, ground[k] + 6 + a * (kind === "flood" ? 18 : -4));
      }
      pos.needsUpdate = true;
      (waterGeo.attributes.alpha as THREE.BufferAttribute).needsUpdate = true;
      (water.material as THREE.ShaderMaterial).uniforms.uTime.value = seconds;
    }

    // árboles: caen y se apagan en la fecha en que el radar ve la pérdida de esa celda
    if (trees && f) {
      const first = input.frames[0];
      for (let n = 0; n < treeCells.length; n++) {
        const tree = treeCells[n];
        const lost = f[tree.i] < first[tree.i] - DB.loss;
        treeFall[n] += ((lost ? 1 : 0) - treeFall[n]) * 0.12;
        const fall = treeFall[n];
        const h = treeSize * 0.9 * tree.s;
        const z = groundAt(tree.x, tree.y);
        if (!groundOkAt(tree.x, tree.y)) {
          trees.setMatrixAt(n, matrix.makeScale(0, 0, 0));
          continue;
        }
        quat.setFromAxisAngle(new THREE.Vector3(1, 0.3, 0).normalize(), fall * 0.9);
        const sc = 1 - fall * 0.7;
        matrix.compose(new THREE.Vector3(tree.x, tree.y, z), quat, new THREE.Vector3(treeSize * tree.s * sc, treeSize * tree.s * sc, h * sc));
        trees.setMatrixAt(n, matrix);
        trees.setColorAt(n, color.set(n % 3 ? "#2f8f4e" : "#3fa55c").lerp(BARE, fall));
      }
      trees.instanceMatrix.needsUpdate = true;
      if (trees.instanceColor) trees.instanceColor.needsUpdate = true;
    }

    // partículas ilustrativas
    if (wantsParticles) {
      const dt = 1 / 60;
      const activity = input.measured && deform && strongest && f ? Math.min(1.5, 0.35 + Math.abs(f[strongest.index] * input.toMeters) / (peak || 1)) : 1;
      for (let k = 0; k < PARTICLES; k++) {
        pLife[k] += dt * (kind === "volcano" ? 0.12 : 0.22);
        if (pLife[k] >= 1) { spawn(k); pLife[k] = 0; }
        let x = pPos[k * 3], y = pPos[k * 3 + 1];
        let z: number;
        if (kind === "volcano") {
          // vapor que sube del cráter y se deriva con el viento
          x += 6 * dt * 60 * 0.4 + pVel[k * 2] * 2;
          y += pVel[k * 2 + 1] * 2;
          z = groundAt(summit.x, summit.y) + 40 + pLife[k] * 900;
          pAlpha[k] = Math.sin(pLife[k] * Math.PI) * 0.55;
        } else if (kind === "wildfire") {
          const d = Math.hypot(x - sources[0].x, y - sources[0].y) || 1;
          x += ((x - sources[0].x) / d) * 3 + pVel[k * 2];
          y += ((y - sources[0].y) / d) * 3 + pVel[k * 2 + 1];
          z = groundAt(x, y) + 10 + pLife[k] * 160;
          pAlpha[k] = Math.sin(pLife[k] * Math.PI) * 0.9;
        } else if (kind === "earthquake") {
          z = groundAt(x, y) + 8 + Math.abs(Math.sin(seconds * 9 + k)) * 25;
          pAlpha[k] = Math.sin(pLife[k] * Math.PI) * 0.6;
        } else {
          // tierra que se desliza o hielo que fluye cuesta abajo; la velocidad sigue al dato
          const dir = downhill(x, y);
          const speed = (kind === "glacier" ? 7 : 4) * activity * (0.6 + dir.slope * 3);
          x += dir.dx * speed + pVel[k * 2] * 0.6;
          y += dir.dy * speed + pVel[k * 2 + 1] * 0.6;
          z = groundAt(x, y) + (kind === "glacier" ? 34 : 14);
          pAlpha[k] = Math.sin(pLife[k] * Math.PI) * (kind === "glacier" ? 0.7 : 0.85);
        }
        pPos[k * 3] = x;
        pPos[k * 3 + 1] = y;
        pPos[k * 3 + 2] = z;
      }
      (pointsGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (pointsGeo.attributes.alpha as THREE.BufferAttribute).needsUpdate = true;
    }

    // anillos que se abren en los puntos más activos (en el sismo, ondas desde el epicentro)
    rings.forEach((ring, n) => {
      const src = ringSources[Math.floor(n / perRing)];
      const phase = (seconds * (kind === "earthquake" ? 0.4 : 0.32) + (n % perRing) / perRing) % 1;
      const radius = (kind === "earthquake" ? size.width * 0.45 : 520) * (0.15 + phase);
      ring.scale.set(radius, radius, 1);
      ring.position.set(src.x, src.y, groundAt(src.x, src.y) + 20);
      (ring.material as THREE.MeshBasicMaterial).opacity = (1 - phase) * 0.75;
    });

    // regla: columna del suelo a la lámina en el punto que más se mueve
    if (ruler && strongest && f) {
      const x = lonToX(strongest.lon), y = latToY(strongest.lat);
      const g = groundAt(x, y);
      const top = g + lift + 25 + f[strongest.index] * input.toMeters * exaggeration;
      const height = Math.max(4, top - g);
      ruler.scale.set(9, height, 9);
      ruler.position.set(x, y, g + height / 2);
    }
  }

  return {
    id: "live-scene",
    type: "custom",
    renderingMode: "3d",
    onAdd(_map, gl) {
      renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      renderer.autoClear = false;
      sampleGround(true);
      for (let k = 0; k < PARTICLES; k++) spawn(k);
      clock0 = performance.now();
    },
    render(_gl, args: CustomRenderMethodInput) {
      if (!renderer) return;
      const now = performance.now();
      // el relieve llega por teselas: se vuelve a muestrear mientras se termina de cargar
      if (!groundReady || now - lastSample > 2500) {
        sampleGround(now - lastSample > 2500);
        lastSample = now;
        if (kind === "volcano") {
          let best = -Infinity;
          for (let k = 0; k < ground.length; k++) if (groundOk[k] && ground[k] > best) {
            best = ground[k];
            summit = { x: ((k % MESH) / (MESH - 1) - 0.5) * size.width, y: (0.5 - Math.floor(k / MESH) / (MESH - 1)) * size.height };
          }
        }
      }
      const originElevation = elevation(origin[0], origin[1]) ?? 0;
      const o = Mercator.fromLngLat(origin, originElevation);
      const s = o.meterInMercatorCoordinateUnits();
      const model = new THREE.Matrix4().makeTranslation(o.x, o.y, o.z).scale(new THREE.Vector3(s, -s, s));
      camera.projectionMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix as unknown as number[]).multiply(model);

      update(liveClock.t, (now - clock0) / 1000);
      renderer.resetState();
      renderer.render(scene, camera);
      map.triggerRepaint();
    },
    onRemove() {
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      });
      renderer = null;
    },
  };
}

/** Paso «redondo» para las franjas (1, 2 o 5 × 10^n). */
function niceStep(raw: number) {
  if (!(raw > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : 5) * p;
}

export const fringeStepFor = (input: LiveInput) =>
  input.measured && input.change === "deformation" && input.kind === "volcano" ? niceStep(peakOf(input) / 4) : 0;
