"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, Vector3, type ShaderMaterial } from "three";
import type { MotionValue } from "framer-motion";
import { riskZones } from "@/lib/risk-zones";
import { FOOTPRINT_LOCAL, OVER_RELIEF, GLOBE_DETECT, GLOBE_RECON, emit, globeState, type DetectEvent, type ReconEvent } from "./globe-state";

const SCAN_DELAY = 3.6;      // esperar a que termine la entrada cinematográfica
const SCAN_INTERVAL = 30;   // segundos entre inicios de barridos
const SCAN_DURATION = 5.2;   // s que tarda el frente en cubrir el planeta
const PASS_DISTANCE = 0.35;  // distancia huella–zona para contar una pasada del haz
const PASS_COOLDOWN = 10;    // s mínimos entre dos detecciones de la misma zona

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const vertex = `
  varying vec3 vPos;
  varying vec3 vViewNormal;
  void main() {
    vPos = position;
    vViewNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragment = `
  uniform vec3 uOrigin;
  uniform float uAngle;
  uniform float uActive;
  uniform float uTrail;
  varying vec3 vPos;
  varying vec3 vViewNormal;
  void main() {
    vec3 n = normalize(vPos);
    float a = acos(clamp(dot(n, uOrigin), -1.0, 1.0));
    float d = a - uAngle;
    float front = exp(-pow(d / 0.035, 2.0)) * 0.7 + 0.22 * exp(-pow(d / 0.14, 2.0));
    float scanned = 1.0 - smoothstep(-0.02, 0.02, d);
    float latD = degrees(asin(clamp(n.y, -1.0, 1.0)));
    float lonD = degrees(atan(n.x, n.z));
    float gLat = abs(fract(latD / 5.0 + 0.5) - 0.5) * 5.0;
    float gLon = abs(fract(lonD / 5.0 + 0.5) - 0.5) * 5.0 * cos(radians(latD));
    float grid = max(1.0 - smoothstep(0.03, 0.11, gLat), 1.0 - smoothstep(0.03, 0.11, gLon));
    // la retícula solo se ve cerca del frente y se apaga detrás de él
    float near = exp(-pow(d / 0.5, 2.0));
    float rim = pow(1.0 - max(dot(vViewNormal, vec3(0.0, 0.0, 1.0)), 0.0), 2.0);
    float alpha = front * 0.55 * uActive + scanned * (grid * 0.16 * (0.35 + 0.65 * near) + rim * 0.08) * uTrail;
    gl_FragColor = vec4(mix(vec3(0.45, 0.86, 0.9), vec3(0.9, 1.0, 1.0), front * 0.5), alpha);
  }
