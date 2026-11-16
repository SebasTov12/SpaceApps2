"use client";

import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useCallback, useMemo, useRef, type RefObject } from "react";
import { useReducedMotion } from "framer-motion";
import { AdditiveBlending, Color, DoubleSide, Vector3, type Group, type MeshBasicMaterial, type ShaderMaterial } from "three";
import { globeState, SCAN_INTERVAL, SCAN_DURATION, SCAN_FADE } from "./globe-state";

const PASS_INTERVAL_MIN = 34;
const PASS_INTERVAL_VARIANCE = 8;
const PASS_DURATION = 5.6;
type DetectionSchedule = { activeUntil: number[]; nextAt: number[]; inView: boolean[] };

type Orbit = { radius: number; tilt: [number, number, number]; speed: number; phase: number; color: string; scale: number };

// Haces secundarios decorativos; solo NISAR activa el reconocimiento y los datos de zonas.
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
    </group>
  );
}

function Companion({ orbit, playing, reducedMotion, passDuration, index, schedule, onVisibilityChange }: {
  orbit: Orbit; playing: boolean; reducedMotion: boolean; passDuration: number; index: number; schedule: RefObject<DetectionSchedule>; onVisibilityChange: (index: number, visible: boolean) => void;
}) {
  const moving = useRef<Group>(null);
  const detector = useRef<Group>(null);
  const beam = useRef<MeshBasicMaterial>(null);
  const footprint = useRef<ShaderMaterial>(null);
  const footprintUniforms = useMemo(() => ({
    color: { value: new Color(orbit.color) },
    opacity: { value: 0 },
  }), [orbit.color]);
  const satellitePosition = useMemo(() => new Vector3(), []);
  const centerPosition = useMemo(() => new Vector3(), []);
  const viewDirection = useMemo(() => new Vector3(), []);
  // Mantener el extremo del haz por encima del relieve máximo evita que la Tierra lo oculte.
  const ground = 1.052;
  const beamLength = orbit.radius - ground;
  const path = useMemo(() => circle(orbit.radius), [orbit.radius]);
  const tail = useMemo(() => trail(orbit.radius, Math.sign(orbit.speed)), [orbit.radius, orbit.speed]);
  useFrame(({ camera }, delta) => {
    if (moving.current && playing) moving.current.rotation.z += Math.min(delta, 0.1) * orbit.speed * (reducedMotion ? 0.55 : 1);
    if (moving.current) {
      moving.current.updateWorldMatrix(true, false);
      moving.current.getWorldPosition(centerPosition);
      moving.current.localToWorld(satellitePosition.set(orbit.radius, 0, 0));
      camera.getWorldPosition(viewDirection).sub(centerPosition);
      onVisibilityChange(index, satellitePosition.sub(centerPosition).dot(viewDirection) > 0.25);
    }
    const now = performance.now() / 1000;
    const active = playing && now < (schedule.current.activeUntil[index] ?? 0);
    if (detector.current) detector.current.visible = active;
    if (!active) return;
    const startedAt = (schedule.current.activeUntil[index] ?? now) - passDuration;
    const progress = Math.min(1, Math.max(0, (now - startedAt) / passDuration));
    const glow = Math.sin(progress * Math.PI) ** 2;
    if (beam.current) beam.current.opacity = glow * 0.34;
    if (footprint.current) footprint.current.uniforms.opacity.value = glow * 0.42;
  });
  return (
    <group rotation={orbit.tilt}>
      <Line points={path} color={orbit.color} lineWidth={0.6} transparent opacity={0.12} depthWrite={false} />
      <group ref={moving} rotation={[0, 0, orbit.phase]}>
        <group ref={detector} visible={false}>
          <mesh position={[(orbit.radius + ground) / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <cylinderGeometry args={[0.012, 0.13, beamLength, 32, 1, true]} />
            <meshBasicMaterial ref={beam} color={orbit.color} transparent opacity={0} side={DoubleSide} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
          </mesh>
          <mesh position={[ground, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <circleGeometry args={[0.095, 64]} />
            <shaderMaterial ref={footprint} uniforms={footprintUniforms} transparent depthWrite={false} side={DoubleSide} blending={AdditiveBlending} toneMapped={false}
              vertexShader={`varying vec2 footprintUv; void main(){footprintUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`}
              fragmentShader={`uniform vec3 color;uniform float opacity;varying vec2 footprintUv;void main(){float r=length((footprintUv-0.5)*2.0);float softness=1.0-smoothstep(0.12,1.0,r);float clouding=0.92+0.08*sin(footprintUv.x*19.0+footprintUv.y*13.0);float alpha=softness*clouding*opacity;gl_FragColor=vec4(color,alpha);}`} />
          </mesh>
        </group>
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
  const reducedMotion = useReducedMotion();
  const passDuration = reducedMotion ? PASS_DURATION * 1.4 : PASS_DURATION;
  const schedule = useRef<DetectionSchedule>({ activeUntil: [0, 0], nextAt: [], inView: [false, false] });
  const onVisibilityChange = useCallback((index: number, visible: boolean) => { schedule.current.inView[index] = visible; }, []);
  // Cada satélite tiene su propio intervalo; los desfases evitan pulsos sincronizados frecuentes,
  // pero la variación permite coincidencias ocasionales y naturales.
  useFrame(() => {
    const state = schedule.current;
    const now = performance.now() / 1000;
    const scanAt = globeState.scan.startedAt;
    const elapsed = now - scanAt;
    const clear = scanAt >= 0 && elapsed > SCAN_DURATION + SCAN_FADE + 0.4
      && elapsed < SCAN_INTERVAL - 0.5 && globeState.beam < 0.001;
    if (!playing || globeState.zoom > 0.05 || !clear) {
      state.activeUntil = [0, 0];
      return;
    }
    if (!state.nextAt.length) state.nextAt = [now + 1, now + 18.5];
    if (elapsed + passDuration >= SCAN_INTERVAL - 0.5) return;
    for (const i of [0, 1]) {
      if (now < state.nextAt[i] || !state.inView[i] || now < state.activeUntil[i]) continue;
      state.activeUntil[i] = now + passDuration;
      state.nextAt[i] = now + PASS_INTERVAL_MIN + Math.random() * PASS_INTERVAL_VARIANCE;
    }
  }, -1);
  return (
    <group>
      {ORBITS.map((orbit, i) => <Companion key={i} orbit={orbit} index={i} schedule={schedule} onVisibilityChange={onVisibilityChange} playing={playing} reducedMotion={Boolean(reducedMotion)} passDuration={passDuration} />)}
    </group>
  );
}
