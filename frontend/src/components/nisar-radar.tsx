"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, DoubleSide, type MeshBasicMaterial, type ShaderMaterial } from "three";
import type { MotionValue } from "framer-motion";
import { FOOTPRINT_LOCAL, OVER_RELIEF, SCAN_GRID_DEGREES, globeState } from "./globe/globe-state";

// Artistic side-looking footprint; not an acquisition polygon or live telemetry.
// The surface is sampled on a sphere so the swath never becomes a flat decal.
const SHELL = OVER_RELIEF;
const HALF_CELL = SCAN_GRID_DEGREES * Math.PI / 360;
const CENTER_LAT = Math.asin(FOOTPRINT_LOCAL.z / SHELL);
const ACROSS_MIN = SHELL * Math.sin(CENTER_LAT - HALF_CELL);
const ACROSS_MAX = SHELL * Math.sin(CENTER_LAT + HALF_CELL);
function surface(along: number, across: number): [number, number, number] {
  const radius = Math.sqrt(SHELL * SHELL - across * across);
  return [radius * Math.cos(along), radius * Math.sin(along), across];
}

function makeGeometry(apex: [number, number, number]) {
  const corners = [surface(-HALF_CELL, ACROSS_MIN), surface(HALF_CELL, ACROSS_MIN), surface(HALF_CELL, ACROSS_MAX), surface(-HALF_CELL, ACROSS_MAX)];
  const beam: number[] = [];
  const beamUv: number[] = [];
  for (let index = 0; index < 4; index++) {
    // el haz nace en la apertura de la antena del satélite
    beam.push(...apex, ...corners[index], ...corners[(index + 1) % 4]);
    beamUv.push(0.5, 0, 0, 1, 1, 1);
  }
  const swath: number[] = [];
  const swathUv: number[] = [];
  for (let index = 0; index < 36; index++) {
    const a = -0.42 + index * (0.42 + HALF_CELL) / 36;
    const b = -0.42 + (index + 1) * (0.42 + HALF_CELL) / 36;
    swath.push(...surface(a, ACROSS_MIN), ...surface(b, ACROSS_MIN), ...surface(b, ACROSS_MAX),
      ...surface(a, ACROSS_MIN), ...surface(b, ACROSS_MAX), ...surface(a, ACROSS_MAX));
    const u = index / 36;
    const v = (index + 1) / 36;
    swathUv.push(0, u, 0, v, 1, v, 0, u, 1, v, 1, u);
  }
  return { beam: new Float32Array(beam), beamUv: new Float32Array(beamUv),
    swath: new Float32Array(swath), swathUv: new Float32Array(swathUv),
    footprint: new Float32Array([...corners[0], ...corners[1], ...corners[2], ...corners[0], ...corners[2], ...corners[3]]) };
}

const vertex = `
  varying vec2 radarUv;
  void main() {
    radarUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export default function NisarRadar({ apex, playing, progress }: {
  radius: number; apex: [number, number, number]; playing: boolean; progress: MotionValue<number>;
}) {
  const beam = useRef<ShaderMaterial>(null);
  const swath = useRef<ShaderMaterial>(null);
  const footprint = useRef<MeshBasicMaterial>(null);
  const elapsed = useRef(0);
  const [ax, ay, az] = apex;
  const geometry = useMemo(() => makeGeometry([ax, ay, az]), [ax, ay, az]);
  const beamUniforms = useMemo(() => ({ time: { value: 0 }, visibility: { value: 0 } }), []);
  const swathUniforms = useMemo(() => ({ visibility: { value: 0 } }), []);

  useFrame((_, delta) => {
    if (playing) elapsed.current += Math.min(delta, 0.1);
    // El haz permanece encendido: la onda animada representa el barrido que recorre la franja.
    const operationalPulse = 0.9 + 0.05 * Math.sin(elapsed.current * 1.6);
    const scrollFactor = 0.85 + Math.min(1, Math.max(0, progress.get())) * 0.15;
    const reveal = Math.min(1, Math.max(globeState.beam, operationalPulse) * scrollFactor);
    const visibility = reveal * reveal * (3 - 2 * reveal);
    if (beam.current) {
      beam.current.uniforms.time.value = elapsed.current;
      beam.current.uniforms.visibility.value = visibility;
    }
    if (swath.current) swath.current.uniforms.visibility.value = visibility;
    if (footprint.current) footprint.current.opacity = visibility * 0.24;
  });

  return (
    <group>
      <mesh>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[geometry.beam, 3]} />
          <bufferAttribute attach="attributes-uv" args={[geometry.beamUv, 2]} />
        </bufferGeometry>
        <shaderMaterial ref={beam} uniforms={beamUniforms} transparent depthWrite={false}
          side={DoubleSide} blending={AdditiveBlending} vertexShader={vertex}
          fragmentShader={`
            varying vec2 radarUv;
            uniform float time;
            uniform float visibility;
            void main() {
              float wave = pow(max(0.0, 1.0 - abs(fract(radarUv.y * 1.25 - time * 0.42) - 0.5) * 2.0), 22.0);
              float core = pow(max(0.0, 1.0 - abs(radarUv.x * 2.0 - 1.0)), 5.0);
              float edge = pow(abs(radarUv.x * 2.0 - 1.0), 8.0);
              float alpha = (0.07 + wave * 0.2 + core * 0.07 + edge * 0.035) * radarUv.y * visibility;
              gl_FragColor = vec4(0.38, 0.82, 0.86, alpha);
            }
          `} />
      </mesh>
      <mesh>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[geometry.swath, 3]} />
          <bufferAttribute attach="attributes-uv" args={[geometry.swathUv, 2]} />
        </bufferGeometry>
        <shaderMaterial ref={swath} uniforms={swathUniforms} transparent depthWrite={false}
          side={DoubleSide} blending={AdditiveBlending} vertexShader={vertex}
          fragmentShader={`
            varying vec2 radarUv;
            uniform float visibility;
            void main() {
              float edge = smoothstep(0.0, 0.08, radarUv.x) * smoothstep(0.0, 0.08, 1.0 - radarUv.x);
              float tail = pow(radarUv.y, 2.0);
              gl_FragColor = vec4(0.27, 0.74, 0.78, edge * tail * visibility * 0.20);
            }
          `} />
      </mesh>
      <mesh>
        <bufferGeometry><bufferAttribute attach="attributes-position" args={[geometry.footprint, 3]} /></bufferGeometry>
        <meshBasicMaterial ref={footprint} color="#8ce4df" transparent opacity={0}
          side={DoubleSide} blending={AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  );
}
