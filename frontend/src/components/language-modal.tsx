"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Languages, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { AVAILABLE_LANGUAGES, useI18n, type LanguageOption } from "@/lib/i18n";

export default function LanguageModal() {
  const { lang, globalLang, setGlobalLang } = useI18n();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");

  const active = useMemo(() => {
    return (
      AVAILABLE_LANGUAGES.find((item) => item.code === globalLang) ??
      AVAILABLE_LANGUAGES.find((item) => item.code === lang) ??
      AVAILABLE_LANGUAGES[0]
    );
  }, [globalLang, lang]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return AVAILABLE_LANGUAGES;
    return AVAILABLE_LANGUAGES.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.native.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q)
    );
  }, [filter]);

  const select = (opt: LanguageOption) => {
    setGlobalLang(opt.code);
    setOpen(false);
    setFilter("");
  };

  return (
    <>
      <button
        type="button"
        className="hero-lang-btn"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Idioma / Language: ${active.native}`}
        title={`Idioma / Language: ${active.native}`}
      >
        <Languages size={17} />
        <span className="hero-lang-badge">{active.code.slice(0, 2).toUpperCase()}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="lang-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              className="lang-panel"
              role="dialog"
              aria-label="Seleccionar idioma / Select language"
              initial={{ opacity: 0, y: -16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10 }}
              onClick={(event) => event.stopPropagation()}
            >
              <header className="lang-head">
                <div className="lang-title">
                  <Languages size={18} />
                  <span>IDIOMA · LANGUAGE</span>
                </div>
                <button
                  type="button"
                  className="lang-close"
                  onClick={() => setOpen(false)}
                  aria-label="Cerrar / Close"
                >
                  <X size={17} />
                </button>
              </header>

              <div className="lang-search">
                <Search size={15} />
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Buscar idioma / Search language..."
                  aria-label="Buscar idioma"
                  autoFocus
                />
                {filter && (
                  <button type="button" onClick={() => setFilter("")} aria-label="Limpiar">
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className="lang-grid">
                {filtered.map((item) => {
                  const isCurrent = (globalLang || lang) === item.code;
                  return (
                    <button
                      key={item.code}
                      type="button"
                      className={`lang-option ${isCurrent ? "is-active" : ""}`}
                      onClick={() => select(item)}
                    >
                      <span className="lang-flag" aria-hidden="true">
                        {item.flag}
                      </span>
                      <div className="lang-info">
                        <strong>{item.native}</strong>
                        <small>{item.name}</small>
                      </div>
                      <span className="lang-code">{item.code.toUpperCase()}</span>
                      {isCurrent && <Check size={14} className="lang-check" />}
                    </button>
                  );
                })}
              </div>

              <footer className="lang-footer">
                <small>SAROS · Monitoreo Satelital Global Multilingüe</small>
              </footer>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
