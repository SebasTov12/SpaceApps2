"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { DoubleSide, type Group, type Mesh } from "three";
import { loadSites, type SiteSummary } from "@/lib/sites";

const SITE_EVENT = "tenua:site";

/** Posición en la esfera de three.js (SphereGeometry con la textura equirectangular por defecto). */
function spherePosition(lat: number, lon: number, radius: number): [number, number, number] {
  const phi = ((lon + 180) / 360) * Math.PI * 2;
  const theta = ((90 - lat) / 180) * Math.PI;
  return [-Math.cos(phi) * Math.sin(theta) * radius, Math.cos(theta) * radius, Math.sin(phi) * Math.sin(theta) * radius];
}

function Marker({ site, offset }: { site: SiteSummary; offset: number }) {
  const group = useRef<Group>(null);
  const ring = useRef<Mesh>(null);
  const [hover, setHover] = useState(false);
  const position = spherePosition(site.lat, site.lon, 1.012);
  const color = site.pilot ? "#e8b36b" : "#79d3d3";

  useEffect(() => {
    // orienta el marcador hacia fuera de la esfera
    group.current?.lookAt(position[0] * 2, position[1] * 2, position[2] * 2);
  }, [position]);

  useFrame(({ clock }) => {
    if (!ring.current) return;
    const t = (clock.elapsedTime * 0.6 + offset) % 1;
    ring.current.scale.setScalar(1 + t * 2.4);
    (ring.current.material as { opacity: number }).opacity = 0.7 * (1 - t);
  });

  const open = () => {
    window.dispatchEvent(new CustomEvent(SITE_EVENT, { detail: site.id }));
    document.getElementById("explorador")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <group ref={group} position={position}>
      <mesh
        onClick={(event) => { event.stopPropagation(); open(); }}
        onPointerOver={(event) => { event.stopPropagation(); setHover(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHover(false); document.body.style.cursor = ""; }}
        scale={hover ? 1.6 : 1}
      >
        <circleGeometry args={[0.014, 24]} />
        <meshBasicMaterial color={color} side={DoubleSide} toneMapped={false} />
      </mesh>
      <mesh ref={ring}>
        <ringGeometry args={[0.016, 0.02, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.7} side={DoubleSide} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Sitios monitoreados sobre el globo: pulsan y abren el sitio en el explorador al hacer clic. */
export default function SiteMarkers() {
  const [sites, setSites] = useState<SiteSummary[]>([]);
  useEffect(() => {
    loadSites().then(setSites).catch(() => setSites([]));
  }, []);
  return (
    <group>
      {sites.map((site, index) => <Marker key={site.id} site={site} offset={index * 0.21} />)}
    </group>
  );
}
