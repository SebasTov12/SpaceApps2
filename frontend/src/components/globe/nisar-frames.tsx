"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { BufferAttribute, BufferGeometry, DoubleSide, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, ShapeUtils, Vector2, Vector3 } from "three";
import { NISAR_COLOR, NISAR_EVENT, NISAR_KIND, frameCountry, loadNisarScenes, type NisarFrame } from "@/lib/nisar-scenes";
import { RELIEF, globeState } from "./globe-state";
import { spherePosition } from "./risk-markers";

const R = 1 + RELIEF + 0.009;
const v3 = (lat: number, lon: number, r: number) => new Vector3(...spherePosition(lat, lon, r));

/** Huellas reales de las escenas NISAR (catálogo de ASF guardado en la base), dentro del país abierto. */
export default function NisarFrames() {
  const [frames, setFrames] = useState<NisarFrame[]>([]);
  const lineRef = useRef<LineSegments>(null);
  const fillRef = useRef<Mesh>(null);
  const fade = useRef(0);

  useEffect(() => {
    let alive = true;
    loadNisarScenes().then((data) => {
      if (!alive || !data) return;
      setFrames(data.frames);
      window.dispatchEvent(new CustomEvent(NISAR_EVENT, { detail: data }));
    });
    return () => { alive = false; };
  }, []);

  const geo = useMemo(() => {
    if (!frames.length) return null;
    const line: number[] = [], fill: number[] = [], index: number[] = [];
    for (const frame of frames) {
      const ring = frame.footprint;
      for (let i = 0; i < ring.length; i++) {
        const a = v3(ring[i][1], ring[i][0], R), b = v3(ring[(i + 1) % ring.length][1], ring[(i + 1) % ring.length][0], R);
        line.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
      const base = fill.length / 3;
      ring.forEach(([lon, lat]) => { const p = v3(lat, lon, R - 0.001); fill.push(p.x, p.y, p.z); });
      for (const t of ShapeUtils.triangulateShape(ring.map(([lon, lat]) => new Vector2(lon, lat)), [])) index.push(base + t[0], base + t[1], base + t[2]);
    }
    const lineGeo = new BufferGeometry();
    lineGeo.setAttribute("position", new BufferAttribute(new Float32Array(line), 3));
    const fillGeo = new BufferGeometry();
    fillGeo.setAttribute("position", new BufferAttribute(new Float32Array(fill), 3));
    fillGeo.setIndex(index);
    return { lineGeo, fillGeo };
  }, [frames]);
  useEffect(() => () => { geo?.lineGeo.dispose(); geo?.fillGeo.dispose(); }, [geo]);
  const mats = useMemo(() => ({
    line: new LineBasicMaterial({ color: NISAR_COLOR, transparent: true, opacity: 0, depthWrite: false }),
    fill: new MeshBasicMaterial({ color: NISAR_COLOR, transparent: true, opacity: 0, depthWrite: false, side: DoubleSide }),
  }), []);
  useEffect(() => () => { mats.line.dispose(); mats.fill.dispose(); }, [mats]);
  const country = useMemo(() => (frames[0] ? frameCountry(frames[0]) : null), [frames]);

  useFrame(({ clock }) => {
    const on = globeState.country !== null && globeState.country === country && globeState.mode !== "watch" && !globeState.hiddenKinds.has(NISAR_KIND);
    fade.current += ((on ? 1 : 0) - fade.current) * 0.08;
    const pulse = 0.75 + 0.25 * Math.sin(clock.getElapsedTime() * 1.6);
    const l = lineRef.current?.material as LineBasicMaterial | undefined;
    if (l) l.opacity = 0.9 * fade.current * pulse;
    const f = fillRef.current?.material as MeshBasicMaterial | undefined;
    if (f) f.opacity = 0.07 * fade.current;
    if (lineRef.current) lineRef.current.visible = fade.current > 0.01;
    if (fillRef.current) fillRef.current.visible = fade.current > 0.01;
  });

  if (!geo) return null;
  return (
    <group>
      <mesh ref={fillRef} geometry={geo.fillGeo} material={mats.fill} renderOrder={2} raycast={() => null} />
      <lineSegments ref={lineRef} geometry={geo.lineGeo} material={mats.line} renderOrder={4} raycast={() => null} />
    </group>
  );
}
