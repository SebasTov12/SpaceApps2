"use client";

import { Html } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, Color, DoubleSide, Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial,
  Quaternion, ShaderMaterial, ShapeUtils, Vector2, Vector3,
} from "three";
import { useI18n } from "@/lib/i18n";
import { countryName, countryOf } from "@/lib/emergency";
import { loadHazardPoints, pointCountry } from "@/lib/hazard-points";
import { riskZones } from "@/lib/risk-zones";
import { COUNTRY_EVENT, GLOBE_SELECT, RELIEF, globeState, openCountry } from "./globe-state";
import { spherePosition } from "./risk-markers";

/** Croquis del país: contorno, límites internos y caja (generado por scripts/build_country_outline.py). */
type CountryShape = { country: string; name: string; center: [number, number]; bbox?: [number, number, number, number]; fill?: boolean; outline: [number, number][][]; departments: { code: string; name: string; rings: [number, number][][] }[] };

type Pin = { code: string; lat: number; lon: number; zones: number; records: number };

/** Centro visual de los países cuyo punto no conviene poner en el promedio de sus zonas. */
const CENTERS: Record<string, [number, number]> = { CO: [4.3, -73.6], US: [37.5, -110], BR: [-9, -58], CA: [55, -122] };

const SURFACE = 1 + RELIEF;
const v3 = (lat: number, lon: number, r: number) => new Vector3(...spherePosition(lat, lon, r));
const tmp = { a: new Vector3(), b: new Vector3() };

/** Borde del contorno a la altura del cartel; el extremo global de la caja puede estar mucho más lejos. */
function edgeAtLatitude(shape: CountryShape, lat: number, side: "east" | "west") {
  let edge = side === "east" ? -Infinity : Infinity;
  for (const ring of shape.outline) for (let i = 0; i < ring.length; i++) {
    const [aLon, aLat] = ring[i], [bLon, bLat] = ring[(i + 1) % ring.length];
    if ((aLat <= lat && bLat > lat) || (bLat <= lat && aLat > lat)) {
      const lon = aLon + ((lat - aLat) / (bLat - aLat)) * (bLon - aLon);
      edge = side === "east" ? Math.max(edge, lon) : Math.min(edge, lon);
    }
  }
  if (Number.isFinite(edge)) return edge;
  return side === "east" ? shape.bbox?.[2] ?? shape.center[0] : shape.bbox?.[0] ?? shape.center[0];
}

/** Los carteles HTML ya miran a la cámara; una inclinación pequeña responde al punto de vista. */
function faceViewer(label: HTMLElement, x: number, y: number) {
  const tiltX = (Math.max(-1, Math.min(1, y)) * 5).toFixed(1);
  const tiltY = (Math.max(-1, Math.min(1, -x)) * 6).toFixed(1);
  const value = `${tiltX},${tiltY}`;
  if (label.dataset.tilt === value) return;
  label.dataset.tilt = value;
  label.style.setProperty("--look-x", `${tiltX}deg`);
  label.style.setProperty("--look-y", `${tiltY}deg`);
}

/** Pared luminosa del contorno: se ve en relieve sobre el planeta. */
const wallMaterial = () => new ShaderMaterial({
  transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
  uniforms: { uOpacity: { value: 0 }, uColor: { value: new Color("#5ef0ff") } },
  vertexShader: "attribute float h; varying float vH; void main(){ vH=h; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
  fragmentShader: "uniform float uOpacity; uniform vec3 uColor; varying float vH; void main(){ gl_FragColor=vec4(uColor, uOpacity*(0.15+0.85*vH*vH)); }",
});

