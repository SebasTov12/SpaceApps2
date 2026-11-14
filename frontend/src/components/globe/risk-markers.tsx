"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { AdditiveBlending, Color, DoubleSide, type Group, type Mesh, type MeshBasicMaterial, type ShaderMaterial } from "three";
import { riskKinds, riskZones, type RiskZone } from "@/lib/risk-zones";
import { GLOBE_SELECT, focusZone, globeState } from "./globe-state";

/** Posición en la esfera de three.js (SphereGeometry con textura equirectangular). */
export function spherePosition(lat: number, lon: number, radius: number): [number, number, number] {
  const phi = ((lon + 180) / 360) * Math.PI * 2;
  const theta = ((90 - lat) / 180) * Math.PI;
  return [-Math.cos(phi) * Math.sin(theta) * radius, Math.cos(theta) * radius, Math.sin(phi) * Math.sin(theta) * radius];
}

const easeOutBack = (t: number) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

// Columna de luz: degradado que se desvanece hacia arriba
const pillarVertex = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const pillarFragment = `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float fade = pow(1.0 - vUv.y, 1.6);
    gl_FragColor = vec4(uColor, fade * uOpacity);
  }
`;

function Marker({ zone, selected, index }: { zone: RiskZone; selected: boolean; index: number }) {
  const group = useRef<Group>(null);
  const body = useRef<Group>(null);
  const pillar = useRef<Group>(null);
  const pillarMaterial = useRef<ShaderMaterial>(null);
  const pulse = useRef<Mesh>(null);
  const burst = useRef<Mesh>(null);
  const base = useRef<Mesh>(null);
  const revealAt = useRef<number | null>(null);
  const [hover, setHover] = useState(false);
  const color = riskKinds[zone.kind].color;
  const position = useMemo(() => spherePosition(zone.lat, zone.lon, 1.002), [zone.lat, zone.lon]);
  const size = zone.siteId ? 0.013 : 0.0095;
  const pillarHeight = zone.siteId ? 0.075 : 0.05;
  const uniforms = useMemo(() => ({ uColor: { value: new Color(color) }, uOpacity: { value: 0 } }), [color]);

  useEffect(() => {
    const node = group.current;
    if (!node) return;
    node.lookAt(position[0] * 2, position[1] * 2, position[2] * 2); // +Z hacia fuera de la superficie
    globeState.markers.set(zone.id, node);
    return () => {
      globeState.markers.delete(zone.id);
    };
  }, [position, zone.id]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const node = body.current;
    if (!node) return;
    if (!globeState.revealed.has(zone.id)) {
      node.visible = false;
      return;
    }
    node.visible = true;
    if (revealAt.current === null) revealAt.current = t;
    const appear = clamp01((t - revealAt.current) / 0.8);
    const emphasis = (hover ? 1.35 : 1) * (selected ? 1.25 : 1);
    node.scale.setScalar(Math.max(0.001, easeOutBack(appear)) * emphasis);

    // pasada del haz: la columna se alarga un instante y sale un anillo suave
    const flashAt = globeState.flashes.get(zone.id) ?? -99;
    const f = (t - flashAt) / 1.8;
    const flashing = f >= 0 && f < 1;
    const boost = flashing ? Math.sin(f * Math.PI) : 0;
    if (pillar.current) pillar.current.scale.set(1, 1, Math.max(0.001, appear * (1 + boost * 1.4 + (selected ? 0.5 : 0))));
    if (pillarMaterial.current) pillarMaterial.current.uniforms.uOpacity.value = 0.55 + boost * 0.4 + (selected ? 0.2 : 0);

    if (pulse.current) {
      const p = (t * 0.45 + index * 0.137) % 1;
      pulse.current.scale.setScalar(1 + p * 2.6);
      (pulse.current.material as MeshBasicMaterial).opacity = 0.32 * (1 - p) * appear;
    }
    if (burst.current) {
      burst.current.visible = flashing;
      if (flashing) {
        burst.current.scale.setScalar(1 + f * 4.5);
        (burst.current.material as MeshBasicMaterial).opacity = 0.5 * (1 - f) ** 2;
      }
    }
    if (base.current) (base.current.material as MeshBasicMaterial).opacity = selected || hover ? 0.95 : 0.6;
  });

  const select = () => {
    if (globeState.user.moved > 6) return; // fue un arrastre, no un clic
    focusZone(zone.id);
  };

  return (
    <group ref={group} position={position}>
      <group ref={body} visible={false}>
        {/* anillo de base, apoyado en la superficie */}
        <mesh ref={base} position={[0, 0, 0.002]}>
          <ringGeometry args={[size * 1.25, size * 1.6, 40]} />
          <meshBasicMaterial color={selected ? "#ffffff" : color} transparent opacity={0.6} side={DoubleSide} depthWrite={false} toneMapped={false} />
        </mesh>
        {/* pulso que se expande sobre el terreno */}
        <mesh ref={pulse} position={[0, 0, 0.0025]}>
          <ringGeometry args={[size * 1.3, size * 1.5, 40]} />
          <meshBasicMaterial color={color} transparent opacity={0} side={DoubleSide} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh ref={burst} position={[0, 0, 0.003]} visible={false}>
          <ringGeometry args={[size * 1.4, size * 1.75, 48]} />
          <meshBasicMaterial color="#e6fbff" transparent opacity={0} side={DoubleSide} depthWrite={false} toneMapped={false} />
        </mesh>
        {/* cúpula iluminada por la escena: se integra con el relieve */}
        <mesh
          rotation={[Math.PI / 2, 0, 0]}
          onClick={(event) => { event.stopPropagation(); select(); }}
          onPointerOver={(event) => { event.stopPropagation(); setHover(true); document.body.style.cursor = "pointer"; }}
          onPointerOut={() => { setHover(false); document.body.style.cursor = ""; }}
        >
          <sphereGeometry args={[size, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.55} roughness={0.35} metalness={0.2} />
        </mesh>
        {/* columna de luz hacia el espacio; el grupo se estira desde la base (eje Z = hacia fuera) */}
        <group ref={pillar}>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, pillarHeight / 2]}>
            <cylinderGeometry args={[size * 0.28, size * 0.5, pillarHeight, 16, 1, true]} />
            <shaderMaterial ref={pillarMaterial} uniforms={uniforms} vertexShader={pillarVertex} fragmentShader={pillarFragment}
              transparent depthWrite={false} blending={AdditiveBlending} side={DoubleSide} />
          </mesh>
        </group>
      </group>
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
