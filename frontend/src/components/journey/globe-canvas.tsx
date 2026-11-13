"use client";

import { useEffect, useRef } from "react";

/** Estado del globo en un fotograma. Posiciones y radio en píxeles CSS; ángulos en grados. */
export type GlobeState = {
  centerX: number;
  centerY: number;
  radius: number;
  lon: number;
  lat: number;
  /** 0–1: franja de radar de NISAR sobre el objetivo */
  swath: number;
  /** 0–1: retícula de 10° */
  grid: number;
  /** 0–1: retícula fina de 1° para el zoom */
  gridFine: number;
  /** 0–1: anillos sobre la zona piloto */
  ring: number;
  /** 0–1: interferograma ilustrativo */
  fringe: number;
  clouds: number;
  halo: number;
};

export type GlobeTarget = { lat: number; lon: number };

type GlobeCanvasProps = {
  target: GlobeTarget;
  /** Se llama en cada fotograma con el tiempo (s) y el tamaño del lienzo (px CSS). */
  getState: (time: number, width: number, height: number) => GlobeState;
  /** Congela el tiempo (escaneo, pulsos, deriva) si el usuario prefiere menos movimiento. */
  reduceMotion?: boolean;
};

const vertexSource = `
attribute vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
`;

const fragmentSource = `
precision highp float;
uniform sampler2D uEarth;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uDpr;
uniform vec2 uView;
uniform vec3 uTarget;
uniform vec3 uOrbitNormal;
uniform vec3 uAlongRef;
uniform float uSwath;
uniform float uGrid;
uniform float uGridFine;
uniform float uRing;
uniform float uFringe;
uniform float uClouds;
uniform float uHalo;
uniform float uTime;

float hash31(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}

float noise3(vec3 p) {
  vec3 c = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash31(c), hash31(c + vec3(1.0, 0.0, 0.0)), f.x), mix(hash31(c + vec3(0.0, 1.0, 0.0)), hash31(c + vec3(1.0, 1.0, 0.0)), f.x), f.y);
  float b = mix(mix(hash31(c + vec3(0.0, 0.0, 1.0)), hash31(c + vec3(1.0, 0.0, 1.0)), f.x), mix(hash31(c + vec3(0.0, 1.0, 1.0)), hash31(c + vec3(1.0, 1.0, 1.0)), f.x), f.y);
  return mix(a, b, f.z);
}

float fbm(vec3 p) {
  float v = 0.0;
  float w = 0.5;
  for (int i = 0; i < 3; i++) {
    v += noise3(p) * w;
    p = p * 2.03 + vec3(7.1, 3.7, 5.3);
    w *= 0.5;
  }
  return v;
}

// Paleta TENUA en ciclo: verde -> cielo -> azul tecnológico -> tinta
vec3 tenua(float t) {
  t = fract(t);
  vec3 green = vec3(0.659, 0.863, 0.773);
  vec3 sky = vec3(0.663, 0.847, 0.910);
  vec3 tech = vec3(0.435, 0.686, 0.788);
  vec3 ink = vec3(0.141, 0.298, 0.333);
  if (t < 0.25) return mix(green, sky, t / 0.25);
  if (t < 0.5) return mix(sky, tech, (t - 0.25) / 0.25);
  if (t < 0.75) return mix(tech, ink, (t - 0.5) / 0.25 * 0.7);
  return mix(mix(tech, ink, 0.7), green, (t - 0.75) / 0.25);
}

void main() {
  vec2 p = (gl_FragCoord.xy - uCenter) / uRadius;
  float r2 = dot(p, p);
  float r = sqrt(r2);

  // Halo atmosférico fuera del disco
  if (r >= 1.0) {
    float outside = (r - 1.0) * uRadius / uDpr;
    float halo = exp(-outside / 26.0) * 0.55 * uHalo;
    if (halo < 0.004) discard;
    gl_FragColor = vec4(0.62, 0.83, 0.90, halo);
    return;
  }

  float z = sqrt(1.0 - r2);
  vec3 local = vec3(p, z);

  // De la vista al globo: inclinar por la latitud central y girar por la longitud central
  float cl = cos(uView.y);
  float sl = sin(uView.y);
  vec3 v1 = vec3(local.x, local.y * cl + local.z * sl, -local.y * sl + local.z * cl);
  float cL = cos(uView.x);
  float sL = sin(uView.x);
  vec3 n = vec3(v1.x * cL + v1.z * sL, v1.y, -v1.x * sL + v1.z * cL);

  float lon = atan(n.x, n.z);
  float lat = asin(clamp(n.y, -1.0, 1.0));
  vec2 uv = vec2(lon / 6.28318530718 + 0.5, 0.5 - lat / 3.14159265359);
  vec3 surface = texture2D(uEarth, uv).rgb;

  // Iluminación suave y clara (tema claro)
  vec3 light = normalize(vec3(-0.35, 0.42, 0.84));
  float diffuse = dot(local, light);
  vec3 color = surface * (0.6 + 0.55 * smoothstep(-0.3, 0.9, diffuse));
  // Océano más claro, en azul petróleo de la paleta
  float ocean = 1.0 - smoothstep(0.08, 0.26, max(surface.r, max(surface.g, surface.b)));
  color = mix(color, vec3(0.24, 0.47, 0.58) * (0.85 + 0.25 * diffuse), ocean * 0.6);

  // Tamaño angular de un píxel (rad), para líneas nítidas a cualquier zoom
  float pxAng = 1.0 / (uRadius * max(z, 0.18));
  float pxDeg = degrees(pxAng);

  if (uClouds > 0.01) {
    float cloud = fbm(n * 8.5 + vec3(4.2 + uTime * 0.004, 1.7, 8.1));
    float cover = smoothstep(0.52, 0.7, cloud) * uClouds;
    color = mix(color, vec3(0.95, 0.98, 0.99), cover * 0.55);
  }

  // Retícula de latitud/longitud
  float latD = degrees(lat);
  float lonD = degrees(lon);
  float cosLat = max(cos(lat), 0.05);
  if (uGrid > 0.01) {
    float dLat = abs(fract(latD / 10.0 + 0.5) - 0.5) * 10.0;
    float dLon = abs(fract(lonD / 10.0 + 0.5) - 0.5) * 10.0 * cosLat;
    float line = max(1.0 - smoothstep(pxDeg * 0.5, pxDeg * 1.4, dLat), 1.0 - smoothstep(pxDeg * 0.5, pxDeg * 1.4, dLon));
    color = mix(color, vec3(1.0), line * 0.5 * uGrid);
  }
  if (uGridFine > 0.01) {
    float dLat = abs(fract(latD + 0.5) - 0.5);
    float dLon = abs(fract(lonD + 0.5) - 0.5) * cosLat;
    float line = max(1.0 - smoothstep(pxDeg * 0.5, pxDeg * 1.4, dLat), 1.0 - smoothstep(pxDeg * 0.5, pxDeg * 1.4, dLon));
    color = mix(color, vec3(1.0), line * 0.32 * uGridFine);
  }

  // Franja de radar (242 km ≈ ±0.019 rad) con líneas de escaneo que avanzan
  if (uSwath > 0.01) {
    float across = dot(n, uOrbitNormal);
    float halfWidth = 0.019;
    float inside = 1.0 - smoothstep(halfWidth, halfWidth + pxAng * 1.5, abs(across));
    float along = atan(dot(n, cross(uOrbitNormal, uAlongRef)), dot(n, uAlongRef));
    float scan = fract(along / 0.012 - uTime * 0.9);
    float scanLine = smoothstep(0.0, 0.15, scan) * (1.0 - smoothstep(0.15, 0.45, scan));
    float edge = 1.0 - smoothstep(pxAng * 0.6, pxAng * 1.8, abs(abs(across) - halfWidth));
    // la franja se despliega a lo largo de la órbita a medida que aparece
    float reveal = 1.0 - smoothstep(uSwath * 1.6, uSwath * 1.6 + 0.08, abs(along));
    float swath = uSwath * reveal;
    color = mix(color, vec3(0.435, 0.686, 0.788), inside * swath * (0.32 + scanLine * 0.38));
    color = mix(color, vec3(1.0), edge * swath * 0.85);
  }

  float ang = acos(clamp(dot(n, uTarget), -1.0, 1.0));

  // Interferograma ilustrativo: deformación en forma de cuenco alrededor de la zona
  if (uFringe > 0.01) {
    float radius = 0.05;
    float bowl = 1.0 - pow(clamp(ang / radius, 0.0, 1.0), 2.0);
    float warp = fbm(n * 220.0) * 0.35;
    float phase = bowl * 4.0 + warp - uTime * 0.12;
    float mask = (1.0 - smoothstep(radius * 0.72, radius, ang)) * uFringe;
    color = mix(color, tenua(phase), mask * 0.82);
  }

  // Anillos sobre la zona piloto: uno fijo y uno que pulsa hacia afuera
  if (uRing > 0.01) {
    float w = pxAng * 1.6;
    float fixedRing = 1.0 - smoothstep(w * 0.4, w, abs(ang - 0.012));
    float pulse = fract(uTime * 0.45);
    float pulseRing = (1.0 - smoothstep(w * 0.4, w * 1.4, abs(ang - mix(0.004, 0.05, pulse)))) * (1.0 - pulse);
    float dot0 = 1.0 - smoothstep(pxAng * 3.0, pxAng * 4.5, ang);
    vec3 ink = vec3(0.141, 0.298, 0.333);
    color = mix(color, ink, (fixedRing * 0.9 + dot0) * uRing);
    color = mix(color, vec3(1.0), pulseRing * 0.9 * uRing);
  }

  // Borde atmosférico claro
  color = mix(color, vec3(0.66, 0.85, 0.91), pow(1.0 - z, 2.4) * 0.6 * uHalo);

  float alpha = clamp((1.0 - r) * uRadius / (1.5 * uDpr), 0.0, 1.0);
  gl_FragColor = vec4(color, alpha);
}
`;

