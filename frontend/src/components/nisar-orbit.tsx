"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { Matrix4, Quaternion, Vector3, type Group } from "three";
import NisarModel from "./nisar-model";
import NisarRadar from "./nisar-radar";
import type { MotionValue } from "framer-motion";
import { globeState } from "./globe/globe-state";

// Distances/speeds are illustrative, with enough separation to read the orbit.
const RADIUS = 1.22;
const MODEL_SCALE = 0.145;
const SPEED = 0.2; // rad/s

/**
 * Centro de la apertura del reflector en coordenadas del modelo (ver nisar-model: Reflector en
 * [-0.30, 0.49, 0.06] girado 1.02 rad en Z; la apertura queda ~0.12 sobre el vértice).
 * El modelo se gira 90° en X para que la antena mire de lado, como el radar real de NISAR.
 */
const APERTURE_MODEL = new Vector3(-0.30 - 0.12 * Math.sin(1.02), 0.49 + 0.12 * Math.cos(1.02), 0.06);
export const ANTENNA_LOCAL: [number, number, number] = (() => {
  const p = APERTURE_MODEL.clone().applyAxisAngle(new Vector3(1, 0, 0), Math.PI / 2).multiplyScalar(MODEL_SCALE);
  return [RADIUS + p.x, p.y, p.z];
})();

/**
 * Recorrido en "asterisco": cada pasada cruza el disco visible en otra dirección
 * (horizontal, vertical y diagonales). El plano contiene el eje de la cámara, ligeramente
 * inclinado para dar profundidad, y cambia mientras el satélite está detrás de la Tierra.
 */
const DIRECTIONS = [0, 90, 45, 135, 20, 110, 65, 155].map((deg) => (deg * Math.PI) / 180);

function planeFor(theta: number) {
  const across = new Vector3(Math.cos(theta), Math.sin(theta), 0);          // eje X local: cruza la pantalla
  const towardCamera = new Vector3(-0.28 * Math.sin(theta), 0.28 * Math.cos(theta), 1).normalize(); // eje Y local
  const normal = new Vector3().crossVectors(across, towardCamera);
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(across, towardCamera, normal));
}

function arc(start: number, end: number, segments: number): [number, number, number][] {
  return Array.from({ length: segments + 1 }, (_, index) => {
    const angle = start + (end - start) * index / segments;
    return [Math.cos(angle) * RADIUS, Math.sin(angle) * RADIUS, 0];
  });
}

export default function NisarOrbit({ playing, progress }: { playing: boolean; progress: MotionValue<number> }) {
  const moving = useRef<Group>(null);
  const plane = useRef<Group>(null);
  const orbit = useMemo(() => arc(0, Math.PI * 2, 160), []);
  const trail = useMemo(() => Array.from({ length: 16 }, (_, index) =>
    arc(-0.72 + index * 0.045, -0.72 + (index + 1) * 0.045, 4)), []);
  const planes = useMemo(() => DIRECTIONS.map(planeFor), []);
  const course = useRef({ index: 0, from: planes[0].clone(), blend: 1, angle: 2.2 });

  // La huella del haz se calcula desde este grupo (detección de zonas)
  useEffect(() => {
    globeState.orbit = moving.current;
    plane.current?.quaternion.copy(planes[0]);
    return () => {
      globeState.orbit = null;
    };
  }, [planes]);

  useFrame((_, delta) => {
    if (!playing || !moving.current || !plane.current) return;
    const step = Math.min(delta, 0.1);
    const c = course.current;
    const before = c.angle;
    c.angle = (c.angle + step * SPEED) % (Math.PI * 2);
    moving.current.rotation.z = c.angle;

    // Al pasar por detrás de la Tierra (ángulo ~ 3π/2) empieza el cambio al siguiente trayecto
    const trigger = Math.PI * 1.25;
    if (before < trigger && c.angle >= trigger) {
      c.from.copy(plane.current.quaternion);
      c.index = (c.index + 1) % planes.length;
      c.blend = 0;
    }
    if (c.blend < 1) {
      c.blend = Math.min(1, c.blend + step / 3.2);
      const t = c.blend * c.blend * (3 - 2 * c.blend);
      plane.current.quaternion.slerpQuaternions(c.from, planes[c.index], t);
    }
  });

  return (
    <group ref={plane}>
      <Line points={orbit} color="#7fd8ff" lineWidth={0.65} transparent opacity={0.12} depthWrite={false} />
      <group ref={moving} rotation={[0, 0, 2.2]}>
        <NisarRadar radius={RADIUS} apex={ANTENNA_LOCAL} playing={playing} progress={progress} />
        {trail.map((points, index) => (
          <Line key={index} points={points} color="#c8e3f2" lineWidth={1.15}
            transparent opacity={0.025 + (index / 15) ** 2 * 0.5} depthWrite={false} />
        ))}
        {/* Local -X mira a la Tierra y +Y sigue la órbita; el giro en X deja la antena mirando de lado (hacia la franja). */}
        <group position={[RADIUS, 0, 0]} rotation={[Math.PI / 2, 0, 0]} scale={MODEL_SCALE}>
          <NisarModel />
        </group>
      </group>
    </group>
  );
}