function buildShape(shape: CountryShape) {
  // pared del contorno
  const wall: number[] = [], heights: number[] = [], index: number[] = [];
  const line: number[] = [];
  const fill: number[] = [], fillIndex: number[] = [];
  for (const ring of shape.outline) {
    const base = wall.length / 3;
    ring.forEach(([lon, lat]) => {
      const lo = v3(lat, lon, 1.0015), hi = v3(lat, lon, SURFACE + 0.012);
      wall.push(lo.x, lo.y, lo.z, hi.x, hi.y, hi.z);
      heights.push(0, 1);
    });
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const a = base + i * 2, b = base + ((i + 1) % n) * 2;
      index.push(a, b, a + 1, b, b + 1, a + 1);
      const p = v3(ring[i][1], ring[i][0], SURFACE + 0.012), q = v3(ring[(i + 1) % n][1], ring[(i + 1) % n][0], SURFACE + 0.012);
      line.push(p.x, p.y, p.z, q.x, q.y, q.z);
    }
    // relleno suave del país; los triángulos largos se parten para que sigan la curvatura del planeta
    if (shape.fill !== false) {
      const contour = ring.map(([lon, lat]) => new Vector2(lon, lat));
      const push = (a: Vector2, b: Vector2, c: Vector2, depth: number) => {
        const ab = a.distanceTo(b), bc = b.distanceTo(c), ca = c.distanceTo(a);
        const longest = Math.max(ab, bc, ca);
        if (longest > 3.5 && depth < 9) {
          if (longest === ab) { const m = a.clone().lerp(b, 0.5); push(a, m, c, depth + 1); push(m, b, c, depth + 1); }
          else if (longest === bc) { const m = b.clone().lerp(c, 0.5); push(a, b, m, depth + 1); push(a, m, c, depth + 1); }
          else { const m = c.clone().lerp(a, 0.5); push(a, b, m, depth + 1); push(m, b, c, depth + 1); }
          return;
        }
        for (const q of [a, b, c]) { const p = v3(q.y, q.x, SURFACE + 0.006); fill.push(p.x, p.y, p.z); }
        const n = fill.length / 3;
        fillIndex.push(n - 3, n - 2, n - 1);
      };
      for (const tri of ShapeUtils.triangulateShape(contour, [])) push(contour[tri[0]], contour[tri[1]], contour[tri[2]], 0);
    }
  }
  const wallGeo = new BufferGeometry();
  wallGeo.setAttribute("position", new BufferAttribute(new Float32Array(wall), 3));
  wallGeo.setAttribute("h", new BufferAttribute(new Float32Array(heights), 1));
  wallGeo.setIndex(index);
  const lineGeo = new BufferGeometry();
  lineGeo.setAttribute("position", new BufferAttribute(new Float32Array(line), 3));
  const fillGeo = new BufferGeometry();
  fillGeo.setAttribute("position", new BufferAttribute(new Float32Array(fill), 3));
  fillGeo.setIndex(fillIndex);
  // límites internos (departamentos)
  const inner: number[] = [];
  for (const dep of shape.departments) for (const ring of dep.rings) {
    for (let i = 0; i < ring.length; i++) {
      const p = v3(ring[i][1], ring[i][0], SURFACE + 0.007), q = v3(ring[(i + 1) % ring.length][1], ring[(i + 1) % ring.length][0], SURFACE + 0.007);
      inner.push(p.x, p.y, p.z, q.x, q.y, q.z);
    }
  }
  const innerGeo = new BufferGeometry();
  innerGeo.setAttribute("position", new BufferAttribute(new Float32Array(inner), 3));
  return { wallGeo, lineGeo, fillGeo, innerGeo };
}

/**
 * Vista de países: un solo punto por país (con sus zonas y registros). Al tocarlo, el planeta gira hasta él,
 * se acerca y dibuja su croquis; dentro aparecen todos los puntos de ese país.
 */