`;

/** Barrido de reconocimiento inicial + detección de pasadas del haz + giro hacia una zona. */
export default function ReconScan({ ready, progress }: { ready: boolean; progress: MotionValue<number> }) {
  const material = useRef<ShaderMaterial>(null);
  const uniforms = useMemo(() => ({
    uOrigin: { value: new Vector3(0, 0, 1) },
    uAngle: { value: 0 },
    uActive: { value: 0 },
    uTrail: { value: 0 },
  }), []);
  const tmp = useMemo(() => ({ foot: new Vector3(), marker: new Vector3(), local: new Vector3() }), []);
  const lastEmit = useRef({ found: -1, at: 0, progress: 0 });
  const initialFocusDone = useRef(false);

  useFrame(({ clock }) => {
    const u = material.current?.uniforms;
    if (!u) return;
    const t = clock.elapsedTime;
    // El barrido usa el reloj real del navegador: si el lienzo se vuelve a montar no se repite
    const now = performance.now() / 1000;
    globeState.clock = t;
    const scan = globeState.scan;

    // 1. Inicio: el barrido parte del punto bajo el satélite
    if (ready && (scan.startedAt < 0 || now - scan.startedAt >= SCAN_INTERVAL)) {
      scan.startedAt = scan.startedAt < 0 ? now + SCAN_DELAY : now;
      lastEmit.current.progress = 0;
      if (globeState.orbit) {
        globeState.orbit.localToWorld(tmp.foot.copy(FOOTPRINT_LOCAL));
        scan.origin.copy(tmp.foot.normalize());
      }
      u.uOrigin.value.copy(scan.origin);
    }
    if (scan.startedAt < 0) return;

    scan.progress = Math.min(1, Math.max(0, (now - scan.startedAt) / SCAN_DURATION));
    const angle = scan.progress * Math.PI * 1.04;
    u.uAngle.value = angle;
    u.uActive.value = smooth(0, 0.04, scan.progress) * (1 - smooth(0.92, 1, scan.progress));
    u.uTrail.value = smooth(0, 0.1, scan.progress) * (1 - smooth(scan.startedAt + SCAN_DURATION + 0.2, scan.startedAt + SCAN_DURATION + 1.6, now));
    globeState.beam = smooth(scan.startedAt - 0.4, scan.startedAt + 0.5, now)
      * (1 - smooth(scan.startedAt + SCAN_DURATION, scan.startedAt + SCAN_DURATION + 1.6, now));

    // 2. El frente descubre las zonas que alcanza
    if (scan.progress > 0 && globeState.revealed.size < riskZones.length) {
      for (const [id, node] of globeState.markers) {
        if (globeState.revealed.has(id)) continue;
        node.getWorldPosition(tmp.marker);
        const a = Math.acos(Math.min(1, Math.max(-1, tmp.marker.clone().normalize().dot(scan.origin))));
        if (a <= angle) {
          globeState.revealed.add(id);
          emit<DetectEvent>(GLOBE_DETECT, { id, source: "scan", visible: tmp.marker.z > 0.1 });
        }
      }
    }
    const found = globeState.revealed.size;
    const finished = scan.progress >= 1 && lastEmit.current.progress < 1;
    // al terminar el barrido, el planeta gira hacia el último evento (Colombia) y lo destaca
    if (finished && !initialFocusDone.current && globeState.featured && globeState.zoom === 0 && !globeState.focus) {
      globeState.focus = globeState.featured;
    }
    if (finished) initialFocusDone.current = true;
    if (found !== lastEmit.current.found || finished || (scan.progress < 1 && t - lastEmit.current.at > 0.12)) {
      lastEmit.current = { found, at: t, progress: scan.progress };
      emit<ReconEvent>(GLOBE_RECON, { progress: scan.progress, found });
    }

    // 3. Huella del haz de NISAR: detecta zonas y modula la iluminación de los puntos
    if (globeState.orbit) {
      globeState.orbit.localToWorld(tmp.foot.copy(FOOTPRINT_LOCAL));
      for (const [id, node] of globeState.markers) {
        node.getWorldPosition(tmp.marker);
        const dist = tmp.marker.distanceTo(tmp.foot);
        // Cuando el satélite y su haz pasan cerca, la zona se ilumina suavemente
        const prox = Math.max(0, 1 - dist / 0.52);
        globeState.radarProximity.set(id, prox);

        if (dist > PASS_DISTANCE) continue;
        if (t - (globeState.flashes.get(id) ?? -99) < PASS_COOLDOWN) continue;
        globeState.flashes.set(id, t);
        emit<DetectEvent>(GLOBE_DETECT, { id, source: "pass", visible: tmp.marker.z > 0.15 });
      }
    }

    // 4. Llevar al frente la zona elegida por el usuario
    const focus = globeState.focus;
    const userGroup = globeState.userGroup;
    if (focus && userGroup) {
      globeState.focus = null;
      const node = globeState.markers.get(focus);
      if (node) {
        node.getWorldPosition(tmp.marker);
        // coordenadas antes de la rotación del usuario
        const q = userGroup.worldToLocal(tmp.local.copy(tmp.marker));
        const user = globeState.user;
        let yaw = -Math.atan2(q.x, q.z);
        yaw += Math.PI * 2 * Math.round((user.targetYaw - yaw) / (Math.PI * 2));
        user.targetYaw = yaw;
        // Al inicio la Tierra está baja (scroll del hero): la zona se deja inclinada hacia la parte visible
        // con la zona abierta (acercamiento) va centrada
        const lift = globeState.zoom > 0 ? 0 : 0.6 * (1 - Math.min(1, progress.get() / 0.8));
        user.targetPitch = Math.max(-1.2, Math.min(1.2, Math.atan2(q.y, Math.hypot(q.x, q.z)) - lift));
        user.velocity = 0;
      }
    }
  });

  return (
    <mesh renderOrder={2}>
      <sphereGeometry args={[OVER_RELIEF + 0.006, 96, 48]} />
      <shaderMaterial ref={material} uniforms={uniforms} vertexShader={vertex} fragmentShader={fragment}
        transparent depthWrite={false} blending={AdditiveBlending} />
    </mesh>
  );
}
