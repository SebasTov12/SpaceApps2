import { useEffect, useMemo } from "react";
import { RoundedBox } from "@react-three/drei";
import { DataTexture, DoubleSide, RepeatWrapping, RGBAFormat, SRGBColorSpace, Vector2, type Texture } from "three";

const RIM_RADIUS = 0.38;
const SECTORS = 48;

function spacecraftTextures() {
  const size = 256;
  const foilPixels = new Uint8Array(size * size * 4);
  const solarPixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;
      // Layered ridges approximate creases in the thermal insulation blanket.
      const ridge = Math.sin(x * 0.19 + Math.sin(y * 0.14) * 3) * Math.sin(y * 0.23 + x * 0.08);
      const grain = Math.sin(x * 41.3 + y * 17.7) * 0.08;
      const value = Math.round(135 + ridge * 65 + grain * 50);
      foilPixels.set([value, value, value, 255], offset);
      const edge = x % 32 < 2 || y % 32 < 2;
      const busbar = x % 16 === 8;
      const stripe = y % 4 === 0;
      const tint = Math.round(4 * Math.sin(Math.floor(x / 32) * 3 + Math.floor(y / 32)));
      solarPixels.set(edge ? [62, 70, 80, 255] : busbar ? [104, 118, 133, 255] :
        [12 + tint, 26 + tint + (stripe ? 5 : 0), 48 + tint + (stripe ? 9 : 0), 255], offset);
    }
  }
  const foil = new DataTexture(foilPixels, size, size, RGBAFormat);
  const solar = new DataTexture(solarPixels, size, size, RGBAFormat);
  solar.colorSpace = SRGBColorSpace;
  for (const texture of [foil, solar]) {
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.needsUpdate = true;
    texture.anisotropy = 4;
  }
  return { foil, solar };
}

function reflectorHeight(radius: number) {
  return 0.1 * (radius / RIM_RADIUS) ** 2;
}

function Reflector() {
  const { profile, framework } = useMemo(() => {
    const profile = Array.from({ length: 13 }, (_, index) => {
      const radius = index * RIM_RADIUS / 12;
      return new Vector2(radius, reflectorHeight(radius));
    });
    const segments: number[] = [];
    const point = (radius: number, sector: number, height = reflectorHeight(radius)) => {
      const angle = sector * 2 * Math.PI / SECTORS;
      return [radius * Math.sin(angle), height, radius * Math.cos(angle)];
    };
    for (let sector = 0; sector < SECTORS; sector++) {
      for (let band = 1; band <= 9; band++) {
        const radius = band * RIM_RADIUS / 9;
        segments.push(...point(radius, sector), ...point(radius, sector + 1));
      }
      segments.push(0, 0, 0, ...point(RIM_RADIUS, sector));
      segments.push(...point(RIM_RADIUS, sector, 0.15), ...point(RIM_RADIUS, sector + 1, 0.15));
      segments.push(...point(RIM_RADIUS, sector), ...point(RIM_RADIUS, sector + 1, 0.15));
    }
    return { profile, framework: new Float32Array(segments) };
  }, []);

  return (
    <group position={[-0.30, 0.49, 0.06]} rotation={[0, 0, 1.02]}>
      <mesh>
        <latheGeometry args={[profile, SECTORS]} />
        <meshPhongMaterial color="#8e8067" specular="#ebddbd" shininess={80}
          side={DoubleSide} transparent opacity={0.18} depthWrite={false} />
      </mesh>
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[framework, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#a79d89" transparent opacity={0.52} depthWrite={false} />
      </lineSegments>
      <mesh position={[0, 0.155, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[RIM_RADIUS, 0.006, 6, SECTORS]} />
        <meshPhongMaterial color="#a79270" specular="#fff1d4" shininess={65} />
      </mesh>
    </group>
  );
}

function SolarWing({ side, texture }: { side: -1 | 1; texture: Texture }) {
  return (
    <group position={[0, -0.025, side * 0.34]} rotation={[side * 0.12, 0, 0]}>
      <mesh>
        <boxGeometry args={[0.205, 0.015, 0.40]} />
        <meshPhongMaterial color="#777e88" specular="#c4cedc" shininess={65} />
      </mesh>
      {[-1, 1].map((face) => (
        <mesh key={face} position={[0, face * 0.008, 0]} rotation={[-face * Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.19, 0.386]} />
          <meshPhongMaterial map={texture} specular="#849ab5" shininess={100} />
        </mesh>
      ))}
    </group>
  );
}

export default function NisarModel() {
  const { foil, solar } = useMemo(() => spacecraftTextures(), []);
  useEffect(() => () => { foil.dispose(); solar.dispose(); }, [foil, solar]);
  return (
    <group>
      <RoundedBox args={[0.235, 0.25, 0.27]} radius={0.012} smoothness={2}>
        <meshPhongMaterial color="#9e7738" bumpMap={foil} bumpScale={0.009}
          specular="#e3c68a" shininess={75} />
      </RoundedBox>
      <mesh position={[-0.128, 0.013, 0]}>
        <boxGeometry args={[0.025, 0.21, 0.22]} />
        <meshPhongMaterial color="#adad9e" specular="#fff8da" shininess={40} />
      </mesh>
      {Array.from({ length: 7 }, (_, index) => (
        <mesh key={`radiator-${index}`} position={[-0.142, 0.013, -0.09 + index * 0.03]}>
          <boxGeometry args={[0.003, 0.185, 0.008]} />
          <meshPhongMaterial color="#4c535a" shininess={25} />
        </mesh>
      ))}
      {[-0.085, 0.085].map((y) => (
        <mesh key={`strap-${y}`} position={[0, y, 0]}>
          <boxGeometry args={[0.239, 0.012, 0.274]} />
          <meshPhongMaterial color="#c3b491" specular="#e7dcc6" shininess={70} />
        </mesh>
      ))}
      {[-0.092, -0.031, 0.031, 0.092].map((z) => (
        <mesh key={z} position={[0.107, 0.115, z]}>
          <boxGeometry args={[0.037, 0.045, 0.018]} />
          <meshPhongMaterial color="#f2c86d" specular="#ffebaa" shininess={70} />
        </mesh>
      ))}
      <SolarWing side={-1} texture={solar} />
      <SolarWing side={1} texture={solar} />
      <group position={[-0.13, 0.27, 0.035]} rotation={[0.04, 0, 0.44]}>
        {[-0.02, 0.02].map((z) => (
          <mesh key={z} position={[0, 0, z]}>
            <cylinderGeometry args={[0.009, 0.011, 0.48, 6]} />
            <meshPhongMaterial color="#be913d" specular="#ffe0a0" shininess={55} />
          </mesh>
        ))}
        {[-0.21, -0.07, 0.07, 0.21].map((y) => (
          <mesh key={y} position={[0, y, 0]}>
            <boxGeometry args={[0.023, 0.018, 0.058]} />
            <meshPhongMaterial color="#d4ab60" />
          </mesh>
        ))}
      </group>
      <mesh position={[-0.265, 0.49, 0.047]}>
        <boxGeometry args={[0.086, 0.026, 0.042]} />
        <meshPhongMaterial color="#be913d" specular="#ffe0a0" shininess={55} />
      </mesh>
      <Reflector />
    </group>
  );
}
