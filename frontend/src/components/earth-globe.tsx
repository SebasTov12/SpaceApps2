"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { useReducedMotion, type MotionValue } from "framer-motion";
import { Component, Suspense, useRef, type ReactNode } from "react";
import NisarOrbit from "@/components/nisar-orbit";
import { AdditiveBlending, BackSide, SRGBColorSpace, Vector2, type AmbientLight, type DirectionalLight, type Group, type Mesh } from "three";

function Planet() {
  const surface = useRef<Group>(null);
  const clouds = useRef<Mesh>(null);
  const reducedMotion = useReducedMotion();
  const [day, cloud, normal, specular] = useTexture([
    "/earth-blue-marble.jpg", "/earth-clouds.png",
    "/earth-normal.jpg", "/earth-specular.jpg",
  ], (textures) => {
    textures[0].colorSpace = SRGBColorSpace;
    for (const texture of textures) texture.anisotropy = 4;
  });
  useFrame((_, delta) => {
    if (reducedMotion) return;
    const step = Math.min(delta, 0.05);
    if (surface.current) surface.current.rotation.y += step * 0.045;
    if (clouds.current) clouds.current.rotation.y += step * 0.002;
  });
  return (
    <group rotation={[-0.25, 0, -0.08]}>
      <group ref={surface} rotation={[0, -Math.PI / 2 + 65 * Math.PI / 180, 0]}>
        <mesh>
          <sphereGeometry args={[1, 128, 64]} />
          <meshPhongMaterial map={day} normalMap={normal} normalScale={new Vector2(0.12, 0.12)}
            specularMap={specular} specular="#18232a" shininess={65}
            emissive="#183b62" emissiveIntensity={0.3} />
        </mesh>
        <mesh ref={clouds} scale={1.006}>
          <sphereGeometry args={[1, 96, 48]} />
          <meshPhongMaterial alphaMap={cloud} color="#ffffff" transparent opacity={0.82} depthWrite={false} shininess={0}
            onBeforeCompile={(shader) => {
              // This cloud asset stores soft coverage in alpha, not in its binary RGB channels.
              shader.fragmentShader = shader.fragmentShader.replace(
                "#include <alphamap_fragment>",
                "diffuseColor.a *= texture2D(alphaMap, vAlphaMapUv).a;"
              );
            }} />
        </mesh>
      </group>
      <mesh scale={1.002}>
        <sphereGeometry args={[1, 96, 48]} />
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
        <sphereGeometry args={[1, 96, 48]} />
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
  );
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="earth-static" /> : this.props.children; }
}

function Sunlight({ progress }: { progress: MotionValue<number> }) {
  const ambient = useRef<AmbientLight>(null);
  const sun = useRef<DirectionalLight>(null);
  useFrame(() => {
    const reveal = Math.min(1, Math.max(0, progress.get()));
    if (ambient.current) ambient.current.intensity = 0.45 + reveal * 0.7;
    if (sun.current) {
      sun.current.position.set(-3 + reveal * 2, 4 - reveal * 2.5, 3 + reveal * 4);
      sun.current.intensity = 2.1 - reveal * 0.3;
    }
  });
  return (
    <>
      <ambientLight ref={ambient} intensity={0.45} />
      <directionalLight ref={sun} position={[-3, 4, 3]} intensity={2.1} color="#fff5e8" />
    </>
  );
}

export default function EarthGlobe({ progress }: { progress: MotionValue<number> }) {
  return (
    <div className="earth-render" role="img" aria-label="Tierra tridimensional con Latinoamérica al inicio, nubes y atmósfera">
      <SceneBoundary>
        <Canvas style={{ position: "absolute", inset: "-35%", width: "170%", height: "170%" }}
          camera={{ position: [0, 0, 3.5], fov: 58 }} dpr={[1, 1.75]}
          resize={{ offsetSize: true }}
          gl={{ antialias: true, alpha: true }} fallback={<div className="earth-static" />}>
          <Sunlight progress={progress} />
          <Suspense fallback={null}><Planet /></Suspense>
          <Suspense fallback={null}><NisarOrbit /></Suspense>
        </Canvas>
      </SceneBoundary>
    </div>
  );
}
