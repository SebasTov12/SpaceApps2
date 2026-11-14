"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { DoubleSide, type Group, type Mesh, type MeshBasicMaterial } from "three";
import { riskKinds, riskZones, type RiskZone } from "@/lib/risk-zones";
import { GLOBE_SELECT, focusZone, globeState } from "./globe-state";

/** Posición en la esfera de three.js (SphereGeometry con textura equirectangular). */
export function spherePosition(lat: number, lon: number, radius: number): [number, number, number] {
  const phi = ((lon + 180) / 360) * Math.PI * 2;
  const theta = ((90 - lat) / 180) * Math.PI;
  return [-Math.cos(phi) * Math.sin(theta) * radius, Math.cos(theta) * radius, Math.sin(phi) * Math.sin(theta) * radius];
}

const easeOutBack = (t: number) => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);

function Marker({ zone, selected, index }: { zone: RiskZone; selected: boolean; index: number }) {
  const group = useRef<Group>(null);
  const core = useRef<Mesh>(null);
  const idle = useRef<Mesh>(null);
  const burst = useRef<Mesh>(null);
  const halo = useRef<Mesh>(null);
  const revealAt = useRef<number | null>(null);
  const [hover, setHover] = useState(false);
  const position = useMemo(() => spherePosition(zone.lat, zone.lon, 1.014), [zone.lat, zone.lon]);
  const color = riskKinds[zone.kind].color;
  const size = zone.siteId ? 0.017 : 0.012;

  useEffect(() => {
    const node = group.current;
    if (!node) return;
    node.lookAt(position[0] * 2, position[1] * 2, position[2] * 2);
    globeState.markers.set(zone.id, node);
    return () => {
      globeState.markers.delete(zone.id);
    };
  }, [position, zone.id]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const node = group.current;
    if (!node) return;
    if (!globeState.revealed.has(zone.id)) {
      node.scale.setScalar(0.0001);
      return;
    }
    if (revealAt.current === null) revealAt.current = t;
    const pop = Math.min(1, (t - revealAt.current) / 0.7);
    node.scale.setScalar(Math.max(0.0001, easeOutBack(pop)) * (hover ? 1.5 : 1) * (selected ? 1.35 : 1));

    // pulso suave permanente
    if (idle.current) {
      const p = (t * 0.55 + index * 0.137) % 1;
      idle.current.scale.setScalar(1 + p * 2.2);
      (idle.current.material as MeshBasicMaterial).opacity = 0.55 * (1 - p);
    }
    // destello cuando el reconocimiento la descubre o el haz pasa encima
    const flashAt = Math.max(globeState.flashes.get(zone.id) ?? -99, revealAt.current);
    const f = (t - flashAt) / 1.6;
    if (burst.current) {
      const active = f >= 0 && f < 1;
      burst.current.visible = active;
      if (active) {
        burst.current.scale.setScalar(1 + f * 6);
        (burst.current.material as MeshBasicMaterial).opacity = 0.9 * (1 - f) ** 2;
      }
    }
    if (core.current) core.current.scale.setScalar(f >= 0 && f < 0.5 ? 1 + Math.sin(f * Math.PI * 2) * 0.6 : 1);
    if (halo.current) (halo.current.material as MeshBasicMaterial).opacity = selected ? 0.95 : zone.siteId ? 0.6 : 0;
  });

  return (
    <group ref={group} position={position}>
      <mesh
        ref={core}
        onClick={(event) => {
          event.stopPropagation();
          if (globeState.user.moved > 6) return; // fue un arrastre, no un clic
          focusZone(zone.id);
        }}
        onPointerOver={(event) => { event.stopPropagation(); setHover(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHover(false); document.body.style.cursor = ""; }}
      >
        <circleGeometry args={[size, 24]} />
        <meshBasicMaterial color={color} side={DoubleSide} toneMapped={false} />
      </mesh>
      <mesh ref={halo}>
        <ringGeometry args={[size * 1.45, size * 1.75, 32]} />
        <meshBasicMaterial color={selected ? "#ffffff" : color} transparent opacity={0} side={DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={idle}>
        <ringGeometry args={[size * 1.1, size * 1.35, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} side={DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={burst} visible={false}>
        <ringGeometry args={[size * 1.2, size * 1.6, 40]} />
        <meshBasicMaterial color="#e9fbff" transparent opacity={0} side={DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Zonas de riesgo sobre la superficie: giran con la Tierra. */
export default function RiskMarkers() {
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    const onSelect = (event: Event) => setSelected((event as CustomEvent<string | null>).detail);
    window.addEventListener(GLOBE_SELECT, onSelect);
    return () => window.removeEventListener(GLOBE_SELECT, onSelect);
  }, []);
  return (
    <group>
      {riskZones.map((zone, index) => <Marker key={zone.id} zone={zone} index={index} selected={selected === zone.id} />)}
    </group>
  );
}
