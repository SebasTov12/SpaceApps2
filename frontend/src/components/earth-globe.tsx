"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useProgress, useTexture } from "@react-three/drei";
import { type MotionValue } from "framer-motion";
import { Component, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import NisarOrbit from "@/components/nisar-orbit";
import RiskMarkers from "@/components/globe/risk-markers";
import ReconScan from "@/components/globe/recon-scan";
import CompanionSats from "@/components/globe/companion-sats";
import { globeState } from "@/components/globe/globe-state";
import { AdditiveBlending, BackSide, SRGBColorSpace, Vector2, type AmbientLight, type DirectionalLight, type Group } from "three";

type SceneQuality = "compact" | "full";

function Planet({ onReady, playing, quality }: { onReady: () => void; playing: boolean; quality: SceneQuality }) {
  const surface = useRef<Group>(null);
  const clouds = useRef<Group>(null);
  const [day, cloud, normal, specular] = useTexture([
    "/earth-blue-marble.jpg", "/earth-clouds.png",
    "/earth-normal.jpg", "/earth-specular.jpg",
  ], (textures) => {
    textures[0].colorSpace = SRGBColorSpace;
    for (const texture of textures) texture.anisotropy = 8;
  });
  useEffect(onReady, [onReady]);

  const userGroup = useRef<Group>(null);
  useEffect(() => {
    globeState.userGroup = userGroup.current;
    return () => {
      globeState.userGroup = null;
    };
  }, []);

  useFrame((_, delta) => {
    // Rotación del usuario (arrastre, inercia y giro hacia una zona), suavizada
    const user = globeState.user;
    if (!user.dragging && Math.abs(user.velocity) > 1e-5) {
      user.targetYaw += user.velocity;
      user.velocity *= 0.93;
    }
    user.yaw += (user.targetYaw - user.yaw) * 0.075;
    user.pitch += (user.targetPitch - user.pitch) * 0.075;
    userGroup.current?.rotation.set(user.pitch, user.yaw, 0);

    if (!playing) return;
    const step = Math.min(delta, 0.1);
    if (surface.current) surface.current.rotation.y += step * 0.04;
    if (clouds.current) clouds.current.rotation.y += step * 0.006;
  });
  const earthSegments: [number, number] = quality === "compact" ? [72, 36] : [128, 64];
  const shellSegments: [number, number] = quality === "compact" ? [56, 28] : [96, 48];
  return (
    <group ref={userGroup}>
    <group rotation={[-0.25, 0, -0.08]}>
      <group ref={surface} rotation={[0, -Math.PI / 2 + 65 * Math.PI / 180, 0]}>
        <mesh>
          <sphereGeometry args={[1, ...earthSegments]} />
          <meshPhongMaterial map={day} normalMap={normal} normalScale={new Vector2(0.17, 0.17)}
            specularMap={specular} specular="#263b4e" shininess={55}
            emissive="#142f52" emissiveIntensity={0.32} />
        </mesh>
        {/* Zonas de riesgo; giran con la superficie */}
        <RiskMarkers />
        <group ref={clouds}>
        {/* A faint offset veil gives cloud systems depth without heavy shadow maps. */}
        <mesh scale={1.0015} rotation={[0, 0.006, 0.003]}>
          <sphereGeometry args={[1, ...shellSegments]} />
          <meshBasicMaterial alphaMap={cloud} color="#05101c" transparent opacity={0.18} depthWrite={false}
            onBeforeCompile={(shader) => {
              shader.fragmentShader = shader.fragmentShader.replace(
                "#include <alphamap_fragment>",
                "diffuseColor.a *= texture2D(alphaMap, vAlphaMapUv).a;"
              );
            }} />
        </mesh>
        <mesh scale={1.008}>
          <sphereGeometry args={[1, ...shellSegments]} />
          <meshPhongMaterial alphaMap={cloud} color="#f5f9ff" transparent opacity={0.9} depthWrite={false} shininess={3}
            onBeforeCompile={(shader) => {
              // This cloud asset stores soft coverage in alpha, not in its binary RGB channels.
              shader.fragmentShader = shader.fragmentShader.replace(
                "#include <alphamap_fragment>",
                "diffuseColor.a *= texture2D(alphaMap, vAlphaMapUv).a;"
              );
            }} />
        </mesh>
        </group>
      </group>
      <mesh scale={1.002}>
        <sphereGeometry args={[1, ...shellSegments]} />
        <shaderMaterial transparent depthWrite={false} blending={AdditiveBlending}
          vertexShader={`
            varying vec3 viewNormal;
            varying vec3 viewDirection;
            void main() {
              vec4 p = modelViewMatrix * vec4(position, 1.0);
              viewNormal = normalize(normalMatrix * normal);
              viewDirection = -p.xyz;
              gl_Position = projectionMatrix * p;
            }
          `}
          fragmentShader={`
            varying vec3 viewNormal;
            varying vec3 viewDirection;
            void main() {
              float edge = pow(1.0 - max(dot(normalize(viewNormal), normalize(viewDirection)), 0.0), 3.5);
              gl_FragColor = vec4(0.28, 0.55, 0.85, edge * 0.19);
            }
          `}
        />
      </mesh>
      <mesh scale={1.012}>
        <sphereGeometry args={[1, ...shellSegments]} />
        <shaderMaterial transparent depthWrite={false} side={BackSide} blending={AdditiveBlending}
          vertexShader={`
            varying vec3 vNormal;
            varying vec3 vView;
            void main() {
              vec4 p = modelViewMatrix * vec4(position, 1.0);
              vNormal = normalize(normalMatrix * normal);
              vView = -p.xyz;
              gl_Position = projectionMatrix * p;
            }
          `}
          fragmentShader={`
            varying vec3 vNormal;
            varying vec3 vView;
            void main() {
              float rim = pow(clamp(1.0 + dot(normalize(vNormal), normalize(vView)), 0.0, 1.0), 5.0);
              float sun = smoothstep(-0.5, 0.7, dot(normalize(vNormal), normalize(vec3(-0.6, 0.8, 1.0))));
              gl_FragColor = vec4(0.32, 0.58, 0.85, rim * (0.04 + sun * 0.22));
            }
          `}
        />
      </mesh>
    </group>
    </group>
  );
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? (
      <div className="earth-static scene-fallback" role="status">
        <span>Vista 3D no disponible</span>
        <small>Mostrando una representación estática de la Tierra.</small>
      </div>
    ) : this.props.children;
  }
}

