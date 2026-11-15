"use client";

import { takeChanged } from "./translate-guard";
import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";

type GoogleTranslateOptions = { pageLanguage: string; includedLanguages: string; autoDisplay: boolean };
type GoogleTranslateWindow = Window & {
  googleTranslateElementInit?: () => void;
  google?: { translate?: { TranslateElement?: new (options: GoogleTranslateOptions, elementId: string) => unknown } };
};

function applyGoogleLanguage(langCode: string, retries = 8) {
  if (typeof document === "undefined") return;
  const select = document.querySelector<HTMLSelectElement>(".goog-te-combo");
  if (!select) {
    if (retries > 0) window.setTimeout(() => applyGoogleLanguage(langCode, retries - 1), 250);
    return;
  }
  const googleCode = langCode === "he" ? "iw" : langCode;
  const hasCode = Array.from(select.options).some((option) => option.value.toLowerCase() === googleCode.toLowerCase());
  select.value = langCode === "es" && !hasCode ? "" : googleCode;
  select.dispatchEvent(new Event("change"));
}

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

export type LanguageOption = {
  code: string;
  name: string;
  native: string;
  flag: string;
};

export const AVAILABLE_LANGUAGES: LanguageOption[] = [
  { code: "es", name: "Español", native: "Español", flag: "🇪🇸" },
  { code: "en", name: "Inglés", native: "English", flag: "🇺🇸" },
  { code: "pt", name: "Portugués", native: "Português", flag: "🇧🇷" },
  { code: "fr", name: "Francés", native: "Français", flag: "🇫🇷" },
  { code: "de", name: "Alemán", native: "Deutsch", flag: "🇩🇪" },
  { code: "it", name: "Italiano", native: "Italiano", flag: "🇮🇹" },
  { code: "zh-CN", name: "Chino", native: "简体中文", flag: "🇨🇳" },
  { code: "ja", name: "Japonés", native: "日本語", flag: "🇯🇵" },
  { code: "ko", name: "Coreano", native: "한국어", flag: "🇰🇷" },
  { code: "ru", name: "Ruso", native: "Русский", flag: "🇷🇺" },
  { code: "ar", name: "Árabe", native: "العربية", flag: "🇸🇦" },
  { code: "hi", name: "Hindi", native: "हिन्दी", flag: "🇮🇳" },
  { code: "nl", name: "Holandés", native: "Nederlands", flag: "🇳🇱" },
  { code: "pl", name: "Polaco", native: "Polski", flag: "🇵🇱" },
  { code: "tr", name: "Turco", native: "Türkçe", flag: "🇹🇷" },
  { code: "vi", name: "Vietnamita", native: "Tiếng Việt", flag: "🇻🇳" },
  { code: "id", name: "Indonesio", native: "Bahasa Indonesia", flag: "🇮🇩" },
  { code: "uk", name: "Ucraniano", native: "Українська", flag: "🇺🇦" },
  { code: "sv", name: "Sueco", native: "Svenska", flag: "🇸🇪" },
  { code: "no", name: "Noruego", native: "Norsk", flag: "🇳🇴" },
  { code: "el", name: "Griego", native: "Ελληνικά", flag: "🇬🇷" },
  { code: "he", name: "Hebreo", native: "עברית", flag: "🇮🇱" },
  { code: "th", name: "Tailandés", native: "ไทย", flag: "🇹🇭" },
  { code: "tl", name: "Tagalo / Filipino", native: "Filipino", flag: "🇵🇭" },
];

/** Idiomas que traduce el traductor automático (todo lo que no es español ni inglés nativo). */
export const isAutoLang = (code: string) => code !== "es" && code !== "en";

type I18n = {
  lang: Lang;
  globalLang: string;
  setLang: (lang: Lang) => void;
  setGlobalLang: (code: string) => void;
  t: Dictionary;
};

const I18nContext = createContext<I18n>({
  lang: "es",
  globalLang: "es",
  setLang: () => {},
  setGlobalLang: () => {},
  t: dictionary.es,
});

