"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, DoubleSide, Vector3, type ShaderMaterial } from "three";
import type { MotionValue } from "framer-motion";
import { FOOTPRINT_LOCAL, OVER_RELIEF, globeState } from "./globe/globe-state";

// Artistic side-looking footprint; not an acquisition polygon or live telemetry.
// The surface is sampled on a sphere so the swath never becomes a flat decal.
const SHELL = OVER_RELIEF;
// La huella supera el radio de los detectores secundarios y se difumina en la superficie.
const FOOTPRINT_RADIUS = 0.13;
const ANTENNA_RADIUS = 0.046;
const FOOTPRINT_CENTER = FOOTPRINT_LOCAL.clone().setLength(SHELL);
const FOOTPRINT_NORMAL = FOOTPRINT_CENTER.clone().normalize();
const FOOTPRINT_U = new Vector3(0, 1, 0);
const FOOTPRINT_V = new Vector3().crossVectors(FOOTPRINT_NORMAL, FOOTPRINT_U).normalize();
function makeGeometry(apex: [number, number, number]) {
  const segments = 96;
  const ring = Array.from({ length: segments }, (_, index) => {
    const angle = index / segments * Math.PI * 2;
    return FOOTPRINT_CENTER.clone().multiplyScalar(Math.cos(FOOTPRINT_RADIUS))
      .addScaledVector(FOOTPRINT_U, Math.sin(FOOTPRINT_RADIUS) * Math.cos(angle))
      .addScaledVector(FOOTPRINT_V, Math.sin(FOOTPRINT_RADIUS) * Math.sin(angle)).toArray();
  });
  const beam: number[] = [];
  const beamUv: number[] = [];
  const disk: number[] = [];
  const diskUv: number[] = [];
  const sourceRing = Array.from({ length: segments }, (_, index) => {
    const angle = index / segments * Math.PI * 2;
    return [apex[0], apex[1] + ANTENNA_RADIUS * Math.cos(angle), apex[2] + ANTENNA_RADIUS * Math.sin(angle)];
  });
  for (let index = 0; index < segments; index++) {
    const next = (index + 1) % segments;
    const angle = index / segments * Math.PI * 2;
    const nextAngle = (index + 1) / segments * Math.PI * 2;
    // Frustum: el haz nace en todo el radio de la antena y se abre hasta la huella terrestre.
    const u0 = 0.5 + 0.5 * Math.cos(angle);
    const u1 = 0.5 + 0.5 * Math.cos(nextAngle);
    beam.push(...sourceRing[index], ...ring[index], ...ring[next], ...sourceRing[index], ...ring[next], ...sourceRing[next]);
    beamUv.push(u0, 0, u0, 1, u1, 1, u0, 0, u1, 1, u1, 0);
    disk.push(...FOOTPRINT_CENTER.toArray(), ...ring[index], ...ring[next]);
    const a = angle;
    const b = nextAngle;
    diskUv.push(0.5, 0.5, 0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a), 0.5 + 0.5 * Math.cos(b), 0.5 + 0.5 * Math.sin(b));
  }
  return { beam: new Float32Array(beam), beamUv: new Float32Array(beamUv),
    disk: new Float32Array(disk), diskUv: new Float32Array(diskUv) };
}

const vertex = `
  varying vec2 radarUv;
  void main() {
    radarUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export default function NisarRadar({ apex, playing, progress }: {
  apex: [number, number, number]; playing: boolean; progress: MotionValue<number>;
}) {
  const beam = useRef<ShaderMaterial>(null);
  const swath = useRef<ShaderMaterial>(null);
  const elapsed = useRef(0);
  const [ax, ay, az] = apex;
  const geometry = useMemo(() => makeGeometry([ax, ay, az]), [ax, ay, az]);
  const beamUniforms = useMemo(() => ({ time: { value: 0 }, visibility: { value: 0 } }), []);
  const swathUniforms = useMemo(() => ({ time: { value: 0 }, visibility: { value: 0 } }), []);

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
    if (swath.current) {
      swath.current.uniforms.time.value = elapsed.current;
      swath.current.uniforms.visibility.value = visibility;
    }
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
              float edge = smoothstep(0.74, 1.0, radarUv.y);
              float alpha = (0.085 + wave * 0.22 + edge * 0.04) * radarUv.y * visibility;
              gl_FragColor = vec4(0.38, 0.82, 0.86, alpha);
            }
          `} />
      </mesh>
      <mesh>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[geometry.disk, 3]} />
          <bufferAttribute attach="attributes-uv" args={[geometry.diskUv, 2]} />
        </bufferGeometry>
        <shaderMaterial ref={swath} uniforms={swathUniforms} transparent depthWrite={false}
          side={DoubleSide} blending={AdditiveBlending} vertexShader={vertex}
          fragmentShader={`
            varying vec2 radarUv;
            uniform float time;
            uniform float visibility;
            void main() {
              float radius = length((radarUv - 0.5) * 2.0);
              float fill = 1.0 - smoothstep(0.2, 1.0, radius);
              float wave = exp(-pow((radius - fract(time * 0.11)) * 18.0, 2.0));
              float alpha = (fill * 0.24 + wave * 0.025) * visibility;
              gl_FragColor = vec4(0.2, 0.48, 0.53, alpha);
            }
          `} />
      </mesh>
    </group>
  );
}