export default function CountryLayer() {
  const { lang } = useI18n();
  const es = lang !== "en";
  const [records, setRecords] = useState<Map<string, number>>(new Map());
  const [country, setCountry] = useState<string | null>(null);
  const [shape, setShape] = useState<CountryShape | null>(null);
  const pinsRef = useRef<Map<string, Group>>(new Map());
  const labelsRef = useRef<Map<string, HTMLButtonElement>>(new Map());
  const desktopAnchor = useRef<Group>(null);
  const mobileAnchor = useRef<Group>(null);
  const desktopCallout = useRef<HTMLDivElement>(null);
  const mobileCallout = useRef<HTMLDivElement>(null);
  const aim = useRef<{ code: string } | null>(null);
  const fade = useRef(0);
  const wallRef = useRef<Mesh>(null);
  const lineRef = useRef<LineSegments>(null);
  const innerRef = useRef<LineSegments>(null);
  const fillRef = useRef<Mesh>(null);

  // registros reales por país (los puntos de la base)
  useEffect(() => {
    let alive = true;
    loadHazardPoints().then((data) => {
      if (!alive || !data) return;
      const map = new Map<string, number>();
      for (const p of data.points) map.set(pointCountry(p), (map.get(pointCountry(p)) ?? 0) + p.n);
      setRecords(map);
    });
    return () => { alive = false; };
  }, []);

  // país abierto (por el punto, por el panel o al abrir una zona desde el buscador)
  useEffect(() => {
    const onCountry = (e: Event) => {
      setShape(null);
      setCountry((e as CustomEvent<string | null>).detail);
    };
    const onZone = (e: Event) => {
      const id = (e as CustomEvent<string | null>).detail;
      const zone = id ? riskZones.find((z) => z.id === id) : null;
      const hazard = id && globeState.hazardFocus?.id === id ? globeState.hazardFocus : null;
      const code = zone ? countryOf(zone) : hazard?.country ?? null;
      if (code && code !== globeState.country) {
        globeState.country = code;
        globeState.countryZoom = 1;
        window.dispatchEvent(new CustomEvent(COUNTRY_EVENT, { detail: code }));
      }
    };
    window.addEventListener(COUNTRY_EVENT, onCountry);
    window.addEventListener(GLOBE_SELECT, onZone);
    return () => { window.removeEventListener(COUNTRY_EVENT, onCountry); window.removeEventListener(GLOBE_SELECT, onZone); };
  }, []);

  // croquis del país abierto, si existe
  useEffect(() => {
    if (!country) return;
    globeState.countryDistance = 1.9; // hasta que llegue el croquis con su tamaño
    let alive = true;
    fetch(`/data/countries/${country}.json`).then((r) => (r.ok ? r.json() : null)).then((d: CountryShape | null) => {
      if (alive) setShape(d && d.country === country ? d : null);
    }).catch(() => alive && setShape(null));
    return () => { alive = false; };
  }, [country]);
  const geo = useMemo(() => (shape?.country === country ? buildShape(shape) : null), [shape, country]);
  useEffect(() => {
    if (!shape?.bbox) return;
    const [w, s0, e, n] = shape.bbox;
    const lat = (s0 + n) / 2;
    const span = Math.max((e - w) * Math.cos((lat * Math.PI) / 180), n - s0);
    globeState.countryDistance = Math.min(2.9, Math.max(1.5, 1 + span * 0.042));
  }, [shape]);
  useEffect(() => () => { if (geo) Object.values(geo).forEach((g) => g.dispose()); }, [geo]);
  const mats = useMemo(() => ({
    wall: wallMaterial(),
    line: new LineBasicMaterial({ color: "#bdf6ff", transparent: true, opacity: 0, depthWrite: false }),
    inner: new LineBasicMaterial({ color: "#a78bfa", transparent: true, opacity: 0, depthWrite: false }),
    fill: new MeshBasicMaterial({ color: "#5ef0ff", transparent: true, opacity: 0, depthWrite: false, side: DoubleSide }),
    core: new MeshBasicMaterial({ color: "#ffffff", transparent: true, depthWrite: false }),
    ring: new MeshBasicMaterial({ color: "#5ef0ff", transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide }),
  }), []);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  // un punto por país: zonas curadas + registros de la base
  const pins = useMemo<Pin[]>(() => {
    const by = new Map<string, { lat: number; lon: number; zones: number }>();
    for (const z of riskZones) {
      const code = countryOf(z);
      if (!code) continue;
      const cur = by.get(code) ?? { lat: 0, lon: 0, zones: 0 };
      cur.lat += z.lat; cur.lon += z.lon; cur.zones += 1;
      by.set(code, cur);
    }
    for (const code of records.keys()) if (!by.has(code)) by.set(code, { lat: 0, lon: 0, zones: 0 });
    return Array.from(by.entries()).map(([code, v]) => {
      const center = CENTERS[code] ?? (v.zones ? [v.lat / v.zones, v.lon / v.zones] : [0, 0]);
      return { code, lat: center[0], lon: center[1], zones: v.zones, records: records.get(code) ?? 0 };
    });
  }, [records]);

  const ordered = useMemo(() => [...pins].sort((a, b) => b.records + b.zones * 50 - (a.records + a.zones * 50)), [pins]);
  const activePin = country ? pins.find((pin) => pin.code === country) : null;
  const activeAnchors = useMemo(() => {
    if (!activePin) return [];
    const current = shape?.country === country ? shape : null;
    const lat = current?.center[1] ?? activePin.lat;
    const gap = current?.bbox ? Math.max(0.2, Math.min(0.7, (current.bbox[2] - current.bbox[0]) * 0.025)) : 0.35;
    return (["desktop", "mobile"] as const).map((view) => ({
      view,
      lat,
      lon: current
        ? edgeAtLatitude(current, lat, view === "desktop" ? "east" : "west") + (view === "desktop" ? gap : -gap)
        : activePin.lon + (view === "desktop" ? 4 : -4),
    }));
  }, [activePin, country, shape]);
  useFrame(({ clock, camera, size }) => {
    const t = clock.getElapsedTime();
    const open = globeState.country;
    const countryView = globeState.uiRevealed && globeState.zoom === 0;
    // Los otros países siguen disponibles durante el acercamiento para pasar de uno a otro.
    // etiquetas sin encimarse: primero los países con más datos; las que chocan se ocultan (el punto queda)
    const boxes: { x: number; y: number; w: number; h: number }[] = [];
    for (const pin of ordered) {
      const node = pinsRef.current.get(pin.code);
      const label = labelsRef.current.get(pin.code);
      if (!node) continue;
      node.getWorldPosition(tmp.a);
      const facing = tmp.a.clone().normalize().dot(tmp.b.copy(camera.position).sub(tmp.a).normalize());
      const show = countryView && pin.code !== open && facing > 0.18;
      node.visible = show;
      let labelOn = show;
      if (show && label) {
        if (!label.dataset.w || label.dataset.w === "0") { label.dataset.w = String(label.offsetWidth); label.dataset.h = String(label.offsetHeight); }
        tmp.b.copy(tmp.a).project(camera);
        faceViewer(label, tmp.b.x, tmp.b.y);
        const box = { x: ((tmp.b.x + 1) / 2) * size.width, y: ((1 - tmp.b.y) / 2) * size.height - 34, w: Number(label.dataset.w) + 6, h: Number(label.dataset.h) + 4 };
        labelOn = !boxes.some((o) => Math.abs(o.x - box.x) * 2 < o.w + box.w && Math.abs(o.y - box.y) * 2 < o.h + box.h);
        if (labelOn) boxes.push(box);
      }
      if (label && label.dataset.on !== (labelOn ? "1" : "0")) {
        label.dataset.on = labelOn ? "1" : "0";
        label.style.pointerEvents = labelOn ? "auto" : "none";
        label.tabIndex = labelOn ? 0 : -1;
      }
      if (label) {
        const opacity = labelOn ? Math.min(1, (facing - 0.18) / 0.24).toFixed(2) : "0";
        if (label.style.opacity !== opacity) label.style.opacity = opacity;
      }
      if (show) {
        const ring = node.children[1];
        const phase = (t * 0.7 + pin.lat) % 1;
        ring.scale.setScalar(1 + phase * 1.6);
        ((ring as unknown as { material: MeshBasicMaterial }).material).opacity = 0.7 * (1 - phase);
      }
    }
    for (const [anchorRef, labelRef] of [[desktopAnchor, desktopCallout], [mobileAnchor, mobileCallout]] as const) {
      const anchor = anchorRef.current, label = labelRef.current;
      if (!anchor || !label) continue;
      anchor.getWorldPosition(tmp.a);
      const facing = tmp.a.clone().normalize().dot(tmp.b.copy(camera.position).sub(tmp.a).normalize());
      label.style.visibility = facing > 0.18 ? "visible" : "hidden";
      const opacity = Math.max(0, Math.min(1, (facing - 0.18) / 0.24)).toFixed(2);
      if (label.style.opacity !== opacity) label.style.opacity = opacity;
      if (facing > 0.18) {
        tmp.b.copy(tmp.a).project(camera);
        faceViewer(label, tmp.b.x, tmp.b.y);
      }
    }
    // girar el planeta para traer el país al frente mientras se acerca
    if (aim.current && globeState.user.moved > 8) aim.current = null;
    if (aim.current && globeState.userGroup) {
      const node = pinsRef.current.get(aim.current.code);
      if (node) {
        node.getWorldPosition(tmp.a);
        const q = globeState.userGroup.worldToLocal(tmp.b.copy(tmp.a));
        const user = globeState.user;
        let yaw = -Math.atan2(q.x, q.z);
        yaw += Math.PI * 2 * Math.round((user.targetYaw - yaw) / (Math.PI * 2));
        user.targetYaw = yaw;
        user.targetPitch = Math.max(-1.2, Math.min(1.2, Math.atan2(q.y, Math.hypot(q.x, q.z))));
        user.velocity = 0;
      }
    }
    if (globeState.orbit) globeState.orbit.visible = globeState.countryZoom < 0.5;
    // croquis: aparece con el acercamiento
    const target = open && shape && shape.country === open ? 1 : 0;
    fade.current += (target - fade.current) * 0.06;
    const f = fade.current;
    const wall = wallRef.current?.material as ShaderMaterial | undefined;
    if (wall) wall.uniforms.uOpacity.value = 0.55 * f;
    const lineMat = lineRef.current?.material as LineBasicMaterial | undefined;
    if (lineMat) lineMat.opacity = 0.95 * f;
    const innerMat = innerRef.current?.material as LineBasicMaterial | undefined;
    if (innerMat) innerMat.opacity = 0.32 * f;
    const fillMat = fillRef.current?.material as MeshBasicMaterial | undefined;
    if (fillMat) fillMat.opacity = 0.08 * f;
  });

  const selectCountry = (code: string) => {
    if (globeState.zoom > 0 || globeState.country === code) return;
    // mientras el planeta frena y la cámara se acerca, se sigue corrigiendo el giro hacia el país
    aim.current = { code };
    window.setTimeout(() => { if (aim.current?.code === code) aim.current = null; }, 2400);
    openCountry(code);
  };
  const onPin = (code: string) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (globeState.user.moved > 8) return;
    selectCountry(code);
  };

  return (
    <group>
      {activePin && globeState.zoom === 0 && activeAnchors.map(({ view, lat, lon }) => (
        <group key={`${activePin.code}-${view}`} position={v3(lat, lon, SURFACE + 0.075)}
          ref={view === "desktop" ? desktopAnchor : mobileAnchor}>
          <Html center className={`cy-country-anchor cy-country-anchor-${view}`} zIndexRange={[24, 22]} style={{ pointerEvents: "none" }}>
            <div className="cy-country-callout" role="status" aria-live="polite"
              ref={view === "desktop" ? desktopCallout : mobileCallout}>
              <strong>{countryName(activePin.code, es ? "es" : "en")}</strong>
            </div>
          </Html>
        </group>
      ))}
      {pins.map((pin) => {
        const pos = v3(pin.lat, pin.lon, SURFACE + 0.006);
        // El marcador identifica un país; su tamaño no depende de cuántos registros tenga.
        const size = 0.012;
        return (
          <group key={pin.code} ref={(g) => { if (g) pinsRef.current.set(pin.code, g); else pinsRef.current.delete(pin.code); }}
            position={pos} quaternion={new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), pos.clone().normalize())}>
            <mesh material={mats.core} onClick={onPin(pin.code)}
              onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; }}
              onPointerOut={() => { document.body.style.cursor = ""; }}>
              <circleGeometry args={[size * 0.45, 24]} />
            </mesh>
            <mesh material={mats.ring}>
              <ringGeometry args={[size * 0.7, size * 0.82, 40]} />
            </mesh>
            <mesh visible={false} onClick={onPin(pin.code)}>
              <circleGeometry args={[size * 1.6, 12]} />
            </mesh>
            <Html center zIndexRange={[20, 10]} position={[0, 0, 0.004]} style={{ pointerEvents: "none" }}>
              <button type="button" className="cy-pin" aria-label={countryName(pin.code, es ? "es" : "en")}
                onClick={(event) => { if (event.detail === 0 || globeState.user.moved <= 8) selectCountry(pin.code); }}
                ref={(el) => { if (el) labelsRef.current.set(pin.code, el); else labelsRef.current.delete(pin.code); }}>
                <strong>{countryName(pin.code, es ? "es" : "en")}</strong>
              </button>
            </Html>
          </group>
        );
      })}
      {geo && (
        <group>
          <mesh ref={fillRef} geometry={geo.fillGeo} material={mats.fill} renderOrder={1} raycast={() => null} />
          <mesh ref={wallRef} geometry={geo.wallGeo} material={mats.wall} renderOrder={2} raycast={() => null} />
          <lineSegments ref={lineRef} geometry={geo.lineGeo} material={mats.line} renderOrder={3} raycast={() => null} />
          <lineSegments ref={innerRef} geometry={geo.innerGeo} material={mats.inner} renderOrder={2} raycast={() => null} />
        </group>
      )}
    </group>
  );
}
