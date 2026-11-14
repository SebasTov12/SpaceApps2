"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";

export type Lang = "es" | "en";

const es = {
    demoHeader: "DEMO · FORMATO NISAR",
    realHeader: "DATOS NISAR · ASF DAAC",
    search: "Buscar",
    profile: "Perfil de Tobaru Workteam",
    openFilters: "Abrir filtros",
    closeFilters: "Cerrar filtros",
    filtersLabel: "Filtros del explorador",
    sitesEyebrow: "SITIOS MONITOREADOS",
    explorer: "Explorador",
    siteGroup: "Sitio",
    pilot: "piloto",
    mapView: "VISTA DEL MAPA",
    viewSingle: "Fecha",
    viewSingleDetail: "Una adquisición",
    viewSwipe: "Antes / después",
    viewSwipeDetail: "Arrastra para comparar",
    viewChange: "Cambio",
    viewChangeDetail: "Última menos primera",
    opacity: "Opacidad de la capa NISAR",
    observationDate: "FECHA DE OBSERVACIÓN",
    acquisitions: (n: number) => `${n} adquisiciones · cada 12 días`,
    asfScenes: "En ASF DAAC",
    asfScenesDetail: (n: number, product: string) => `${n} escenas reales L2 ${product}`,
    asfChecked: "Consultado",
    loadingSource: "Cargando procedencia…",
    loadingSite: "Cargando sitio…",
    centerMap: "Centrar mapa",
    switchSite: "Cambiar de sitio",
    mapOf: "Mapa de",
    changeFrom: "CAMBIO",
    clickHint: "Haz clic en el mapa para ver la serie temporal de un punto",
    before: "antes",
    after: "después",
    timeSeries: "Serie temporal",
    changeUsesEnds: "El mapa de cambio usa la primera y la última fecha",
    every12: (demo: boolean) => `Adquisiciones cada 12 días · ${demo ? "fechas de demostración" : "fechas reales"}`,
    selectDate: "Seleccionar fecha de observación",
    showObservation: (d: string) => `Mostrar observación del ${d}`,
    pointEyebrow: "EVOLUCIÓN DEL PUNTO SELECCIONADO",
    selectPoint: "Selecciona un punto",
    source: "FUENTE",
    metric: "MÉTRICA",
    radarEyebrow: "¿QUÉ VE EL RADAR?",
    demoLimit: "Valores sintéticos para mostrar el flujo. Cuando se procesen productos NISAR de ASF, este sitio mostrará mediciones reales.",
    realLimit: "Medición satelital: requiere validación local. No es una alerta oficial.",
    footerLeft: "· NASA SPACE APPS · RETO NISAR",
    footerDemo: "DATOS SINTÉTICOS CON FORMATO NISAR",
    footerReal: "DATOS NISAR · ASF DAAC",
    noData: "No se encontraron los datos de los sitios. Ejecuta pipeline/build_layers.py --demo.",
    siteError: "No se pudo cargar el sitio seleccionado.",
    chartEmpty: "Sin datos en este punto (fuera de cobertura o sin señal). Prueba otro lugar dentro del recuadro.",
    chartLabel: (unit: string) => `Serie temporal en ${unit}`,
    noValue: "sin dato",
    compare: "Comparar antes y después",
    beforeTag: "Antes",
    afterTag: "Después",
    mapLoading: "Cargando mapa…",
    mapFailed: "No se pudo iniciar el mapa (WebGL no disponible).",
    language: "Idioma",
};

const en: typeof es = {
    demoHeader: "DEMO · NISAR FORMAT",
    realHeader: "NISAR DATA · ASF DAAC",
    search: "Search",
    profile: "Tobaru Workteam profile",
    openFilters: "Open filters",
    closeFilters: "Close filters",
    filtersLabel: "Explorer filters",
    sitesEyebrow: "MONITORED SITES",
    explorer: "Explorer",
    siteGroup: "Site",
    pilot: "pilot",
    mapView: "MAP VIEW",
    viewSingle: "Date",
    viewSingleDetail: "One acquisition",
    viewSwipe: "Before / after",
    viewSwipeDetail: "Drag to compare",
    viewChange: "Change",
    viewChangeDetail: "Last minus first",
    opacity: "NISAR layer opacity",
    observationDate: "OBSERVATION DATE",
    acquisitions: (n: number) => `${n} acquisitions · every 12 days`,
    asfScenes: "At ASF DAAC",
    asfScenesDetail: (n: number, product: string) => `${n} real L2 ${product} scenes`,
    asfChecked: "Checked",
    loadingSource: "Loading provenance…",
    loadingSite: "Loading site…",
    centerMap: "Center map",
    switchSite: "Switch site",
    mapOf: "Map of",
    changeFrom: "CHANGE",
    clickHint: "Click the map to see a point's time series",
    before: "before",
    after: "after",
    timeSeries: "Time series",
    changeUsesEnds: "The change map uses the first and last dates",
    every12: (demo: boolean) => `Acquisitions every 12 days · ${demo ? "demo dates" : "real dates"}`,
    selectDate: "Select observation date",
    showObservation: (d: string) => `Show observation from ${d}`,
    pointEyebrow: "SELECTED POINT OVER TIME",
    selectPoint: "Select a point",
    source: "SOURCE",
    metric: "METRIC",
    radarEyebrow: "WHAT DOES THE RADAR SEE?",
    demoLimit: "Synthetic values to show the workflow. Once NISAR products from ASF are processed, this site will show real measurements.",
    realLimit: "Satellite measurement: needs local validation. Not an official alert.",
    footerLeft: "· NASA SPACE APPS · NISAR CHALLENGE",
    footerDemo: "SYNTHETIC DATA IN NISAR FORMAT",
    footerReal: "NISAR DATA · ASF DAAC",
    noData: "Site data not found. Run pipeline/build_layers.py --demo.",
    siteError: "Could not load the selected site.",
    chartEmpty: "No data at this point (outside coverage or no signal). Try another spot inside the box.",
    chartLabel: (unit: string) => `Time series in ${unit}`,
    noValue: "no data",
    compare: "Compare before and after",
    beforeTag: "Before",
    afterTag: "After",
    mapLoading: "Loading map…",
    mapFailed: "The map could not start (WebGL unavailable).",
    language: "Language",
};

const dictionary = { es, en };
export type Dictionary = typeof es;

type I18n = { lang: Lang; setLang: (lang: Lang) => void; t: Dictionary };
const I18nContext = createContext<I18n>({ lang: "es", setLang: () => {}, t: dictionary.es });

const STORAGE_KEY = "tenua-lang";
const CHANGE_EVENT = "tenua-lang-change";

// El idioma vive en localStorage; useSyncExternalStore lo lee sin desajustes de hidratación.
function readLang(): Lang {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === "en" ? "en" : "es";
  } catch {
    return "es";
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(subscribe, readLang, () => "es" as Lang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // sin almacenamiento: el cambio no se recuerda
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const value = useMemo(() => ({ lang, setLang, t: dictionary[lang] }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);

/** Botón ES | EN. */
export function LanguageToggle({ className }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div className={`lang-toggle ${className ?? ""}`} role="group" aria-label={t.language}>
      {(["es", "en"] as const).map((option) => (
        <button key={option} type="button" aria-pressed={lang === option} className={lang === option ? "is-active" : undefined} onClick={() => setLang(option)}>
          {option.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
