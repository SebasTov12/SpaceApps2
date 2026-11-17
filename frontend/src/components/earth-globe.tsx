"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { type MotionValue } from "framer-motion";
import { Component, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import NisarOrbit from "@/components/nisar-orbit";
import RiskMarkers from "@/components/globe/risk-markers";
import HazardPoints from "@/components/globe/hazard-points";
import CountryLayer from "@/components/globe/country-layer";
import NisarFrames from "@/components/globe/nisar-frames";
import ReconScan from "@/components/globe/recon-scan";
import CompanionSats from "@/components/globe/companion-sats";
import { RELIEF, closeCountry, globeState } from "@/components/globe/globe-state";
import CameraRig from "@/components/globe/camera-rig";
import { useI18n } from "@/lib/i18n";
import { AdditiveBlending, BackSide, SRGBColorSpace, Vector2, type AmbientLight, type DirectionalLight, type Group } from "three";

type SceneQuality = "compact" | "mobile" | "full";

function Planet({ playing, quality, children }: { playing: boolean; quality: SceneQuality; children?: ReactNode }) {
  const surface = useRef<Group>(null);
  const clouds = useRef<Group>(null);
  const [day, cloud, normal, specular, height] = useTexture([
    "/earth-blue-marble.jpg", "/earth-clouds.png",
    "/earth-normal.jpg", "/earth-specular.jpg",
    // alturas reconstruidas desde el mapa de normales (montañas, mesetas y casquetes de hielo)
    "/earth-height.png",
  ], (textures) => {
    textures[0].colorSpace = SRGBColorSpace;
    const anisotropy = quality === "compact" ? 4 : quality === "mobile" ? 8 : 12;
    for (const texture of textures) texture.anisotropy = anisotropy;
  });

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
    // con una zona abierta la Tierra deja de girar: la zona se queda en el centro durante la zambullida
    if (surface.current) surface.current.rotation.y += step * 0.04 * (1 - Math.max(globeState.zoom, globeState.countryZoom));
    if (clouds.current) clouds.current.rotation.y += step * 0.006;
  });
  // más subdivisiones para que el relieve desplazado se vea sobresalir
  const earthSegments: [number, number] = quality === "compact" ? [320, 160] : quality === "mobile" ? [384, 192] : [512, 256];
  const shellSegments: [number, number] = quality === "compact" ? [64, 32] : quality === "mobile" ? [80, 40] : [112, 56];
  const normalStrength = quality === "compact" ? 0.58 : quality === "mobile" ? 0.68 : 0.76;
  return (
    <group ref={userGroup}>
    <group rotation={[-0.25, 0, -0.08]}>
      {/* Vista inicial neutral sobre África y el Atlántico; no centra Latinoamérica al cargar. */}
      <group ref={surface} rotation={[0, -Math.PI / 2, 0]}>
        <mesh>
          <sphereGeometry args={[1, ...earthSegments]} />
          <meshPhongMaterial map={day} normalMap={normal} normalScale={new Vector2(normalStrength, normalStrength)}
            displacementMap={height} displacementScale={RELIEF}
            specularMap={specular} specular="#263b4e" shininess={55}
            emissive="#10243b" emissiveIntensity={0.08} />
        </mesh>
        {/* Zonas de riesgo; giran con la superficie */}
        <RiskMarkers />
        {/* Registros reales de amenazas de la base de datos */}
        <HazardPoints />
        {/* Un punto por país; al abrir uno, su croquis y todos sus puntos */}
        <CountryLayer />
        {/* Huellas reales de las escenas NISAR guardadas en la base */}
        <NisarFrames />
        <group ref={clouds}>
        {/* A faint offset veil gives cloud systems depth without heavy shadow maps. */}
        <mesh scale={1 + RELIEF + 0.004} rotation={[0, 0.006, 0.003]}>
          <sphereGeometry args={[1, ...shellSegments]} />
          <meshBasicMaterial alphaMap={cloud} color="#05101c" transparent opacity={0.18} depthWrite={false}
            onBeforeCompile={(shader) => {
              shader.fragmentShader = shader.fragmentShader.replace(
                "#include <alphamap_fragment>",
                "diffuseColor.a *= texture2D(alphaMap, vAlphaMapUv).a;"
              );
            }} />
        </mesh>
        <mesh scale={1 + RELIEF + 0.009}>
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
      <mesh scale={1 + RELIEF + 0.002}>
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
      <mesh scale={1 + RELIEF + 0.012}>
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
    {children}
    </group>
  );
}

class SceneBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() {
    return this.state.failed ? (
      <div className="earth-static scene-fallback" role="status">
        <span>Vista 3D no disponible</span>
        <small>Mostrando una representación estática de la Tierra.</small>
      </div>
    ) : this.props.children;
  }
}

function Sunlight({ progress }: { progress: MotionValue<number> }) {
  const invalidate = useThree((state) => state.invalidate);
  const ambient = useRef<AmbientLight>(null);
  const sun = useRef<DirectionalLight>(null);
  useEffect(() => {
    const update = (value = progress.get()) => {
      const reveal = Math.min(1, Math.max(0, value));
      if (ambient.current) ambient.current.intensity = 1.02 + reveal * 0.25;
      if (sun.current) {
        sun.current.position.set(-3 + reveal * 1.4, 4 - reveal * 1.5, 3 + reveal * 3.5);
        sun.current.intensity = 2.25 - reveal * 0.2;
      }
    };
    update();
    return progress.on("change", (value) => { update(value); invalidate(); });
  }, [progress, invalidate]);
  return (
    <>
      <ambientLight ref={ambient} intensity={1.02} />
      <hemisphereLight args={["#bfe6ff", "#2a1a55", 0.55]} />
      <directionalLight ref={sun} position={[-3, 4, 3]} intensity={2.1} color="#fff5e8" />
      <directionalLight position={[3, -2, -4]} intensity={0.3} color="#7197bd" />
    </>
  );
}

function SceneReady({ onReady }: { onReady: () => void }) {
  const frames = useRef(0);
  useFrame(({ invalidate }) => {
    frames.current += 1;
    if (frames.current === 2) onReady();
    if (frames.current < 2) invalidate();
  });
  return null;
}

function NoWebGL({ onReady }: { onReady: () => void }) {
  useEffect(onReady, [onReady]);
  return <div className="earth-static scene-fallback" role="status"><span>Vista 3D no disponible</span></div>;
}

