"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { AdditiveBlending, Color, DoubleSide, type Group, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial, type ShaderMaterial } from "three";
import { riskKinds, riskZones, type RiskZone } from "@/lib/risk-zones";
import { GLOBE_SELECT, RELIEF, focusZone, globeState } from "./globe-state";

/** Posición en la esfera de three.js (SphereGeometry con textura equirectangular). */
export function spherePosition(lat: number, lon: number, radius: number): [number, number, number] {
  const phi = ((lon + 180) / 360) * Math.PI * 2;
  const theta = ((90 - lat) / 180) * Math.PI;
  return [-Math.cos(phi) * Math.sin(theta) * radius, Math.cos(theta) * radius, Math.sin(phi) * Math.sin(theta) * radius];
}

const easeOutBack = (t: number) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

// Columna de luz: degradado luminoso que asciende desde la superficie
const pillarVertex = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const pillarFragment = `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float core = pow(1.0 - abs(vUv.x - 0.5) * 2.0, 1.4);
    float glow = (0.35 + 0.65 * (1.0 - vUv.y)) * core;
    gl_FragColor = vec4(uColor, glow * uOpacity);
  }
`;

/** Altura del terreno (0–1) en cada zona, leída del mismo mapa que desplaza la superficie. */
function useTerrainHeights() {
  const [heights, setHeights] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    const image = new window.Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.drawImage(image, 0, 0);
      const { width, height } = canvas;
      const result = new Map<string, number>();
      for (const zone of riskZones) {
        const cx = Math.round(((zone.lon + 180) / 360) * width);
        const cy = Math.round(((90 - zone.lat) / 180) * height);
        const data = context.getImageData(Math.max(0, cx - 3), Math.max(0, cy - 3), 7, 7).data;
        let max = 0;
        for (let i = 0; i < data.length; i += 4) max = Math.max(max, data[i]);
        result.set(zone.id, max / 255);
      }
      setHeights(result);
    };
    image.src = "/earth-height.png";
  }, []);
  return heights;
}