const rad = (deg: number) => (deg * Math.PI) / 180;
const toVector = (lat: number, lon: number): [number, number, number] => [
  Math.cos(rad(lat)) * Math.sin(rad(lon)),
  Math.sin(rad(lat)),
  Math.cos(rad(lat)) * Math.cos(rad(lon)),
];
const cross = (a: number[], b: number[]): [number, number, number] => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (v: number[]): [number, number, number] => {
  const length = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / length, v[1] / length, v[2] / length];
};

/** Plano de una órbita casi polar (inclinación ~98°) que pasa sobre el objetivo. */
function orbitFor(target: GlobeTarget) {
  const t = toVector(target.lat, target.lon);
  const phi = rad(target.lat);
  const lambda = rad(target.lon);
  const north = normalize([-Math.sin(phi) * Math.sin(lambda), Math.cos(phi), -Math.sin(phi) * Math.cos(lambda)]);
  const east = normalize([Math.cos(lambda), 0, -Math.sin(lambda)]);
  const heading = rad(-12);
  const direction = normalize(north.map((value, i) => value * Math.cos(heading) - east[i] * Math.sin(heading)));
  return { target: t, normal: normalize(cross(t, direction)) };
}

export default function GlobeCanvas({ target, getState, reduceMotion = false }: GlobeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const getStateRef = useRef(getState);
  const reduceRef = useRef(reduceMotion);

  useEffect(() => {
    getStateRef.current = getState;
    reduceRef.current = reduceMotion;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const options: WebGLContextAttributes = { alpha: true, antialias: true, premultipliedAlpha: false };
    const gl2 = canvas.getContext("webgl2", options);
    const gl = (gl2 ?? canvas.getContext("webgl", options)) as WebGLRenderingContext | null;
    if (!gl) return;

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.warn("TENUA globe shader:", gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };
    const vertexShader = compile(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = compile(gl.FRAGMENT_SHADER, fragmentSource);
    if (!vertexShader || !fragmentShader) return;
    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const u = (name: string) => gl.getUniformLocation(program, name);
    const uniforms = {
      center: u("uCenter"), radius: u("uRadius"), dpr: u("uDpr"), view: u("uView"),
      target: u("uTarget"), orbitNormal: u("uOrbitNormal"), alongRef: u("uAlongRef"),
      swath: u("uSwath"), grid: u("uGrid"), gridFine: u("uGridFine"), ring: u("uRing"),
      fringe: u("uFringe"), clouds: u("uClouds"), halo: u("uHalo"), time: u("uTime"),
    };
    const orbit = orbitFor(target);
    gl.uniform3fv(uniforms.target, orbit.target);
    gl.uniform3fv(uniforms.orbitNormal, orbit.normal);
    gl.uniform3fv(uniforms.alongRef, orbit.target);

    const texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl2 ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.uniform1i(u("uEarth"), 0);

    let ready = false;
    let disposed = false;
    const image = new window.Image();
    image.onload = () => {
      if (disposed) return;
      const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
      const scale = Math.min(1, maxSize / image.naturalWidth);
      const source = document.createElement("canvas");
      source.width = Math.round(image.naturalWidth * scale);
      source.height = Math.round(image.naturalHeight * scale);
      const context = source.getContext("2d");
      if (!context) return;
      context.drawImage(image, 0, 0, source.width, source.height);

      const upload = () => {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
        if (gl2) gl2.generateMipmap(gl2.TEXTURE_2D);
        ready = true;
        canvas.classList.add("is-ready");
      };
      upload();

      // Fronteras dibujadas sobre la textura
      fetch("/earth-country-borders.geojson")
        .then((response) => response.json())
        .then((geo: { features: Array<{ geometry?: { type: string; coordinates: unknown } }> }) => {
          if (disposed) return;
          context.strokeStyle = "rgba(255, 255, 255, 0.55)";
          context.lineWidth = Math.max(2, source.width / 2200);
          const drawLine = (points: number[][]) => {
            context.beginPath();
            let previousX: number | undefined;
            for (const [longitude, latitude] of points) {
              const x = ((longitude + 180) / 360) * source.width;
              const y = ((90 - latitude) / 180) * source.height;
              if (previousX === undefined || Math.abs(x - previousX) > source.width / 2) context.moveTo(x, y);
              else context.lineTo(x, y);
              previousX = x;
            }
            context.stroke();
          };
          for (const feature of geo.features) {
            const geometry = feature.geometry;
            if (!geometry) continue;
            if (geometry.type === "LineString") drawLine(geometry.coordinates as number[][]);
            else if (geometry.type === "MultiLineString") for (const line of geometry.coordinates as number[][][]) drawLine(line);
          }
          upload();
        })
        .catch(() => undefined);
    };
    image.src = "/earth-blue-marble.jpg";

    let frame = 0;
    let clock = 0;
    let last = 0;
    const render = (now: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      const cssWidth = canvas.clientWidth;
      const cssHeight = canvas.clientHeight;
      const width = Math.max(1, Math.round(cssWidth * dpr));
      const height = Math.max(1, Math.round(cssHeight * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      if (last && !reduceRef.current) clock += Math.min(now - last, 50) / 1000;
      last = now;

      const s = getStateRef.current(clock, cssWidth, cssHeight);
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(uniforms.center, s.centerX * dpr, height - s.centerY * dpr);
      gl.uniform1f(uniforms.radius, s.radius * dpr);
      gl.uniform1f(uniforms.dpr, dpr);
      gl.uniform2f(uniforms.view, rad(s.lon), rad(s.lat));
      gl.uniform1f(uniforms.swath, s.swath);
      gl.uniform1f(uniforms.grid, s.grid);
      gl.uniform1f(uniforms.gridFine, s.gridFine);
      gl.uniform1f(uniforms.ring, s.ring);
      gl.uniform1f(uniforms.fringe, s.fringe);
      gl.uniform1f(uniforms.clouds, s.clouds);
      gl.uniform1f(uniforms.halo, s.halo);
      gl.uniform1f(uniforms.time, clock);
      if (ready) gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      frame = window.requestAnimationFrame(render);
    };
    frame = window.requestAnimationFrame(render);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      image.onload = null;
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
    };
  }, [target]);

  return <canvas ref={canvasRef} className="globe-canvas" aria-hidden="true" />;
}
