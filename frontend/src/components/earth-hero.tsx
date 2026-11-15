"use client";

import { motion, useInView, useMotionValueEvent, useScroll, useSpring, useTransform } from "framer-motion";
import { GLOBE_SELECT, UI_REVEAL, globeState } from "@/components/globe/globe-state";
import dynamic from "next/dynamic";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import SpaceBackdrop from "@/components/space-backdrop";
import ZoneView from "@/components/globe/zone-view";
import HeroOverlay from "@/components/globe/hero-overlay";
import SaroGuide from "@/components/globe/saro-guide";
import SpaceDepth, { OrbitRings } from "@/components/space-depth";
import SarosHeroChrome, { SarosWordmark } from "@/components/saros-hero-chrome";
import { useI18n } from "@/lib/i18n";

const EarthGlobe = dynamic(() => import("@/components/earth-globe"), {
  ssr: false,
  loading: () => null,
});

const SCROLL_POSITION_KEY = "saros:home-scroll-y";

export default function EarthHero() {
  const { lang } = useI18n();
  const section = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(true);
  const [sceneReady, setSceneReady] = useState(false);
  const [exploreLocked, setExploreLocked] = useState(false);
  const revealScene = useCallback(() => setSceneReady(true), []);
  const inView = useInView(section, { amount: 0 });
  const playing = visible && inView;
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  useLayoutEffect(() => {
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    if (!window.location.hash) {
      try {
        const saved = Number(window.sessionStorage.getItem(SCROLL_POSITION_KEY));
        if (Number.isFinite(saved) && saved > 0) window.scrollTo({ top: saved, behavior: "instant" });
      } catch {
        // Scrolling still works if browser storage is unavailable.
      }
    }

    let saveTimer = 0;
    const savePosition = () => {
      window.clearTimeout(saveTimer);
      try { window.sessionStorage.setItem(SCROLL_POSITION_KEY, String(window.scrollY)); } catch { /* storage is optional */ }
    };
    const onScroll = () => {
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(savePosition, 140);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", savePosition);
    return () => {
      savePosition();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", savePosition);
      window.history.scrollRestoration = previousRestoration;
    };
  }, []);
  useEffect(() => {
    if (!exploreLocked) return;
    const stopWheel = (event: WheelEvent) => event.preventDefault();
    const stopScrollKeys = (event: KeyboardEvent) => {
      if (event.key === " " && (event.target as HTMLElement).closest("button, a, input, textarea, select, [contenteditable='true']")) return;
      if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) event.preventDefault();
    };
    const unlockForZone = () => setExploreLocked(false);
    window.addEventListener("wheel", stopWheel, { passive: false });
    window.addEventListener("keydown", stopScrollKeys);
    window.addEventListener(GLOBE_SELECT, unlockForZone);
    return () => {
      window.removeEventListener("wheel", stopWheel);
      window.removeEventListener("keydown", stopScrollKeys);
      window.removeEventListener(GLOBE_SELECT, unlockForZone);
    };
  }, [exploreLocked]);

  const continueToGlobe = useCallback(() => {
    if (exploreLocked) {
      setExploreLocked(false);
      return;
    }
    const element = section.current;
    if (!element) return;
    const travel = Math.max(0, element.offsetHeight - window.innerHeight);
    const target = element.getBoundingClientRect().top + window.scrollY + travel * 0.8;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: target, behavior: reducedMotion ? "instant" : "smooth" });

    const startedAt = performance.now();
    const waitForPosition = (now: number) => {
      const distance = Math.abs(window.scrollY - target);
      if (distance <= 3 || now - startedAt >= 2200) {
        if (distance <= 48) {
          setExploreLocked(true);
        }
        return;
      }
      requestAnimationFrame(waitForPosition);
    };
    requestAnimationFrame(waitForPosition);
  }, [exploreLocked]);
  const { scrollYProgress } = useScroll({
    target: section,
    offset: ["start start", "end end"],
  });
  const progress = useSpring(scrollYProgress, { stiffness: 85, damping: 28, mass: 0.5 });
  // arriba del todo solo el planeta, el título y el cintillo; al bajar aparecen puntos, barra de modos y Saru
  const setReveal = useCallback((value: number) => {
    const next = globeState.uiRevealed ? value > 0.12 : value > 0.3;
    if (next === globeState.uiRevealed) return;
    globeState.uiRevealed = next;
    window.dispatchEvent(new CustomEvent(UI_REVEAL, { detail: next }));
  }, []);
  useMotionValueEvent(scrollYProgress, "change", setReveal);
  useEffect(() => {
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      setReveal(scrollYProgress.get());
      secondFrame = requestAnimationFrame(() => setReveal(scrollYProgress.get()));
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [scrollYProgress, setReveal]);
  const { scrollYProgress: departure } = useScroll({
    target: section, offset: ["end end", "end start"],
  });
  const y = useTransform(progress, [0, 0.8, 1], ["48vh", "0vh", "0vh"]);
  const revealScale = useTransform(progress, [0, 0.8, 1], [1.48, 0.94, 0.94]);
  const scale = useTransform(() => revealScale.get() * (1 + departure.get() * 0.16));
  const opacity = useTransform(departure, [0, 0.8], [1, 0.15]);
  const bridgeOpacity = useTransform(progress, [0.5, 1], [0, 1]);
  const rotate = useTransform(progress, [0, 1], [-4, 0]);
  const starsY = useTransform(progress, [0, 1], ["0%", "-8%"]);

  return (
    <section ref={section} id="inicio" className="earth-scroll" aria-label={lang === "en" ? "SAROS: Earth and NISAR's orbit" : "SAROS: la Tierra y la órbita de NISAR"}>
      <div className="earth-stage" data-playing={playing} data-scene-ready={sceneReady} data-explore-locked={exploreLocked}>
        <motion.div className="space-backdrop" aria-hidden="true" style={{ y: starsY }}>
          <SpaceBackdrop />
        </motion.div>
        <div className="space-dust" aria-hidden="true" />
        <SpaceDepth />
        {!sceneReady && (
          <div className="scene-prelude" role="status">
            <div className="scene-loader-orb" aria-hidden="true" />
            <i aria-hidden="true" />
            <small>{lang === "en" ? "Preparing 3D Earth" : "Preparando la Tierra 3D"}</small>
          </div>
        )}
        {/* Logotipo SAROS detrás del planeta: aparece exactamente junto con el planeta al estar cargado */}
        <SarosWordmark progress={progress} departure={departure} ready={sceneReady} />
        <motion.div className="earth-orbit" style={{ y, scale, rotate, opacity }}>
          <OrbitRings />
          <div className="earth-premiere"><EarthGlobe progress={progress} playing={playing} onReady={revealScene} /></div>
        </motion.div>
        <motion.div className="explorer-bridge" style={{ opacity: bridgeOpacity }} aria-hidden="true">
          <svg viewBox="0 0 1400 260" preserveAspectRatio="none">
            <path d="M-40 170C160 40 220 255 420 130S700 70 860 170s320-130 580-40" />
            <path d="M-40 196C160 66 220 281 420 156S700 96 860 196s320-130 580-40" />
            <path d="M-40 222C160 92 220 307 420 182S700 122 860 222s320-130 580-40" />
            <path d="M-40 248C160 118 220 333 420 208S700 148 860 248s320-130 580-40" />
          </svg>
        </motion.div>
        {/* Zona elegida: acercamiento y panel con su información */}
        <ZoneView />
        {/* Saro: guía animado que explica cada zona */}
        <SaroGuide />
        {/* Último evento, cifras y buscador de zonas */}
        <HeroOverlay progress={progress} />
        {/* Cintillo de titulares (arriba → abajo con el scroll) */}
        <SarosHeroChrome progress={progress} departure={departure} />
        <button
          type="button"
          className="mobile-globe-cue"
          onClick={continueToGlobe}
          aria-pressed={exploreLocked}
          aria-label={exploreLocked
            ? (lang === "en" ? "Resume page scrolling" : "Reanudar desplazamiento de la página")
            : (lang === "en" ? "Go to the globe and hold the view" : "Ir al planeta y fijar la vista")}
          title={exploreLocked
            ? (lang === "en" ? "Resume scrolling" : "Reanudar desplazamiento")
            : (lang === "en" ? "Tap to continue" : "Pulsa aquí para continuar")}
        >
          <span>{exploreLocked
            ? (lang === "en" ? "Resume scrolling" : "Reanudar desplazamiento")
            : (lang === "en" ? "Tap to continue" : "Pulsa aquí para continuar")}</span>
          {exploreLocked ? <ArrowUp size={16} aria-hidden="true" /> : <ArrowDown size={16} aria-hidden="true" />}
        </button>
      </div>
    </section>
  );
}

