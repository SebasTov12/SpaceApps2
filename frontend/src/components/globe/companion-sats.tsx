"use client";

import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { DoubleSide, type Group } from "three";

type Orbit = { radius: number; tilt: [number, number, number]; speed: number; phase: number; color: string; scale: number };

// Satélites acompañantes ilustrativos (constelación de observación); NISAR es el único con haz de detección
const ORBITS: Orbit[] = [
  { radius: 1.34, tilt: [1.15, 0.4, 0.2], speed: -0.11, phase: 2.1, color: "#8b5cf6", scale: 0.05 },
  { radius: 1.48, tilt: [-0.55, -0.9, 0.75], speed: 0.075, phase: 4.4, color: "#00d4ff", scale: 0.042 },
];

function circle(radius: number, segments = 140): [number, number, number][] {
  return Array.from({ length: segments + 1 }, (_, i) => {
    const a = (i / segments) * Math.PI * 2;
    return [Math.cos(a) * radius, Math.sin(a) * radius, 0];
  });
}

function trail(radius: number, sign: number): [number, number, number][][] {
  return Array.from({ length: 10 }, (_, i) => {
    const a0 = -sign * (0.5 - i * 0.05);
    const a1 = -sign * (0.5 - (i + 1) * 0.05);
    return [[Math.cos(a0) * radius, Math.sin(a0) * radius, 0], [Math.cos(a1) * radius, Math.sin(a1) * radius, 0]];
  });
}

/** Satélite sencillo: cuerpo, antena y dos paneles solares. */
function SmallSat({ color }: { color: string }) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.7, 0.45, 0.45]} />
        <meshStandardMaterial color="#c9d3e6" metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.9, 0]}>
        <boxGeometry args={[0.6, 1.3, 0.04]} />
        <meshStandardMaterial color="#1b3a8f" metalness={0.4} roughness={0.4} emissive={color} emissiveIntensity={0.15} />
      </mesh>
      <mesh position={[0, -0.9, 0]}>
        <boxGeometry args={[0.6, 1.3, 0.04]} />
        <meshStandardMaterial color="#1b3a8f" metalness={0.4} roughness={0.4} emissive={color} emissiveIntensity={0.15} />
      </mesh>
      <mesh position={[-0.45, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <coneGeometry args={[0.28, 0.25, 20, 1, true]} />
        <meshStandardMaterial color="#e8eef8" metalness={0.5} roughness={0.3} side={DoubleSide} />
      </mesh>
      <mesh position={[0.5, 0, 0]}>
        <sphereGeometry args={[0.09, 12, 8]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Companion({ orbit, playing }: { orbit: Orbit; playing: boolean }) {
  const moving = useRef<Group>(null);
  const path = useMemo(() => circle(orbit.radius), [orbit.radius]);
  const tail = useMemo(() => trail(orbit.radius, Math.sign(orbit.speed)), [orbit.radius, orbit.speed]);
  useFrame((_, delta) => {
    if (moving.current && playing) moving.current.rotation.z += Math.min(delta, 0.1) * orbit.speed;
  });
  return (
    <group rotation={orbit.tilt}>
      <Line points={path} color={orbit.color} lineWidth={0.6} transparent opacity={0.12} depthWrite={false} />
      <group ref={moving} rotation={[0, 0, orbit.phase]}>
        {tail.map((points, i) => (
          <Line key={i} points={points} color={orbit.color} lineWidth={1} transparent opacity={0.04 + (i / 9) ** 2 * 0.4} depthWrite={false} />
        ))}
        <group position={[orbit.radius, 0, 0]} scale={orbit.scale}>
          <SmallSat color={orbit.color} />
        </group>
      </group>
    </group>
  );
}

export default function CompanionSats({ playing }: { playing: boolean }) {
  return (
    <group>
      {ORBITS.map((orbit, i) => <Companion key={i} orbit={orbit} playing={playing} />)}
    </group>
  );
}
