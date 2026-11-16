"use client";

import { Html } from "@react-three/drei";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { AdditiveBlending, CircleGeometry, Color, Group, InstancedMesh, MeshBasicMaterial, Object3D, Quaternion, Vector3 } from "three";
import { useI18n } from "@/lib/i18n";
import { HAZARD_POINT_SELECT, HAZARDS_EVENT, hazardKind, pointCountry, loadHazardPoints, sourceName, type HazardPoint } from "@/lib/hazard-points";
import { RELIEF, globeState } from "./globe-state";
import { spherePosition } from "./risk-markers";

const RADIUS = 1 + RELIEF + 0.0035; // por encima del relieve y por debajo de las nubes
const up = new Vector3(0, 0, 1);
const tmp = new Vector3();
const tmp2 = new Vector3();
const tmp3 = new Vector3();
const center = new Vector3();

/**
 * Todos los registros reales de amenazas de la base como puntos del planeta.
 * Una sola malla instanciada: miles de puntos sin afectar la fluidez. El tamaño crece con el número
 * de registros del lugar; el color es el tipo de amenaza.
 */
export default function HazardPoints() {
  const { lang } = useI18n();
  const es = lang !== "en";
  const [points, setPoints] = useState<HazardPoint[]>([]);
  const mesh = useRef<InstancedMesh>(null);
  const glowMesh = useRef<InstancedMesh>(null);
  const root = useRef<Group>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const revealAt = useRef<number | null>(null);
  const settled = useRef<string | undefined>(undefined); // punto activo con el que se dejó quieta la malla

  useEffect(() => {
    let alive = true;
    loadHazardPoints().then((data) => {
      if (!alive || !data) return;
      setPoints(data.points);
      window.dispatchEvent(new CustomEvent(HAZARDS_EVENT, { detail: data }));
    });
    return () => { alive = false; };
  }, []);

  // posición, orientación (mirando hacia afuera) y tamaño de cada punto
  const layout = useMemo(() => points.map((p) => {
    const pos = new Vector3(...spherePosition(p.lat, p.lon, RADIUS));
    const quat = new Quaternion().setFromUnitVectors(up, pos.clone().normalize());
    const size = 0.0019 + 0.0016 * Math.log10(p.n + 1);
    return { country: pointCountry(p), kind: p.kind, pos, quat, size, color: new Color(hazardKind(p.kind).color) };
  }), [points]);

  const geometry = useMemo(() => new CircleGeometry(1, 14), []);
  const material = useMemo(() => new MeshBasicMaterial({ transparent: true, opacity: 0.82, depthWrite: false, toneMapped: false }), []);
  const glowMaterial = useMemo(() => new MeshBasicMaterial({ transparent: true, opacity: 0.22, blending: AdditiveBlending, depthWrite: false, toneMapped: false }), []);
  useEffect(() => () => { geometry.dispose(); material.dispose(); glowMaterial.dispose(); }, [geometry, material, glowMaterial]);

  const dummy = useMemo(() => new Object3D(), []);
  useEffect(() => {
    const m = mesh.current;
    const glow = glowMesh.current;
    if (!m || !glow) return;
    layout.forEach((item, i) => {
      m.setColorAt(i, item.color);
      glow.setColorAt(i, item.color);
    });
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    if (glow.instanceColor) glow.instanceColor.needsUpdate = true;
    revealAt.current = null;
  }, [layout]);

  // entrada escalonada al revelar la interfaz; latido suave; se ocultan en «Vigilancia ambiental»
  useFrame(({ clock }) => {
    const m = mesh.current;
    const glow = glowMesh.current;
    if (!m || !glow || !layout.length) return;
    const t = clock.getElapsedTime();
    // en la vista de países se agrupan en el punto del país; aparecen al abrirlo
    const show = globeState.uiRevealed && globeState.mode !== "watch" && globeState.country !== null && globeState.countryZoom > 0;
    m.visible = show;
    glow.visible = show;
    if (!show) { revealAt.current = null; settled.current = undefined; return; }
    if (revealAt.current === null) revealAt.current = t;
    const since = t - revealAt.current;
    const active = pinned ?? hover;
    // terminada la entrada, la malla queda quieta: solo se recalcula si cambia el punto señalado
    const done = since > 0.5 + 60 * 0.012;
    const key = `${active}|${globeState.country}|${globeState.filterVersion}`;
    if (done && settled.current === key) return;
    if (done) settled.current = key;
    for (let i = 0; i < layout.length; i++) {
      const item = layout[i];
      const k = Math.min(1, Math.max(0, (since - (i % 60) * 0.012) / 0.5));
      const here = item.country === globeState.country && !globeState.hiddenKinds.has(item.kind) ? 1 : 0;
      const scale = here * item.size * (k < 1 ? k * (1.4 - 0.4 * k) : 1) * (i === active ? 3 : 1);
      dummy.position.copy(item.pos);
      dummy.quaternion.copy(item.quat);
      dummy.scale.setScalar(Math.max(1e-5, scale));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      dummy.scale.multiplyScalar(1.9);
      dummy.updateMatrix();
      glow.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    glow.instanceMatrix.needsUpdate = true;
  });

  // los puntos son diminutos: se elige el más cercano al cursor en pantalla (máx. ~12 px)
  const { size: view } = useThree();
  const nearest = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    if (!root.current || !(globeState.uiRevealed && globeState.mode !== "watch" && globeState.country !== null)) return null;
    const m = root.current.matrixWorld;
    const camPos = e.camera.position;
    center.setFromMatrixPosition(m);
    let best = -1, bestD = 12 * 12;
    for (let i = 0; i < layout.length; i++) {
      if (layout[i].country !== globeState.country || globeState.hiddenKinds.has(layout[i].kind)) continue;
      tmp.copy(layout[i].pos).applyMatrix4(m);
      // solo la cara visible del planeta
      if (tmp3.copy(tmp).sub(center).dot(tmp2.copy(camPos).sub(tmp)) <= 0) continue;
      tmp.project(e.camera);
      const dx = ((tmp.x - e.pointer.x) * view.width) / 2, dy = ((tmp.y - e.pointer.y) * view.height) / 2;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best >= 0 ? best : null;
  };
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    const i = nearest(e);
    setHover(i);
    if (i !== null) { e.stopPropagation(); document.body.style.cursor = "pointer"; }
    else if (hover !== null) document.body.style.cursor = "";
  };
  const onOut = () => { setHover(null); document.body.style.cursor = ""; };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    const i = nearest(e);
    if (i === null) { setPinned(null); window.dispatchEvent(new CustomEvent(HAZARD_POINT_SELECT, { detail: null })); return; }
    e.stopPropagation();
    // A second click on the same marker must keep its detail panel open.
    setPinned(i);
    window.dispatchEvent(new CustomEvent(HAZARD_POINT_SELECT, { detail: points[i] }));
  };

  const shown = pinned ?? hover;
  const p = shown !== null ? points[shown] : null;
  const fmt = (n: number) => n.toLocaleString(es ? "es-CO" : "en-US");

  if (!points.length) return null;
  return (
    <group ref={root}>
      <instancedMesh ref={glowMesh} args={[geometry, glowMaterial, points.length]} frustumCulled={false} renderOrder={2} raycast={() => null} />
      <instancedMesh ref={mesh} args={[geometry, material, points.length]} frustumCulled={false} renderOrder={3} raycast={() => null} />
      {/* esfera invisible que recibe el cursor para encontrar el punto más cercano */}
      <mesh onPointerMove={onMove} onPointerOut={onOut} onClick={onClick}>
        <sphereGeometry args={[RADIUS, 48, 24]} />
        <meshBasicMaterial colorWrite={false} depthWrite={false} transparent opacity={0} />
      </mesh>
      {p && shown !== null && (
        <Html position={layout[shown].pos} center zIndexRange={[30, 20]} style={{ pointerEvents: "none" }}>
          <div className="hz-card" style={{ "--c": hazardKind(p.kind).color } as React.CSSProperties}>
            <span className="hz-kind"><i />{hazardKind(p.kind)[es ? "es" : "en"]}</span>
            <strong>{p.place || (es ? "Registro con coordenadas" : "Georeferenced record")}</strong>
            <span className="hz-line">
              <b>{fmt(p.n)}</b> {p.record_label?.[es ? "es" : "en"] ?? (p.n === 1 ? (es ? "registro" : "record") : (es ? "registros" : "records"))}
              {p.last && <> · {p.first && p.first !== p.last ? `${p.first.slice(0, 4)}–${p.last.slice(0, 4)}` : p.last.slice(0, 10)}</>}
            </span>
            {p.model_anomaly_index != null && (
              <span className="hz-impact">{es ? "Índice de anomalía exploratorio" : "Exploratory anomaly index"}: {p.model_anomaly_index.toFixed(1)}</span>
            )}
            {(p.deaths > 0 || p.affected > 0 || p.homes > 0) && (
              <span className="hz-impact">
                {p.affected > 0 && <span>{fmt(p.affected)} {es ? "personas afectadas" : "people affected"}</span>}
                {p.homes > 0 && <span>{fmt(p.homes)} {es ? "viviendas" : "homes"}</span>}
                {p.deaths > 0 && <span>{fmt(p.deaths)} {es ? "fallecidos" : "deaths"}</span>}
              </span>
            )}
            <span className="hz-src">{p.type} · {Array.from(new Set(p.sources.map(sourceName))).join(" · ")}</span>
          </div>
        </Html>
      )}
    </group>
  );
}
