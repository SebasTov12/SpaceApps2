import { Vector3, type Object3D } from "three";

/**
 * Estado compartido entre la escena 3D (useFrame) y la interfaz HTML del globo.
 * Es un objeto mutable a propósito: se lee en cada fotograma sin provocar renders de React.
 */
export const globeState = {
  /** Rotación que controla el usuario (se suma a la rotación propia de la Tierra). */
  user: { yaw: 0, pitch: 0, targetYaw: 0, targetPitch: 0, velocity: 0, dragging: false, moved: 0 },
  /** Grupo al que se aplica la rotación del usuario (lo registra earth-globe). */
  userGroup: null as Object3D | null,
  /** Grupo que gira con la órbita de NISAR (lo registra nisar-orbit). */
  orbit: null as Object3D | null,
  /** Marcadores de zonas por id (los registra risk-markers). */
  markers: new Map<string, Object3D>(),
  /** Reconocimiento inicial: 0 = no empezó, 0–1 = en curso, 1 = terminado. */
  scan: { progress: 0, origin: new Vector3(0, 0, 1), startedAt: -1 },
  /** Zonas ya descubiertas por el reconocimiento. */
  revealed: new Set<string>(),
  /** Último instante (s de reloj) en que el haz detectó cada zona. */
  flashes: new Map<string, number>(),
  /** Visibilidad extra del haz de radar (0–1), además de la del scroll. */
  beam: 0,
  /** Zona a la que el usuario pidió llevar el planeta. */
  focus: null as string | null,
  /** Tiempo del reloj de la escena, para que la interfaz calcule "hace X s". */
  clock: 0,
};

/** Huella del haz en coordenadas del grupo de órbita (ver nisar-radar: lado derecho, ~0.165 fuera del plano). */
export const FOOTPRINT_LOCAL = new Vector3(Math.sqrt(1.012 ** 2 - 0.165 ** 2), 0, 0.165);

export type DetectEvent = { id: string; source: "scan" | "pass"; visible: boolean };
export type ReconEvent = { progress: number; found: number };

export const GLOBE_DETECT = "tenua:detect";
export const GLOBE_RECON = "tenua:recon";
export const GLOBE_SELECT = "tenua:zone-select";

export const emit = <T,>(name: string, detail: T) => window.dispatchEvent(new CustomEvent<T>(name, { detail }));

/** Pide girar el planeta hasta una zona (lo resuelve el controlador en useFrame). */
export function focusZone(id: string) {
  globeState.focus = id;
  emit(GLOBE_SELECT, id);
}
