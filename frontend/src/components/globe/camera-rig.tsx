"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Vector3 } from "three";
import { globeState } from "./globe-state";

const FAR = 3.5;   // posición original de la cámara (earth-globe)
const NEAR = 2.2;  // acercamiento al abrir una zona
const DIVE = 1.22; // zambullida final hacia la superficie, justo antes de pasar al mapa

const smooth = (x: number) => x * x * (3 - 2 * x);

/** Centro del área donde se verá el mapa (a la izquierda del panel, o encima de la hoja en el teléfono). */
function mapCenter() {
  const wide = window.innerWidth > 900;
  return wide ? { x: (window.innerWidth - 540) / 2, y: window.innerHeight / 2 } : { x: window.innerWidth / 2, y: window.innerHeight * 0.22 };
}

/**
 * Acerca la cámara al planeta cuando se abre una zona (globeState.zoom) y, cuando el mapa está listo,
 * se zambulle hacia la superficie (globeState.dive). Mientras tanto desplaza el lienzo para que la zona
 * quede justo donde aparecerá en el mapa: el paso del 3D al mapa no salta de sitio.
 */
export default function CameraRig() {
  const zoom = useRef(0);
  const dive = useRef(0);
  const offset = useRef({ x: 0, y: 0 });
  const tmp = useMemo(() => new Vector3(), []);
  useFrame(({ camera, gl }, delta) => {
    const step = Math.min(delta, 0.1);
    // amortiguación exponencial: rápida al inicio, suave al llegar
    zoom.current += (globeState.zoom - zoom.current) * (1 - Math.exp(-step * 2.6));
    // la zambullida acelera al final (como una caída), al salir vuelve más despacio
    const diveRate = globeState.dive > dive.current ? 2.4 : 3.2;
    dive.current += (globeState.dive - dive.current) * (1 - Math.exp(-step * diveRate));
    const near = NEAR + (DIVE - NEAR) * smooth(Math.min(1, dive.current));
    camera.position.z = FAR + (near - FAR) * smooth(Math.min(1, zoom.current));
    camera.lookAt(0, 0, 0);

    // seguir la zona: llevarla al centro del área del mapa
    let goal = { x: 0, y: 0 };
    const node = globeState.selected ? globeState.markers.get(globeState.selected) : undefined;
    if (node && globeState.zoom > 0) {
      node.getWorldPosition(tmp);
      if (tmp.z > 0) {
        tmp.project(camera);
        const rect = gl.domElement.getBoundingClientRect();
        const sx = rect.left + ((tmp.x + 1) / 2) * rect.width;
        const sy = rect.top + ((1 - tmp.y) / 2) * rect.height;
        const target = mapCenter();
        // la medida ya incluye el desplazamiento actual
        goal = { x: offset.current.x + (target.x - sx), y: offset.current.y + (target.y - sy) };
      } else {
        goal = offset.current;
      }
    }
    const k = 1 - Math.exp(-step * 4);
    offset.current.x += (goal.x - offset.current.x) * k;
    offset.current.y += (goal.y - offset.current.y) * k;
    const moving = Math.abs(offset.current.x) > 0.5 || Math.abs(offset.current.y) > 0.5;
    gl.domElement.style.transform = moving ? `translate3d(${offset.current.x.toFixed(1)}px, ${offset.current.y.toFixed(1)}px, 0)` : "";
  });
  return null;
}
