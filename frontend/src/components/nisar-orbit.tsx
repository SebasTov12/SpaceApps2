"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Line, useTexture } from "@react-three/drei";
import { useReducedMotion } from "framer-motion";
import { SRGBColorSpace, type Group } from "three";

const RADIUS = 1.28;

function arc(start: number, end: number, segments: number): [number, number, number][] {
  return Array.from({ length: segments + 1 }, (_, index) => {
    const angle = start + (end - start) * index / segments;
    return [Math.cos(angle) * RADIUS, Math.sin(angle) * RADIUS, 0];
  });
}

export default function NisarOrbit() {
  const moving = useRef<Group>(null);
  const reducedMotion = useReducedMotion();
  const texture = useTexture("/nisar-side-tilt.png", (image) => {
    image.colorSpace = SRGBColorSpace;
  });
  const orbit = useMemo(() => arc(0, Math.PI * 2, 160), []);
  const trail = useMemo(() => [
    arc(-0.65, -0.4, 20),
    arc(-0.4, -0.18, 20),
    arc(-0.18, 0, 20),
  ], []);

  useFrame((_, delta) => {
    if (moving.current && !reducedMotion) {
      moving.current.rotation.z += Math.min(delta, 0.05) * 0.11;
    }
  });

  return (
    <group rotation={[1.05, 0.35, -0.45]}>
      <Line points={orbit} color="#a9d8e6" lineWidth={0.6} transparent opacity={0.13} depthWrite={false} />
      <group ref={moving} rotation={[0, 0, 1.5]}>
        {trail.map((points, index) => (
          <Line key={index} points={points} color="#b5eaff" lineWidth={1}
            transparent opacity={0.12 + index * 0.14} depthWrite={false} />
        ))}
        {/* The image remains a temporary visual until the spacecraft model phase. */}
        <sprite position={[RADIUS, 0, 0]} scale={[0.28, 0.242, 1]}>
          <spriteMaterial map={texture} transparent alphaTest={0.03} depthTest depthWrite={false} />
        </sprite>
      </group>
    </group>
  );
}