const STORAGE_KEY = "saros-lang";
const GLOBAL_STORAGE_KEY = "saros-global-lang";
const CHANGE_EVENT = "saros-lang-change";

// El idioma vive en localStorage; useSyncExternalStore lo lee sin desajustes de hidratación.
function readLang(): Lang {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    // Los idiomas automáticos parten siempre del contenido español, que es
    // el idioma de origen configurado en el traductor externo.
    const global = window.localStorage.getItem(GLOBAL_STORAGE_KEY);
    return (global ? global === "en" : saved === "en") ? "en" : "es";
  } catch {
    return "es";
  }
}

function readGlobalLang(): string {
  try {
    const saved = window.localStorage.getItem(GLOBAL_STORAGE_KEY);
    if (saved) return saved;
    const base = window.localStorage.getItem(STORAGE_KEY);
    return base === "en" ? "en" : "es";
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
  const globalLang = useSyncExternalStore(subscribe, readGlobalLang, () => "es");

  useEffect(() => {
    document.documentElement.lang = globalLang || lang;
  }, [globalLang, lang]);

  // Forzar que Google Translate nunca mueva el body ni muestre el banner superior
  useEffect(() => {
    if (typeof window === "undefined") return;

    const cleanGoogleBanners = () => {
      if (document.body.style.top && document.body.style.top !== "0px") {
        document.body.style.top = "0px";
      }
      if (document.documentElement.style.top && document.documentElement.style.top !== "0px") {
        document.documentElement.style.top = "0px";
      }
      const banners = document.querySelectorAll<HTMLElement>(
        "iframe.goog-te-banner-frame, .goog-te-banner-frame, body > .skiptranslate, iframe.skiptranslate"
      );
      banners.forEach((el) => {
        el.style.setProperty("display", "none", "important");
        el.style.setProperty("visibility", "hidden", "important");
        el.style.setProperty("height", "0", "important");
        el.style.setProperty("opacity", "0", "important");
        el.style.setProperty("pointer-events", "none", "important");
      });
    };

    const observer = new MutationObserver(() => {
      cleanGoogleBanners();
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "class"],
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["style", "class"],
      childList: true,
    });

    cleanGoogleBanners();
    return () => observer.disconnect();
  }, []);

  const applyToCombo = useCallback((langCode: string, retries = 8) => applyGoogleLanguage(langCode, retries), []);

  // Inicializar script de Google Translate para traducción global
  useEffect(() => {
    if (typeof window === "undefined") return;
    const translateWindow = window as GoogleTranslateWindow;
    translateWindow.googleTranslateElementInit = () => {
      try {
        const TranslateElement = translateWindow.google?.translate?.TranslateElement;
        if (TranslateElement) {
          new TranslateElement(
            {
              pageLanguage: "es",
              includedLanguages: AVAILABLE_LANGUAGES.map((l) => (l.code === "he" ? "iw" : l.code)).join(","),
              autoDisplay: false,
            },
            "google_translate_element"
          );
          const current = readGlobalLang();
          if (current && current !== "es" && current !== "en") {
            applyToCombo(current, 10);
          }
        }
      } catch {
        // silenciar si falla la inicialización externa
      }
    };

    if (!document.getElementById("google-translate-script")) {
      const script = document.createElement("script");
      script.id = "google-translate-script";
      script.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
      script.async = true;
      document.body.appendChild(script);
    }
  }, [applyToCombo]);

  // El traductor solo traduce lo que había al cargar. Cada 2 s se revisa si la página muestra texto
  // nuevo sin traducir (abrir una zona, paneles, Saru) y, si lo hay, se le pide traducir otra vez.
  useEffect(() => {
    if (typeof window === "undefined" || !isAutoLang(globalLang)) return;
    const SKIP = "font, script, style, svg, textarea, .notranslate, [translate='no'], .skiptranslate";
    // textos que ya se le pidieron al traductor: si no los traduce, no se insiste con ellos
    const asked = new WeakSet<Node>();
    const fresh = () => {
      const found: Node[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.nodeValue;
        if (!text || !/\p{L}{2,}/u.test(text) || node.parentElement?.closest(SKIP)) continue;
        // un texto que React cambió después de traducirse vuelve marcado como nuevo (translate-guard)
        if (!asked.has(node) || takeChanged(node)) found.push(node);
      }
      return found;
    };
    let busyUntil = 0;
    const check = () => {
      if (document.hidden || Date.now() < busyUntil) return;
      const select = document.querySelector(".goog-te-combo") as HTMLSelectElement | null;
      if (!select || select.options.length < 2) return;
      const found = fresh();
      if (!found.length) return;
      found.forEach((node) => asked.add(node));
      busyUntil = Date.now() + 3500;
      // repetir el mismo idioma no hace nada: se vuelve un instante al original y otra vez al elegido
      const source = Array.from(select.options).some((o) => o.value === "es") ? "es" : "";
      const target = globalLang === "he" ? "iw" : globalLang;
      const pick = (value: string) => {
        select.value = value;
        select.dispatchEvent(new Event("change"));
      };
      // tras volver al original el traductor ignora el primer cambio de idioma: se envía dos veces
      pick(source);
      window.setTimeout(() => pick(target), 250);
      window.setTimeout(() => pick(target), 500);
      // si el traductor no tomó el cambio, la página quedaría en español: se insiste hasta 3 veces
      let again = 0;
      const verify = () => {
        if (document.querySelector("font") || again >= 3) return;
        again += 1;
        pick(target);
        window.setTimeout(verify, 1500);
      };
      window.setTimeout(verify, 2600);
    };
    const id = window.setInterval(check, 2000);
    return () => window.clearInterval(id);
  }, [globalLang]);

  const setGlobalLang = useCallback((code: string) => {
    if (!AVAILABLE_LANGUAGES.some((option) => option.code === code)) return;
    if (readGlobalLang() === code) return;
    const base: Lang = code === "en" ? "en" : "es";
    const previous = readGlobalLang();
    try {
      window.localStorage.setItem(STORAGE_KEY, base);
      window.localStorage.setItem(GLOBAL_STORAGE_KEY, code);
    } catch {
      // sin almacenamiento
    }

    if (typeof document !== "undefined") {
      try {
        const gtCode = code === "he" ? "iw" : code;
        document.cookie = "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
        if (window.location.hostname.includes(".")) {
          document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; domain=${window.location.hostname}; path=/`;
          document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; domain=.${window.location.hostname}; path=/`;
        }
        if (code !== "es" && code !== "en") document.cookie = `googtrans=/es/${gtCode}; path=/; SameSite=Lax`;
      } catch {
        // silenciar errores de cookies
      }
    }

    window.dispatchEvent(new Event(CHANGE_EVENT));
    // Restaurar un DOM limpio al entrar o salir de traducción automática evita
    // que el traductor y React modifiquen simultáneamente los mismos nodos.
    if ((previous !== "es" && previous !== "en") || (code !== "es" && code !== "en")) window.location.reload();
  }, []);

  const setLang = useCallback((next: Lang) => setGlobalLang(next), [setGlobalLang]);

  const value = useMemo(
    () => ({ lang, globalLang, setLang, setGlobalLang, t: dictionary[lang] }),
    [lang, globalLang, setLang, setGlobalLang]
  );

  return (
    <I18nContext.Provider value={value}>
      <div id="google_translate_element" style={{ display: "none" }} aria-hidden="true" />
      {children}
    </I18nContext.Provider>
  );
}

export const useI18n = () => useContext(I18nContext);

/** Conserva siglas y nombres propios al aplicar traducción automática. */
export function ProtectedTerms({ text }: { text: string }) {
  return <>{text.split(/\b(NASA|NISAR|SAROS|InSAR|ASF|DAAC)\b/g).map((part, index) =>
    /^(NASA|NISAR|SAROS|InSAR|ASF|DAAC)$/.test(part)
      ? <span key={index} translate="no" className="notranslate">{part}</span>
      : part
  )}</>;
}

/** Botón ES | EN heredado para compatibilidad si fuera requerido. */
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
