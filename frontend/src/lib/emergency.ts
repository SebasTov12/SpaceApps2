/**
 * Números de emergencia por país y según el tipo de amenaza de cada zona.
 * Fuentes: números oficiales de cada país (línea única de emergencias y líneas de bomberos,
 * defensa civil o denuncias ambientales). Revisar antes de cada publicación: pueden cambiar.
 */
import type { RiskKind, RiskZone } from "./risk-zones";

type L = { es: string; en: string };
export type EmergencyLine = { n: string; label: L };
type CountryLines = {
  name: L;
  /** Línea única de emergencias (la que se marca primero). */
  main: EmergencyLine;
  /** Otras líneas útiles, en orden. */
  more?: EmergencyLine[];
  /** Línea que va primero según la amenaza (p. ej. bomberos ante incendios). */
  byKind?: Partial<Record<RiskKind, EmergencyLine[]>>;
  /** Quién emite la información oficial, según la amenaza. */
  agencies: Partial<Record<RiskKind | "default", string>>;
  /** Aclaración cuando no hay población o el servicio es distinto. */
  note?: L;
};

const line = (n: string, es: string, en: string): EmergencyLine => ({ n, label: { es, en } });
const EMERGENCIAS = (n: string) => line(n, "Emergencias", "Emergencies");

const COUNTRIES: Record<string, CountryLines> = {
  CO: {
    name: { es: "Colombia", en: "Colombia" },
    main: EMERGENCIAS("123"),
    more: [line("119", "Bomberos", "Fire brigade"), line("144", "Defensa Civil", "Civil Defense"), line("132", "Cruz Roja", "Red Cross")],
    byKind: {
      wildfire: [line("119", "Bomberos", "Fire brigade")],
      deforestation: [line("123", "Denuncia ambiental (Policía)", "Report environmental crime (Police)")],
      mining: [line("123", "Denuncia minería ilegal (Policía)", "Report illegal mining (Police)")],
    },
    agencies: {
      default: "UNGRD · SGC · IDEAM",
      landslide: "UNGRD · SGC · IDEAM",
      volcano: "SGC · UNGRD",
      earthquake: "SGC · UNGRD",
      flood: "IDEAM · UNGRD",
      subsidence: "SGC · UNGRD",
      deforestation: "IDEAM · MinAmbiente · CAR",
      mining: "MinAmbiente · ANM · CAR",
    },
  },
  MX: { name: { es: "México", en: "Mexico" }, main: EMERGENCIAS("911"), agencies: { default: "CENAPRED · Protección Civil" } },
  US: { name: { es: "Estados Unidos", en: "United States" }, main: EMERGENCIAS("911"), agencies: { default: "FEMA · USGS", subsidence: "USGS · Cal OES", volcano: "USGS HVO · Defensa Civil del condado" } },
  CA: {
    name: { es: "Canadá", en: "Canada" }, main: EMERGENCIAS("911"),
    byKind: { wildfire: [line("1-800-663-5555", "Reportar incendio (BC Wildfire)", "Report a wildfire (BC Wildfire)")] },
    agencies: { default: "Emergency Info BC", wildfire: "BC Wildfire Service" },
  },
  BR: {
    name: { es: "Brasil", en: "Brazil" }, main: line("193", "Bomberos", "Fire brigade"),
    more: [line("199", "Defensa Civil", "Civil Defense"), line("192", "SAMU (ambulancia)", "SAMU (ambulance)"), line("190", "Policía", "Police")],
    byKind: {
      deforestation: [line("0800 61 8080", "Linha Verde IBAMA (denuncia ambiental)", "IBAMA Green Line (environmental report)")],
      mining: [line("0800 61 8080", "Linha Verde IBAMA (denuncia ambiental)", "IBAMA Green Line (environmental report)")],
    },
    agencies: { default: "Defesa Civil · INPE", deforestation: "IBAMA · INPE" },
  },
  BD: { name: { es: "Bangladés", en: "Bangladesh" }, main: EMERGENCIAS("999"), agencies: { default: "DDM · BWDB", flood: "FFWC · DDM" } },
  GL: { name: { es: "Groenlandia", en: "Greenland" }, main: EMERGENCIAS("112"), agencies: { default: "Politi · Asiaq" } },
  ID: {
    name: { es: "Indonesia", en: "Indonesia" }, main: EMERGENCIAS("112"),
    more: [line("113", "Bomberos", "Fire brigade"), line("118", "Ambulancia", "Ambulance")],
    agencies: { default: "BNPB · BMKG" },
  },
  IR: {
    name: { es: "Irán", en: "Iran" }, main: line("112", "Media Luna Roja (rescate)", "Red Crescent (rescue)"),
    more: [line("125", "Bomberos", "Fire brigade"), line("115", "Ambulancia", "Ambulance"), line("110", "Policía", "Police")],
    agencies: { default: "Organización Nacional de Gestión de Crisis" },
  },
  IT: { name: { es: "Italia", en: "Italy" }, main: EMERGENCIAS("112"), agencies: { default: "Protezione Civile · INGV", volcano: "INGV Osservatorio Vesuviano · Protezione Civile" } },
  IS: { name: { es: "Islandia", en: "Iceland" }, main: EMERGENCIAS("112"), agencies: { default: "Almannavarnir · Veðurstofa Íslands" } },
  TR: { name: { es: "Turquía", en: "Türkiye" }, main: EMERGENCIAS("112"), agencies: { default: "AFAD · Kandilli" } },
  NP: {
    name: { es: "Nepal", en: "Nepal" }, main: line("100", "Policía", "Police"),
    more: [line("101", "Bomberos", "Fire brigade"), line("102", "Ambulancia", "Ambulance")],
    agencies: { default: "NDRRMA" },
  },
  PK: {
    name: { es: "Pakistán", en: "Pakistan" }, main: line("1122", "Rescate", "Rescue"),
    more: [line("15", "Policía", "Police")],
    agencies: { default: "NDMA · PDMA Sindh" },
  },
  VN: {
    name: { es: "Vietnam", en: "Vietnam" }, main: line("114", "Bomberos y rescate", "Fire and rescue"),
    more: [line("115", "Ambulancia", "Ambulance"), line("113", "Policía", "Police")],
    agencies: { default: "VDDMA" },
  },
  AU: {
    name: { es: "Australia", en: "Australia" }, main: EMERGENCIAS("000"),
    more: [line("132 500", "SES (inundaciones y tormentas)", "SES (floods and storms)")],
    agencies: { default: "NSW SES · NSW RFS", wildfire: "NSW Rural Fire Service" },
  },
  AQ: {
    name: { es: "Antártida", en: "Antarctica" }, main: EMERGENCIAS("—"),
    agencies: { default: "Programas antárticos nacionales" },
    note: { es: "Sin población permanente: las emergencias se atienden desde cada estación científica.", en: "No permanent population: emergencies are handled by each research station." },
  },
};

