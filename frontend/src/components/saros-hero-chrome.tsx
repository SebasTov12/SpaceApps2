"use client";

import { motion, useTransform, type MotionValue } from "framer-motion";
import HeadlineTicker from "@/components/headline-ticker";
import SarosLogo, { SarosStar } from "@/components/saros-logo";
import { LanguageToggle, useI18n } from "@/lib/i18n";

const copy = {
  es: { explore: "Explorar territorio", links: [["#inicio", "Planeta"], ["#explorador", "Explorador"], ["#explorador", "Datos NISAR"]], claim: "Inteligencia satelital para un territorio", claimEm: "más seguro." },
  en: { explore: "Explore territory", links: [["#inicio", "Planet"], ["#explorador", "Explorer"], ["#explorador", "NISAR data"]], claim: "Satellite intelligence for a", claimEm: "safer territory." },
};

/**
 * Identidad SAROS sobre el hero del planeta:
 * - navbar con el cintillo de titulares debajo;
 * - logotipo gigante detrás del planeta;
 * - al hacer scroll el cintillo de arriba se desvanece y reaparece abajo cuando el planeta llega a su posición final.
 * `progress` es el mismo progreso suavizado que mueve el planeta (earth-hero).
 */
export default function SarosHeroChrome({ progress, departure }: { progress: MotionValue<number>; departure: MotionValue<number> }) {
  const { lang } = useI18n();
  const c = copy[lang];

  // Cintillo superior: se va con el inicio del desplazamiento del planeta
  const topOpacity = useTransform(progress, [0, 0.2], [1, 0]);
  const topY = useTransform(progress, [0, 0.2], [0, -14]);
  const topBlur = useTransform(progress, [0, 0.2], ["blur(0px)", "blur(4px)"]);
  // Cintillo inferior: aparece mientras el planeta sube y queda completo en su posición final (0.8)
  const bottomOpacity = useTransform(progress, [0.42, 0.8], [0, 1]);
  const bottomY = useTransform(progress, [0.42, 0.8], [36, 0]);
  const bottomBlur = useTransform(progress, [0.42, 0.8], ["blur(6px)", "blur(0px)"]);
  const topEvents = useTransform(topOpacity, (v) => (v > 0.4 ? "auto" : "none"));
  const bottomEvents = useTransform(bottomOpacity, (v) => (v > 0.4 ? "auto" : "none"));

  const chromeOpacity = useTransform(departure, [0, 0.5], [1, 0]);

  return (
    <motion.div className="saros-chrome" style={{ opacity: chromeOpacity }}>
      <header className="saros-nav">
        <SarosLogo />
        <nav aria-label="SAROS">
          {c.links.map(([href, text]) => <a key={text} href={href}>{text}</a>)}
        </nav>
        <div className="saros-nav-actions">
          <LanguageToggle />
          <a className="saros-cta" href="#explorador">{c.explore} →</a>
        </div>
      </header>

      <motion.div className="ticker-dock ticker-dock-top" style={{ opacity: topOpacity, y: topY, filter: topBlur, pointerEvents: topEvents }}>
        <HeadlineTicker />
      </motion.div>
      <motion.div className="ticker-dock ticker-dock-bottom" style={{ opacity: bottomOpacity, y: bottomY, filter: bottomBlur, pointerEvents: bottomEvents }}>
        <HeadlineTicker />
      </motion.div>
    </motion.div>
  );
}

/** Logotipo gigante SAROS que queda detrás del planeta (va antes de la Tierra en el DOM). */
export function SarosWordmark({ progress, departure }: { progress: MotionValue<number>; departure: MotionValue<number> }) {
  const { lang } = useI18n();
  const c = copy[lang];
  // retrocede suavemente mientras el planeta sube y lo cubre
  const markOpacity = useTransform(() => {
    const p = progress.get();
    const base = p < 0.55 ? 1 - (p / 0.55) * 0.4 : 0.6 - Math.min(1, (p - 0.55) / 0.3) * 0.28;
    return base * (1 - Math.min(1, departure.get() * 2));
  });
  const markScale = useTransform(progress, [0, 0.85], [1, 0.86]);
  const markY = useTransform(progress, [0, 0.85], ["0vh", "-7vh"]);
  return (
  <motion.div className="hero-wordmark" style={{ opacity: markOpacity, scale: markScale, y: markY }} aria-hidden="true">
      <svg className="wordmark-orbit" viewBox="0 0 1000 300" preserveAspectRatio="none">
        <defs>
          <linearGradient id="wm-orbit" x1="0" x2="1">
            <stop offset="0" stopColor="#8b5cf6" stopOpacity="0" />
            <stop offset=".35" stopColor="#8b5cf6" />
            <stop offset="1" stopColor="#00d4ff" />
          </linearGradient>
        </defs>
        <path d="M40 210C180 300 640 290 960 90" fill="none" stroke="url(#wm-orbit)" strokeWidth="5" strokeLinecap="round" />
      </svg>
      <p className="wordmark-title">
        <span>S</span>
        <span className="wm-a">A<SarosStar className="wm-star" /></span>
        <span>R</span>
        <span className="wm-o">O<SarosStar className="wm-star" /></span>
        <span>S</span>
      </p>
      <p className="wordmark-tagline">OBSERVA · ANALIZA · PREVIENE</p>
      <p className="wordmark-claim">{c.claim} <em>{c.claimEm}</em></p>
    </motion.div>
  );
}
