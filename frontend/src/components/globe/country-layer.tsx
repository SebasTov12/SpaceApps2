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
type CountryShape = { country: string; name: string; center: [number, number]; outline: [number, number][][]; departments: { code: string; name: string; rings: [number, number][][] }[] };

type Pin = { code: string; lat: number; lon: number; zones: number; records: number };

/** Centro visual de los países cuyo punto no conviene poner en el promedio de sus zonas. */
const CENTERS: Record<string, [number, number]> = { CO: [4.3, -73.6], US: [37.5, -110], BR: [-9, -58], CA: [55, -122] };

const SURFACE = 1 + RELIEF;
const v3 = (lat: number, lon: number, r: number) => new Vector3(...spherePosition(lat, lon, r));
const tmp = { a: new Vector3(), b: new Vector3() };

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
    // relleno suave del país
    const contour = ring.map(([lon, lat]) => new Vector2(lon, lat));
    const fbase = fill.length / 3;
    ring.forEach(([lon, lat]) => { const p = v3(lat, lon, SURFACE + 0.006); fill.push(p.x, p.y, p.z); });
    for (const tri of ShapeUtils.triangulateShape(contour, [])) fillIndex.push(fbase + tri[0], fbase + tri[1], fbase + tri[2]);
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
  const labelsRef = useRef<Map<string, HTMLDivElement>>(new Map());
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
    const onCountry = (e: Event) => setCountry((e as CustomEvent<string | null>).detail);
    const onZone = (e: Event) => {
      const id = (e as CustomEvent<string | null>).detail;
      const zone = id ? riskZones.find((z) => z.id === id) : null;
      const code = zone ? countryOf(zone) : null;
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
    let alive = true;
    fetch(`/data/countries/${country}.json`).then((r) => (r.ok ? r.json() : null)).then((d: CountryShape | null) => {
      if (alive) setShape(d && d.country === country ? d : null);
    }).catch(() => alive && setShape(null));
    return () => { alive = false; };
  }, [country]);
  const geo = useMemo(() => (shape ? buildShape(shape) : null), [shape]);
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

  useFrame(({ clock, camera }) => {
    const t = clock.getElapsedTime();
    const open = globeState.country;
    const planetView = globeState.uiRevealed && open === null && globeState.zoom === 0;
    // puntos de país (solo en la vista de planeta, en la cara visible)
    for (const pin of pins) {
      const node = pinsRef.current.get(pin.code);
      const label = labelsRef.current.get(pin.code);
      if (!node) continue;
      node.getWorldPosition(tmp.a);
      const facing = tmp.a.clone().normalize().dot(tmp.b.copy(camera.position).sub(tmp.a).normalize()) > 0.15;
      const show = planetView && facing;
      node.visible = show;
      if (label) label.style.opacity = show ? "1" : "0";
      if (show) {
        const ring = node.children[1];
        const phase = (t * 0.7 + pin.lat) % 1;
        ring.scale.setScalar(1 + phase * 1.6);
        ((ring as unknown as { material: MeshBasicMaterial }).material).opacity = 0.7 * (1 - phase);
      }
    }
    // girar el planeta para traer el país al frente mientras se acerca
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

  const onPin = (code: string) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (globeState.country !== null) return;
    // mientras el planeta frena y la cámara se acerca, se sigue corrigiendo el giro hacia el país
    aim.current = { code };
    window.setTimeout(() => { if (aim.current?.code === code) aim.current = null; }, 2400);
    openCountry(code);
  };

  const fmt = (n: number) => n.toLocaleString(es ? "es-CO" : "en-US");
  return (
    <group>
      {pins.map((pin) => {
        const pos = v3(pin.lat, pin.lon, SURFACE + 0.006);
        const size = 0.012 + 0.006 * Math.log10(pin.records + pin.zones + 1);
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
              <div className="cy-pin" ref={(el) => { if (el) labelsRef.current.set(pin.code, el); else labelsRef.current.delete(pin.code); }}>
                <strong>{countryName(pin.code, es ? "es" : "en")}</strong>
                <span>
                  {pin.records > 0 && <>{fmt(pin.records)} {es ? "registros" : "records"}</>}
                  {pin.records > 0 && pin.zones > 0 && " · "}
                  {pin.zones > 0 && <>{pin.zones} {pin.zones === 1 ? (es ? "zona" : "zone") : (es ? "zonas" : "zones")}</>}
                </span>
              </div>
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