function SceneLoading({ ready }: { ready: boolean }) {
  const { active, progress } = useProgress();
  const visible = !ready || active;
  const value = Math.max(8, Math.round(progress));
  return (
    <div className={`scene-loading ${visible ? "is-visible" : ""}`} role="status" aria-live="polite" aria-hidden={!visible}>
      <span className="scene-loading-ring" aria-hidden="true" />
      <span>Cargando Tierra 3D</span>
      <small>{value}%</small>
    </div>
  );
}

function Sunlight({ progress }: { progress: MotionValue<number> }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => progress.on("change", () => invalidate()), [progress, invalidate]);
  const ambient = useRef<AmbientLight>(null);
  const sun = useRef<DirectionalLight>(null);
  useFrame(() => {
    const reveal = Math.min(1, Math.max(0, progress.get()));
    if (ambient.current) ambient.current.intensity = 0.5 + reveal * 0.5;
    if (sun.current) {
      sun.current.position.set(-3 + reveal * 1.4, 4 - reveal * 1.5, 3 + reveal * 3.5);
      sun.current.intensity = 2.25 - reveal * 0.2;
    }
  });
  return (
    <>
      <ambientLight ref={ambient} intensity={0.45} />
      <directionalLight ref={sun} position={[-3, 4, 3]} intensity={2.1} color="#fff5e8" />
      <directionalLight position={[3, -2, -4]} intensity={0.3} color="#7197bd" />
    </>
  );
}

export default function EarthGlobe({ progress, playing }: { progress: MotionValue<number>; playing: boolean }) {
  const [ready, setReady] = useState(false);
  const [quality] = useState<SceneQuality>(() => {
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    return window.matchMedia("(max-width: 760px)").matches || memory <= 4 ? "compact" : "full";
  });
  const showScene = useCallback(() => setReady(true), []);

  // Girar el planeta arrastrando. Se escucha en window para no robar los clics de R3F.
  const startDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const user = globeState.user;
    let lastX = event.clientX;
    let lastY = event.clientY;
    user.dragging = true;
    user.moved = 0;
    user.velocity = 0;
    const move = (e: PointerEvent) => {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      user.moved += Math.abs(dx) + Math.abs(dy);
      user.targetYaw += dx * 0.006;
      user.targetPitch = Math.max(-1.2, Math.min(1.2, user.targetPitch + dy * 0.004));
      user.velocity = dx * 0.003;
    };
    const end = () => {
      user.dragging = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }, []);
  return (
    <div className="earth-render is-draggable" onPointerDown={startDrag} role="group" aria-label="Globo interactivo: arrastra para girar la Tierra; NISAR orbita y su radar ilustrativo detecta zonas de riesgo. La lista de zonas está en el panel de reconocimiento.">
      <SceneBoundary>
        {!ready && <div className="earth-static" />}
        <SceneLoading ready={ready} />
        <Canvas style={{ position: "absolute", inset: "-35%", width: "170%", height: "170%" }}
          camera={{ position: [0, 0, 3.5], fov: 58 }} dpr={quality === "compact" ? [1, 1.2] : [1, 1.6]}
          frameloop={playing ? "always" : "demand"}
          resize={{ offsetSize: true }}
          gl={{ antialias: quality === "full", alpha: true, powerPreference: "high-performance" }}>
          <Sunlight progress={progress} />
          <Suspense fallback={null}>
            <Planet onReady={showScene} playing={playing} quality={quality} />
            <NisarOrbit playing={playing} progress={progress} />
            <ReconScan ready={ready} progress={progress} />
            <CompanionSats playing={playing} />
          </Suspense>
        </Canvas>
      </SceneBoundary>
    </div>
  );
}