function Marker({ zone, selected, index, terrain }: { zone: RiskZone; selected: boolean; index: number; terrain: number }) {
  const group = useRef<Group>(null);
  const body = useRef<Group>(null);
  const pillar = useRef<Group>(null);
  const pillarMaterial = useRef<ShaderMaterial>(null);
  const ringGroup = useRef<Group>(null);
  const orbMaterial = useRef<MeshStandardMaterial>(null);
  const ringMaterial = useRef<MeshStandardMaterial>(null);
  const haloMesh = useRef<Mesh>(null);
  const pulse = useRef<Mesh>(null);
  const burst = useRef<Mesh>(null);
  const base = useRef<Mesh>(null);
  const revealAt = useRef<number | null>(null);
  const pointerDownPos = useRef<{ x: number; y: number; time: number } | null>(null);
  const [hover, setHover] = useState(false);

  const color = riskKinds[zone.kind].color;
  const position = useMemo(() => spherePosition(zone.lat, zone.lon, 1.002 + RELIEF * terrain), [zone.lat, zone.lon, terrain]);
  
  // Baliza 3D elevada: esfera y anillo orbital suspendidos sobre el terreno
  const size = zone.siteId ? 0.0135 : 0.0105;
  const stemHeight = zone.siteId ? 0.056 : 0.044;
  const uniforms = useMemo(() => ({ uColor: { value: new Color(color) }, uOpacity: { value: 0.6 } }), [color]);

  useEffect(() => {
    const node = group.current;
    if (!node) return;
    node.lookAt(position[0] * 2, position[1] * 2, position[2] * 2); // +Z perpendicular hacia afuera de la Tierra
    globeState.markers.set(zone.id, node);
    return () => {
      globeState.markers.delete(zone.id);
    };
  }, [position, zone.id]);

  useFrame(({ clock }, delta) => {
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
    const featured = globeState.featured === zone.id;
    const emphasis = (hover ? 1.35 : 1) * (selected || featured ? 1.25 : 1);

    // 1. Detección en tiempo real por el satélite NISAR (proximidad y pasada directa)
    const prox = globeState.radarProximity.get(zone.id) ?? 0;
    const flashAt = globeState.flashes.get(zone.id) ?? -99;
    const f = (t - flashAt) / 2.2;
    const flashing = f >= 0 && f < 1;
    const flashBoost = flashing ? Math.sin(f * Math.PI) * 2.2 : 0;
    const detectorGlow = prox * 1.35 + flashBoost;

    // Escala general y pulso
    node.scale.setScalar(Math.max(0.001, easeOutBack(appear)) * emphasis * (1 + detectorGlow * 0.12));

    // Iluminación reactiva del orbe 3D y su anillo holográfico
    const baseEmissive = selected ? 1.8 : hover ? 1.4 : 0.65;
    const emissiveIntensity = baseEmissive + detectorGlow * 1.4;
    if (orbMaterial.current) orbMaterial.current.emissiveIntensity = emissiveIntensity;
    if (ringMaterial.current) ringMaterial.current.emissiveIntensity = emissiveIntensity * 0.95;

    // Halo atmosférico alrededor de la esfera
    if (haloMesh.current) {
      (haloMesh.current.material as MeshBasicMaterial).opacity = 0.2 + detectorGlow * 0.35 + (hover || selected ? 0.3 : 0);
    }

    // Rotación orbital del anillo holográfico alrededor de la esfera (más viva al ser detectado)
    if (ringGroup.current) {
      ringGroup.current.rotation.z += delta * (0.85 + detectorGlow * 1.8);
      ringGroup.current.rotation.x = 0.42 + Math.sin(t * 1.8 + index) * 0.12;
    }

    // Columna de luz: se estira y resplandece al recibir el detector del satélite
    if (pillar.current) {
      pillar.current.scale.set(1, 1, Math.max(0.001, appear * (1 + flashBoost * 0.8 + prox * 0.35 + (selected ? 0.25 : 0))));
    }
    if (pillarMaterial.current) {
      pillarMaterial.current.uniforms.uOpacity.value = 0.52 + flashBoost * 0.5 + prox * 0.4 + (selected ? 0.25 : 0);
    }

    // Pulso constante en la superficie
    if (pulse.current) {
      const p = (t * (0.45 + detectorGlow * 0.4) + index * 0.137) % 1;
      pulse.current.scale.setScalar(1 + p * 2.8);
      (pulse.current.material as MeshBasicMaterial).opacity = (0.35 + detectorGlow * 0.45) * (1 - p) * appear;
    }

    // Onda de choque expansiva cuando el satélite detecta directamente el punto
    if (burst.current) {
      burst.current.visible = flashing;
      if (flashing) {
        burst.current.scale.setScalar(1 + f * 5.2);
        (burst.current.material as MeshBasicMaterial).opacity = 0.68 * (1 - f) ** 2;
      }
    }
    if (base.current) (base.current.material as MeshBasicMaterial).opacity = selected || hover ? 0.95 : 0.65;
  });

  // Selección sin fricción: tolera microdesplazamientos de arrastre y clics rápidos
  const triggerSelect = () => {
    focusZone(zone.id);
  };

  const handlePointerDown = (event: any) => {
    event.stopPropagation();
    pointerDownPos.current = { x: event.clientX, y: event.clientY, time: performance.now() };
  };

  const handleClick = (event: any) => {
    event.stopPropagation();
    if (!pointerDownPos.current) {
      triggerSelect();
      return;
    }
    const dx = event.clientX - pointerDownPos.current.x;
    const dy = event.clientY - pointerDownPos.current.y;
    const dist = Math.hypot(dx, dy);
    const dt = performance.now() - pointerDownPos.current.time;
    // Si el arrastre fue menor a 18px o el toque fue rápido, es un clic claro en la baliza
    if (dist < 18 || globeState.user.moved < 18 || dt < 320) {
      triggerSelect();
    }
  };

  return (
    <group ref={group} position={position}>
      <group ref={body} visible={false}>
        {/* 1. Base en la superficie del terreno */}
        <mesh ref={base} position={[0, 0, 0.002]}>
          <ringGeometry args={[size * 1.15, size * 1.5, 36]} />
          <meshBasicMaterial color={selected ? "#ffffff" : color} transparent opacity={0.65} side={DoubleSide} depthWrite={false} toneMapped={false} />
        </mesh>

        {/* 2. Pulso de sonar/radar sobre el terreno */}
        <mesh ref={pulse} position={[0, 0, 0.0024]}>
          <ringGeometry args={[size * 1.25, size * 1.55, 36]} />
          <meshBasicMaterial color={color} transparent opacity={0} side={DoubleSide} depthWrite={false} toneMapped={false} />
        </mesh>

        {/* 3. Onda expansiva al ser detectado por el satélite */}
        <mesh ref={burst} position={[0, 0, 0.0028]} visible={false}>
          <ringGeometry args={[size * 1.4, size * 1.9, 48]} />
          <meshBasicMaterial color="#e6fbff" transparent opacity={0} side={DoubleSide} depthWrite={false} toneMapped={false} />
        </mesh>

        {/* 4. Columna/haz de luz que conecta el suelo con la baliza flotante */}
        <group ref={pillar}>
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, stemHeight / 2]}>
            <cylinderGeometry args={[size * 0.22, size * 0.42, stemHeight, 16, 1, true]} />
            <shaderMaterial ref={pillarMaterial} uniforms={uniforms} vertexShader={pillarVertex} fragmentShader={pillarFragment}
              transparent depthWrite={false} blending={AdditiveBlending} side={DoubleSide} />
          </mesh>
        </group>

        {/* 5. Baliza 3D flotante: Esfera suspendida con núcleo brillante */}
        <mesh position={[0, 0, stemHeight]}>
          <sphereGeometry args={[size * 1.05, 24, 20]} />
          <meshStandardMaterial ref={orbMaterial} color={color} emissive={color} emissiveIntensity={0.75} roughness={0.25} metalness={0.4} toneMapped={false} />
        </mesh>

        {/* Brillo interior del orbe */}
        <mesh position={[0, 0, stemHeight]} scale={0.52}>
          <sphereGeometry args={[size * 1.05, 16, 12]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.7} toneMapped={false} />
        </mesh>

        {/* Halo atmosférico luminoso alrededor de la esfera */}
        <mesh ref={haloMesh} position={[0, 0, stemHeight]} scale={1.45}>
          <sphereGeometry args={[size * 1.05, 18, 14]} />
          <meshBasicMaterial color={color} transparent opacity={0.25} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
        </mesh>

        {/* 6. Anillo orbital holográfico alrededor de la esfera (diseño 3D táctico) */}
        <group ref={ringGroup} position={[0, 0, stemHeight]} rotation={[0.42, 0.22, 0]}>
          <mesh>
            <torusGeometry args={[size * 1.75, size * 0.12, 12, 36]} />
            <meshStandardMaterial ref={ringMaterial} color={selected ? "#ffffff" : color} emissive={color} emissiveIntensity={0.85} roughness={0.3} toneMapped={false} />
          </mesh>
        </group>

        {/* 7. Volumen de interacción amplio: abarca toda la baliza en 3D para una pulsación cómoda e inmediata */}
        <mesh
          position={[0, 0, stemHeight * 0.55]}
          rotation={[Math.PI / 2, 0, 0]}
          onPointerDown={handlePointerDown}
          onClick={handleClick}
          onPointerOver={(event) => { event.stopPropagation(); setHover(true); document.body.style.cursor = "pointer"; }}
          onPointerOut={() => { setHover(false); document.body.style.cursor = ""; }}
        >
          <cylinderGeometry args={[size * 5.2, size * 5.2, stemHeight * 1.8, 16]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

/** Zonas de riesgo sobre la superficie: giran con la Tierra. */
export default function RiskMarkers() {
  const [selected, setSelected] = useState<string | null>(null);
  const heights = useTerrainHeights();
  useEffect(() => {
    const onSelect = (event: Event) => setSelected((event as CustomEvent<string | null>).detail);
    window.addEventListener(GLOBE_SELECT, onSelect);
    return () => window.removeEventListener(GLOBE_SELECT, onSelect);
  }, []);
  return (
    <group>
      {riskZones.map((zone, index) => <Marker key={zone.id} zone={zone} index={index} selected={selected === zone.id} terrain={heights.get(zone.id) ?? 0} />)}
    </group>
  );
}
