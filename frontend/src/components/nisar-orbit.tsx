"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import type { Group } from "three";
import NisarModel from "./nisar-model";
import NisarRadar from "./nisar-radar";
import type { MotionValue } from "framer-motion";
import { globeState } from "./globe/globe-state";

// Distances/speeds are illustrative, with enough separation to read the orbit.
const RADIUS = 1.22;

function arc(start: number, end: number, segments: number): [number, number, number][] {
  return Array.from({ length: segments + 1 }, (_, index) => {
    const angle = start + (end - start) * index / segments;
    return [Math.cos(angle) * RADIUS, Math.sin(angle) * RADIUS, 0];
  });
}

export default function NisarOrbit({ playing, progress }: { playing: boolean; progress: MotionValue<number> }) {
  const moving = useRef<Group>(null);
  const orbit = useMemo(() => arc(0, Math.PI * 2, 160), []);
  const trail = useMemo(() => Array.from({ length: 16 }, (_, index) =>
    arc(-0.72 + index * 0.045, -0.72 + (index + 1) * 0.045, 4)), []);

  // La huella del haz se calcula desde este grupo (detección de zonas)
  useEffect(() => {
    globeState.orbit = moving.current;
    return () => {
      globeState.orbit = null;
    };
  }, []);

  useFrame((_, delta) => {
    if (moving.current && playing) {
      moving.current.rotation.z = (moving.current.rotation.z + Math.min(delta, 0.1) * 0.14) % (Math.PI * 2);
    }
  });

  return (
    <group rotation={[0.18, 1.0, -0.42]}>
      <Line points={orbit} color="#97b5c6" lineWidth={0.65} transparent opacity={0.12} depthWrite={false} />
      <group ref={moving} rotation={[0, 0, 1.5]}>
        <NisarRadar radius={RADIUS} playing={playing} progress={progress} />
        {trail.map((points, index) => (
          <Line key={index} points={points} color="#c8e3f2" lineWidth={1.15}
            transparent opacity={0.025 + (index / 15) ** 2 * 0.5} depthWrite={false} />
        ))}
        {/* Local -X points toward Earth and +Y follows the orbit tangent. */}
        <group position={[RADIUS, 0, 0]} scale={0.145}>
          <NisarModel />
        </group>
      </group>
    </group>
  );
}