/** País de cada zona (las de Colombia ya lo traen en los datos). */
const ZONE_COUNTRY: Record<string, string> = {
  "cdmx-subsidencia": "MX", "sylhet-inundacion": "BD", "jakobshavn-glaciar": "GL", "rondonia-deforestacion": "BR",
  jakarta: "ID", "central-valley": "US", tehran: "IR", kilauea: "US", "campi-flegrei": "IT", reykjanes: "IS",
  kahramanmaras: "TR", nepal: "NP", indus: "PK", mekong: "VN", thwaites: "AQ", para: "BR", nsw: "AU", "british-columbia": "CA",
};

export function countryOf(zone: Pick<RiskZone, "id" | "country">) {
  return zone.country ?? ZONE_COUNTRY[zone.id] ?? null;
}

export type EmergencyInfo = {
  country: string;
  countryName: string;
  /** Primera línea a marcar para esta amenaza. */
  first: EmergencyLine;
  /** Resto de líneas útiles (sin repetir). */
  others: EmergencyLine[];
  agencies: string;
  note?: string;
  callable: boolean;
};

/** Qué marcar en esta zona: la línea de la amenaza primero, luego la general y las demás. */
export function emergencyFor(zone: Pick<RiskZone, "id" | "country" | "kind">, lang: "es" | "en"): EmergencyInfo | null {
  const code = countryOf(zone);
  const info = code ? COUNTRIES[code] : null;
  if (!code || !info) return null;
  const special = info.byKind?.[zone.kind] ?? [];
  const ordered = [...special, info.main, ...(info.more ?? [])];
  // la amenaza con línea propia (incendio, denuncia ambiental) la pone primero; sin números repetidos
  const seen = new Set<string>();
  const unique = ordered.filter((l) => {
    if (seen.has(l.n)) return false;
    seen.add(l.n);
    return true;
  });
  const [first, ...rest] = unique;
  return {
    country: code,
    countryName: info.name[lang],
    first,
    others: rest.slice(0, 3),
    agencies: info.agencies[zone.kind] ?? info.agencies.default ?? "",
    note: info.note?.[lang],
    callable: /\d/.test(first.n),
  };
}

/** Para enlazar con tel: (sin espacios ni guiones). */
export const telHref = (n: string) => `tel:${n.replace(/[^\d+*]/g, "")}`;
