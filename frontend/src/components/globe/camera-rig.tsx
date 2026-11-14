"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { globeState } from "./globe-state";

const FAR = 3.5;   // posición original de la cámara (earth-globe)
const NEAR = 2.2;  // acercamiento al abrir una zona

/** Acerca la cámara al planeta cuando se abre una zona (globeState.zoom), con un movimiento amortiguado. */
export default function CameraRig() {
  const current = useRef(0);
  useFrame(({ camera }, delta) => {
    const target = globeState.zoom;
    // amortiguación críticamente amortiguada: rápida al inicio, suave al llegar
    current.current += (target - current.current) * (1 - Math.exp(-Math.min(delta, 0.1) * 2.6));
    const t = current.current;
    const eased = t * t * (3 - 2 * t);
    camera.position.z = FAR + (NEAR - FAR) * eased;
    camera.lookAt(0, 0, 0);
  });
  return null;
}
