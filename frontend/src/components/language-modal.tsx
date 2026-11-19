"use client";

import { AnimatePresence, motion, useTransform, type MotionValue } from "framer-motion";
import { Check, Languages, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { AVAILABLE_LANGUAGES, useI18n, type LanguageOption } from "@/lib/i18n";

const languageUi: Record<string, { search: string; searchLabel: string; close: string; dialog: string; clear: string }> = {
  es: { search: "Buscar idiomas…", searchLabel: "Buscar idiomas", close: "Cerrar", dialog: "Seleccionar idioma", clear: "Limpiar" },
  en: { search: "Search languages…", searchLabel: "Search languages", close: "Close", dialog: "Select language", clear: "Clear" },
  pt: { search: "Pesquisar idiomas…", searchLabel: "Pesquisar idiomas", close: "Fechar", dialog: "Selecionar idioma", clear: "Limpar" },
  fr: { search: "Rechercher des langues…", searchLabel: "Rechercher des langues", close: "Fermer", dialog: "Choisir une langue", clear: "Effacer" },
  de: { search: "Sprachen suchen…", searchLabel: "Sprachen suchen", close: "Schließen", dialog: "Sprache auswählen", clear: "Löschen" },
  it: { search: "Cerca lingue…", searchLabel: "Cerca lingue", close: "Chiudi", dialog: "Seleziona lingua", clear: "Cancella" },
  "zh-CN": { search: "搜索语言…", searchLabel: "搜索语言", close: "关闭", dialog: "选择语言", clear: "清除" },
  ja: { search: "言語を検索…", searchLabel: "言語を検索", close: "閉じる", dialog: "言語を選択", clear: "クリア" },
  ko: { search: "언어 검색…", searchLabel: "언어 검색", close: "닫기", dialog: "언어 선택", clear: "지우기" },
  ru: { search: "Поиск языков…", searchLabel: "Поиск языков", close: "Закрыть", dialog: "Выбрать язык", clear: "Очистить" },
  ar: { search: "ابحث عن اللغات…", searchLabel: "ابحث عن اللغات", close: "إغلاق", dialog: "اختر اللغة", clear: "مسح" },
  hi: { search: "भाषाएँ खोजें…", searchLabel: "भाषाएँ खोजें", close: "बंद करें", dialog: "भाषा चुनें", clear: "साफ़ करें" },
  nl: { search: "Talen zoeken…", searchLabel: "Talen zoeken", close: "Sluiten", dialog: "Taal kiezen", clear: "Wissen" },
  pl: { search: "Szukaj języków…", searchLabel: "Szukaj języków", close: "Zamknij", dialog: "Wybierz język", clear: "Wyczyść" },
  tr: { search: "Dil ara…", searchLabel: "Dil ara", close: "Kapat", dialog: "Dil seçin", clear: "Temizle" },
  vi: { search: "Tìm ngôn ngữ…", searchLabel: "Tìm ngôn ngữ", close: "Đóng", dialog: "Chọn ngôn ngữ", clear: "Xóa" },
  id: { search: "Cari bahasa…", searchLabel: "Cari bahasa", close: "Tutup", dialog: "Pilih bahasa", clear: "Hapus" },
  uk: { search: "Пошук мов…", searchLabel: "Пошук мов", close: "Закрити", dialog: "Вибрати мову", clear: "Очистити" },
  sv: { search: "Sök språk…", searchLabel: "Sök språk", close: "Stäng", dialog: "Välj språk", clear: "Rensa" },
  no: { search: "Søk etter språk…", searchLabel: "Søk etter språk", close: "Lukk", dialog: "Velg språk", clear: "Tøm" },
  el: { search: "Αναζήτηση γλωσσών…", searchLabel: "Αναζήτηση γλωσσών", close: "Κλείσιμο", dialog: "Επιλογή γλώσσας", clear: "Εκκαθάριση" },
  he: { search: "חיפוש שפות…", searchLabel: "חיפוש שפות", close: "סגירה", dialog: "בחירת שפה", clear: "ניקוי" },
  th: { search: "ค้นหาภาษา…", searchLabel: "ค้นหาภาษา", close: "ปิด", dialog: "เลือกภาษา", clear: "ล้าง" },
  tl: { search: "Maghanap ng wika…", searchLabel: "Maghanap ng wika", close: "Isara", dialog: "Pumili ng wika", clear: "I-clear" },
};

export default function LanguageModal({ progress, mobileMode }: { progress: MotionValue<number>; mobileMode: MotionValue<boolean> }) {
  const { lang, globalLang, setGlobalLang } = useI18n();
  const ui = languageUi[globalLang] ?? languageUi[lang];
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  // En escritorio despeja el espacio del cintillo; en móvil acompaña el descubrimiento del planeta.
  const buttonY = useTransform(() => {
    const value = progress.get();
    if (!mobileMode.get()) return -42 * Math.max(0, Math.min(1, value / 0.2));
    return 0;
  });
  const buttonOpacity = useTransform(() => {
    if (!mobileMode.get()) return 1;
    return Math.max(0, Math.min(1, (progress.get() - 0.42) / 0.38));
  });
  const buttonPointerEvents = useTransform(buttonOpacity, (opacity) => opacity > 0.85 ? "auto" : "none");

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
      <motion.button
        type="button"
        className="hero-lang-btn notranslate"
        translate="no"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Idioma / Language: ${active.native}`}
        title={`Idioma / Language: ${active.native}`}
        style={{ y: buttonY, opacity: buttonOpacity, pointerEvents: buttonPointerEvents }}
      >
        <Languages size={17} />
        <span className="hero-lang-badge notranslate" translate="no">{active.code.slice(0, 2).toUpperCase()}</span>
      </motion.button>

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
              aria-label={ui.dialog}
              initial={{ opacity: 0, y: -16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10 }}
              onClick={(event) => event.stopPropagation()}
            >
              <header className="lang-head">
                <Languages className="lang-heading-icon" size={19} aria-hidden="true" />
                <button
                  type="button"
                  className="lang-close"
                  onClick={() => setOpen(false)}
                  aria-label={ui.close}
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
                  placeholder={ui.search}
                  aria-label={ui.searchLabel}
                  autoFocus={!mobileMode.get()}
                />
                {filter && (
                  <button type="button" onClick={() => setFilter("")} aria-label={ui.clear}>
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

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
