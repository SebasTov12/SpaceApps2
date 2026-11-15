"use client";

import { useEffect, useState } from "react";
import { SITE_EVENT } from "@/components/globe/globe-state";
import { SarosStar } from "@/components/saros-logo";
import { loadHeadlines, type Headline } from "@/lib/headlines";
import { ProtectedTerms, useI18n } from "@/lib/i18n";
import { riskZones } from "@/lib/risk-zones";

const LIVE_BY_LANG: Record<string, string> = {
  es: "ÚLTIMA HORA",
  en: "BREAKING",
  pt: "ÚLTIMA HORA",
  it: "ULTIM'ORA",
  fr: "DERNIÈRE HEURE",
  de: "EILMELDUNG",
  "zh-CN": "突发快讯",
  ja: "速報",
  ko: "속보",
  ru: "ПОСЛЕДНИЙ ЧАС",
  ar: "عاجل",
  hi: "ताज़ा खबर",
  nl: "LAATSTE NIEUWS",
  pl: "NA ŻYWO",
  tr: "SON DAKİKA",
  vi: "TIN MỚI NHẤT",
  id: "TERKINI",
  uk: "ОСТАННІЙ ЧАС",
  sv: "SENASTE NYTT",
  no: "SISTE NYTT",
  el: "ΕΚΤΑΚΤΟ",
  he: "מבזק",
  th: "ข่าวด่วน",
  tl: "BALITA",
};

const label = {
  es: { live: "ÚLTIMA HORA", region: "Últimas actualizaciones de afectaciones", demo: "DEMO", real: "NISAR", loading: "Cargando actualizaciones…",
    severity: { alta: "ALTA", media: "MEDIA", baja: "BAJA", info: "DATO" } },
  en: { live: "BREAKING", region: "Latest impact updates", demo: "DEMO", real: "NISAR", loading: "Loading updates…",
    severity: { alta: "HIGH", media: "MEDIUM", baja: "LOW", info: "DATA" } },
};

/** Cintillo de titulares tipo noticiero con las últimas actualizaciones de afectaciones. */
export default function HeadlineTicker({ className }: { className?: string }) {
  const { lang, globalLang } = useI18n();
  const currentCode = globalLang || lang || "es";
  const activeLang = lang;
  const l = label[activeLang];
  const liveLabel = LIVE_BY_LANG[currentCode] || LIVE_BY_LANG[currentCode.split("-")[0]] || "ÚLTIMA HORA";
  const [items, setItems] = useState<Headline[]>([]);

  useEffect(() => {
    let alive = true;
    loadHeadlines().then((list) => alive && setItems(list)).catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, []);

  const resolveZone = (item: Headline) => {
    const byId = riskZones.find((z) => z.id === item.siteId || (item.siteId && z.siteId === item.siteId));
    if (byId) return byId.id;
    const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
    const location = item.place?.es && normalize(item.place.es);
    if (!location) return undefined;
    const matches = riskZones.filter((z) => normalize(z.place.es) === location);
    return matches.length === 1 ? matches[0].id : undefined;
  };

  const renderItem = (item: Headline, copy: boolean) => {
    const zoneId = resolveZone(item);
    return (
    <button key={`${item.id}-${copy ? "b" : "a"}-${currentCode}`} type="button" className="ticker-item" disabled={!zoneId} onClick={() => zoneId && window.dispatchEvent(new CustomEvent(SITE_EVENT, { detail: zoneId }))}
      tabIndex={copy ? -1 : undefined} aria-hidden={copy || undefined}>
      <b className={`ticker-sev sev-${item.severity}`}>{l.severity[item.severity]}</b>
      <span className="ticker-title"><ProtectedTerms text={item.title[activeLang]} /></span>
      {item.place && <em>· {item.place[activeLang]}</em>}
      <small className="notranslate" translate="no">{item.source}</small>
      <i className={item.demo ? "ticker-flag is-demo notranslate" : "ticker-flag notranslate"} translate="no">{item.demo ? l.demo : l.real}</i>
      <SarosStar size={10} className="ticker-sep" />
    </button>
  );
  };

  // velocidad constante: la duración crece con la cantidad de titulares
  const duration = Math.max(40, items.length * 9);

  return (
    <div className={`ticker ${className ?? ""}`} role="region" aria-label={l.region}>
      <span className="ticker-label">
        <i aria-hidden="true" />
        <span key={currentCode} className="ticker-label-text notranslate" translate="no">
          {liveLabel}
        </span>
      </span>
      <div className="ticker-viewport">
        {items.length === 0 ? <span className="ticker-loading">{l.loading}</span> : (
          <div key={currentCode} className="ticker-track" style={{ animationDuration: `${duration}s` }}>
            {items.map((item) => renderItem(item, false))}
            {items.map((item) => renderItem(item, true))}
          </div>
        )}
      </div>
    </div>
  );
}
