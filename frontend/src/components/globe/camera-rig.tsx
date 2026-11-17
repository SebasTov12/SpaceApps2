"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Vector3 } from "three";
import { globeState } from "./globe-state";

const FAR = 3.5;   // posición original de la cámara (earth-globe)
const NEAR = 2.2;  // acercamiento al abrir una zona
const DIVE = 1.22; // zambullida final hacia la superficie, justo antes de pasar al mapa
const COUNTRY = 1.68; // acercamiento a un país (vista de sus puntos)

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
  const country = useRef(0);
  const distance = useRef(COUNTRY);
  const offset = useRef({ x: 0, y: 0 });
  const tmp = useMemo(() => new Vector3(), []);
  useFrame(({ camera, gl }, delta) => {
    const step = Math.min(delta, 0.1);
    // amortiguación exponencial: rápida al inicio, suave al llegar
    zoom.current += (globeState.zoom - zoom.current) * (1 - Math.exp(-step * 2.6));
    // la zambullida acelera al final (como una caída), al salir vuelve más despacio
    const diveRate = globeState.dive > dive.current ? 2.4 : 3.2;
    dive.current += (globeState.dive - dive.current) * (1 - Math.exp(-step * diveRate));
    const countryZoomTarget = globeState.country ? globeState.countryZoom : globeState.planetZoom;
    country.current += (countryZoomTarget - country.current) * (1 - Math.exp(-step * 2.2));
    const near = NEAR + (DIVE - NEAR) * smooth(Math.min(1, dive.current));
    // con un país abierto la cámara parte más cerca; al abrir una zona sigue acercándose desde ahí
    const targetCountryDistance = globeState.country
      ? 1 + ((globeState.countryDistance || COUNTRY) - 1) / globeState.countryMagnification
      : COUNTRY;
    const countryDistance = Math.min(FAR, targetCountryDistance);
    distance.current += (countryDistance - distance.current) * (1 - Math.exp(-step * 3));
    const far = FAR + (distance.current - FAR) * smooth(Math.min(1, country.current));
    const zoneDistance = far + (Math.min(near, far) - far) * smooth(Math.min(1, zoom.current));
    camera.position.z = zoneDistance;
    camera.lookAt(0, 0, 0);

    // seguir la zona: llevarla al centro del área del mapa
    let goal = { x: 0, y: 0 };
    const node = globeState.selected
      ? globeState.markers.get(globeState.selected) ?? globeState.hazardMarkers.get(globeState.selected)
      : undefined;
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
    // Vista de un país: el planeta crece más que el lienzo; una máscara circular que se cierra con el
    // acercamiento conserva la forma redonda (sin el recorte rectangular del lienzo)
    const c = smooth(Math.min(1, country.current));
    const style = gl.domElement.style;
    if (c > 0.01) {
      const half = Math.min(gl.domElement.clientWidth, gl.domElement.clientHeight) / 2;
      const r = half * (1.5 - 0.52 * c);
      const mask = `radial-gradient(circle ${r.toFixed(0)}px at 50% 50%, #000 ${(r * 0.86).toFixed(0)}px, rgba(0,0,0,.55) ${(r * 0.94).toFixed(0)}px, transparent ${r.toFixed(0)}px)`;
      if (style.maskImage !== mask) { style.maskImage = mask; style.setProperty("-webkit-mask-image", mask); }
    } else if (style.maskImage) {
      style.maskImage = ""; style.setProperty("-webkit-mask-image", "");
    }
  });
  return null;
}
