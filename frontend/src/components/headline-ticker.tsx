"use client";

import { useEffect, useState } from "react";
import { SITE_EVENT } from "@/components/explorer-dashboard";
import { SarosStar } from "@/components/saros-logo";
import { loadHeadlines, type Headline } from "@/lib/headlines";
import { useI18n } from "@/lib/i18n";

const label = {
  es: { live: "ÚLTIMA HORA", region: "Últimas actualizaciones de afectaciones", demo: "DEMO", real: "NISAR", loading: "Cargando actualizaciones…",
    severity: { alta: "ALTA", media: "MEDIA", baja: "BAJA", info: "DATO" } },
  en: { live: "BREAKING", region: "Latest impact updates", demo: "DEMO", real: "NISAR", loading: "Loading updates…",
    severity: { alta: "HIGH", media: "MEDIUM", baja: "LOW", info: "DATA" } },
};

/** Cintillo de titulares tipo noticiero con las últimas actualizaciones de afectaciones. */
export default function HeadlineTicker({ className }: { className?: string }) {
  const { lang } = useI18n();
  const l = label[lang];
  const [items, setItems] = useState<Headline[]>([]);

  useEffect(() => {
    let alive = true;
    loadHeadlines().then((list) => alive && setItems(list)).catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, []);

  const open = (siteId?: string) => {
    if (!siteId) return;
    window.dispatchEvent(new CustomEvent(SITE_EVENT, { detail: siteId }));
    document.getElementById("explorador")?.scrollIntoView({ behavior: "smooth" });
  };

  const renderItem = (item: Headline, copy: boolean) => (
    <button key={`${item.id}-${copy ? "b" : "a"}`} type="button" className="ticker-item" onClick={() => open(item.siteId)}
      tabIndex={copy ? -1 : undefined} aria-hidden={copy || undefined}>
      <b className={`ticker-sev sev-${item.severity}`}>{l.severity[item.severity]}</b>
      <span className="ticker-title">{item.title[lang]}</span>
      {item.place && <em>· {item.place[lang]}</em>}
      <small>{item.source}</small>
      <i className={item.demo ? "ticker-flag is-demo" : "ticker-flag"}>{item.demo ? l.demo : l.real}</i>
      <SarosStar size={10} className="ticker-sep" />
    </button>
  );

  // velocidad constante: la duración crece con la cantidad de titulares
  const duration = Math.max(40, items.length * 9);

  return (
    <div className={`ticker ${className ?? ""}`} role="region" aria-label={l.region}>
      <span className="ticker-label"><i aria-hidden="true" />{l.live}</span>
      <div className="ticker-viewport">
        {items.length === 0 ? <span className="ticker-loading">{l.loading}</span> : (
          <div className="ticker-track" style={{ animationDuration: `${duration}s` }}>
            {items.map((item) => renderItem(item, false))}
            {items.map((item) => renderItem(item, true))}
          </div>
        )}
      </div>
    </div>
  );
}
