import { Vector3, type Object3D } from "three";

/** Relieve exagerado del planeta (fracción del radio). Montañas y casquetes sobresalen hasta este valor. */
export const RELIEF = 0.04;
/** Radio de las capas que van sobre el relieve (franja del radar, barrido). */
export const OVER_RELIEF = 1 + RELIEF + 0.006;
/** Separación angular ilustrativa compartida por la cuadrícula y la huella del radar. */
export const SCAN_GRID_DEGREES = 5;
/** Tiempos compartidos para coordinar los haces ilustrativos. */
export const SCAN_INTERVAL = 30;
export const SCAN_DURATION = 5.2;
export const SCAN_FADE = 1.6;

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
  scan: { progress: 0, origin: new Vector3(0, 0, 1), startedAt: -1, originCapturedAt: -1 },
  /** Zonas ya descubiertas por el reconocimiento. */
  revealed: new Set<string>(),
  /** Último instante (s de reloj) en que el haz detectó cada zona. */
  flashes: new Map<string, number>(),
  /** Nivel de cercanía/iluminación del haz de radar sobre cada zona (0–1). */
  radarProximity: new Map<string, number>(),
  /** Visibilidad extra del haz de radar (0–1), además de la del scroll. */
  beam: 0,
  /** La interfaz del planeta (puntos, barra de modos, Saru) aparece al bajar con el scroll. */
  uiRevealed: false,
  /** Qué se ve en el planeta: todo, solo amenazas o solo vigilancia ambiental (tala y minería). */
  mode: "all" as "all" | "risk" | "watch",
  /** País abierto (código ISO-2): el planeta se acerca y muestra dentro todos sus puntos. null = vista de países. */
  country: null as string | null,
  /** Acercamiento de la cámara a un país (0 = planeta completo, 1 = país en primer plano). */
  countryZoom: 0,
  /** Tipos ocultos con el filtro del panel derecho (amenazas y zonas comparten las claves de tipo). */
  hiddenKinds: new Set<string>(),
  /** Cambia cada vez que cambia el filtro (la malla de puntos se recalcula). */
  filterVersion: 0,
  /** Zona a la que el usuario pidió llevar el planeta. */
  focus: null as string | null,
  /** Acercamiento de la cámara a una zona: 0 = vista general, 1 = zona abierta. */
  zoom: 0,
  /** Zona abierta ahora mismo (la cámara la sigue para dejarla en el centro del área del mapa). */
  selected: null as string | null,
  /** Zambullida de la cámara hacia la zona (0–1), justo antes de que aparezca el mapa. */
  dive: 0,
  /** Tiempo del reloj de la escena, para que la interfaz calcule "hace X s". */
  clock: 0,
};

/** Huella del haz en coordenadas del grupo de órbita (ver nisar-radar: lado derecho, ~0.165 fuera del plano). */
export const FOOTPRINT_LOCAL = new Vector3(Math.sqrt(OVER_RELIEF ** 2 - 0.165 ** 2), 0, 0.165);

export type DetectEvent = { id: string; source: "scan" | "pass"; visible: boolean };
export type ReconEvent = { progress: number; found: number };

export const GLOBE_DETECT = "saros:detect";
export const GLOBE_RECON = "saros:recon";
export const GLOBE_SELECT = "saros:zone-select";
/** Pedir que se abra un sitio con datos (lo usan el cintillo y otros componentes). */
export const SITE_EVENT = "saros:site";

/** Se abrió o cerró un país (detail: código ISO-2 o null). */
export const COUNTRY_EVENT = "saros:country";

/** Acerca el planeta a un país y muestra todos sus puntos. */
export function openCountry(code: string) {
  globeState.country = code;
  globeState.countryZoom = 1;
  window.dispatchEvent(new CustomEvent(COUNTRY_EVENT, { detail: code }));
}

/** Aviso de que cambió el filtro de tipos (detail: tipos ocultos). */
export const KIND_FILTER_EVENT = "saros:kind-filter";

/** Muestra u oculta un tipo de punto en la vista del país. */
export function toggleKind(kind: string | null) {
  if (kind === null) globeState.hiddenKinds.clear();
  else if (globeState.hiddenKinds.has(kind)) globeState.hiddenKinds.delete(kind);
  else globeState.hiddenKinds.add(kind);
  globeState.filterVersion += 1;
  window.dispatchEvent(new CustomEvent(KIND_FILTER_EVENT, { detail: new Set(globeState.hiddenKinds) }));
}

/** Vuelve a la vista de países. */
export function closeCountry() {
  globeState.country = null;
  globeState.hiddenKinds.clear();
  globeState.filterVersion += 1;
  globeState.countryZoom = 0;
  window.dispatchEvent(new CustomEvent(COUNTRY_EVENT, { detail: null }));
}

/** Aviso de que la interfaz del planeta se mostró u ocultó (detail: boolean). */
export const UI_REVEAL = "saros:ui-reveal";

export const emit = <T,>(name: string, detail: T) => window.dispatchEvent(new CustomEvent<T>(name, { detail }));

/** Cierra la zona abierta y aleja la cámara. */
export function closeZone() {
  globeState.focus = null;
  globeState.dive = 0;
  emit(GLOBE_SELECT, null);
}

/** Pide girar el planeta hasta una zona (lo resuelve el controlador en useFrame). */
export function focusZone(id: string) {
  globeState.focus = id;
  emit(GLOBE_SELECT, id);
}