export default function EarthGlobe({ progress, playing, onReady }: { progress: MotionValue<number>; playing: boolean; onReady: () => void }) {
  const { lang } = useI18n();
  const [ready, setReady] = useState(false);
  const [quality] = useState<SceneQuality>(() => {
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    const cores = navigator.hardwareConcurrency || 4;
    const saveData = Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);
    const lowResources = memory <= 4 || cores <= 4 || saveData;
    if (lowResources) return "compact";
    return window.matchMedia("(max-width: 760px)").matches ? "mobile" : "full";
  });
  const compact = quality === "compact";
  const renderRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const render = renderRef.current;
    if (!render) return;
    const changeCountryZoom = (factor: number) => {
      if (!globeState.country || globeState.zoom > 0 || !globeState.uiRevealed) return false;
      const next = globeState.countryMagnification * factor;
      const minimum = Math.max(0.18, (globeState.countryDistance - 1) / 2.5);
      if (next <= minimum) closeCountry();
      else globeState.countryMagnification = Math.min(3.2, next);
      return true;
    };
    const zoomCountry = (event: WheelEvent) => {
      if (!globeState.country || globeState.zoom > 0 || !globeState.uiRevealed) return;
      // La rueda sobre el globo modifica la cámara 3D; no desplaza el documento.
      event.preventDefault();
      const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1);
      changeCountryZoom(Math.exp(-pixels * 0.001));
    };
    let previousPinch = 0;
    const separation = (event: TouchEvent) => Math.hypot(event.touches[0].clientX - event.touches[1].clientX, event.touches[0].clientY - event.touches[1].clientY);
    const startPinch = (event: TouchEvent) => {
      if (event.touches.length !== 2 || globeState.zoom > 0) return;
      previousPinch = separation(event);
      render.dataset.pinching = "true";
    };
    const movePinch = (event: TouchEvent) => {
      if (event.touches.length !== 2 || previousPinch <= 0 || globeState.zoom > 0) return;
      event.preventDefault();
      const current = separation(event);
      if (globeState.country) {
        changeCountryZoom(current / previousPinch);
      } else {
        // El pellizco recorre gradualmente el mismo rango de cámara que el enfoque de un país.
        globeState.planetZoom = Math.max(0, Math.min(1, globeState.planetZoom + Math.log(current / previousPinch) * 0.62));
      }
      previousPinch = current;
    };
    const endPinch = (event: TouchEvent) => {
      if (event.touches.length >= 2) return;
      previousPinch = 0;
      delete render.dataset.pinching;
    };
    render.addEventListener("wheel", zoomCountry, { passive: false });
    render.addEventListener("touchstart", startPinch, { passive: true });
    render.addEventListener("touchmove", movePinch, { passive: false });
    render.addEventListener("touchend", endPinch);
    render.addEventListener("touchcancel", endPinch);
    return () => {
      render.removeEventListener("wheel", zoomCountry);
      render.removeEventListener("touchstart", startPinch);
      render.removeEventListener("touchmove", movePinch);
      render.removeEventListener("touchend", endPinch);
      render.removeEventListener("touchcancel", endPinch);
    };
  }, []);
  const showScene = useCallback(() => { setReady(true); onReady(); }, [onReady]);
  // con el mapa de una zona a pantalla completa el planeta queda oculto: no se dibuja (ahorra GPU y batería)
  const [hidden, setHidden] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  useEffect(() => {
    const onView = (event: Event) => setHidden(Boolean((event as CustomEvent<boolean>).detail));
    const onVisibility = () => setPageVisible(document.visibilityState === "visible");
    window.addEventListener("saros:mapview", onView);
    document.addEventListener("visibilitychange", onVisibility);
    onVisibility();
    return () => {
      window.removeEventListener("saros:mapview", onView);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  // Girar el planeta arrastrando. Se escucha en window para no robar los clics de R3F.
  const startDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (!event.isPrimary || globeState.user.dragging) return;
    const pointerId = event.pointerId;
    const user = globeState.user;
    let lastX = event.clientX;
    let lastY = event.clientY;
    user.dragging = true;
    user.moved = 0;
    user.velocity = 0;
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      if (renderRef.current?.dataset.pinching === "true") return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      user.moved += Math.abs(dx) + Math.abs(dy);
      user.targetYaw += dx * 0.006;
      user.targetPitch = Math.max(-1.2, Math.min(1.2, user.targetPitch + dy * 0.004));
      user.velocity = dx * 0.003;
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
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
    <div ref={renderRef} className="earth-render is-draggable" onPointerDown={startDrag} role="group" aria-label={lang === "en" ? "Interactive globe: drag to rotate Earth; NISAR orbits and its illustrative radar detects risk zones. The zone list is in the recognition panel." : "Globo interactivo: arrastra para girar la Tierra; NISAR orbita y su radar ilustrativo detecta zonas de riesgo. La lista de zonas está en el panel de reconocimiento."}>
      <SceneBoundary onFailure={showScene}>
        <Canvas style={compact
          ? { position: "absolute", inset: "-20%", width: "140%", height: "140%", overflow: "visible" }
          : quality === "mobile"
            ? { position: "absolute", inset: "-25%", width: "150%", height: "150%", overflow: "visible" }
            : { position: "absolute", inset: "-35%", width: "170%", height: "170%", overflow: "visible" }}
          camera={{ position: [0, 0, compact ? 2.9 : 3.5], fov: 58 }} dpr={compact ? [1.15, 1.5] : quality === "mobile" ? [1.15, 1.65] : [1, 1.6]}
          frameloop={playing && !hidden && pageVisible ? "always" : "demand"}
          fallback={<NoWebGL onReady={showScene} />}
          resize={{ offsetSize: true }}
          gl={{ antialias: quality === "full", alpha: true, powerPreference: "high-performance" }}>
          <Sunlight progress={progress} />
          <Suspense fallback={null}>
            <Planet playing={playing && ready} quality={quality}>
              <NisarOrbit playing={playing} progress={progress} />
              <CompanionSats playing={playing} />
            </Planet>
            <ReconScan ready={ready} progress={progress} />
            <CameraRig />
            <SceneReady onReady={showScene} />
          </Suspense>
        </Canvas>
      </SceneBoundary>
    </div>
  );
}
