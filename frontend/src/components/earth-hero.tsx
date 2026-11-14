"use client";

import { motion, useInView, useScroll, useSpring, useTransform } from "framer-motion";
import { ChevronDown } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import SpaceBackdrop from "@/components/space-backdrop";
import ZoneView from "@/components/globe/zone-view";
import HeroOverlay from "@/components/globe/hero-overlay";
import SarosHeroChrome, { SarosWordmark } from "@/components/saros-hero-chrome";

const EarthGlobe = dynamic(() => import("@/components/earth-globe"), {
  ssr: false,
  loading: () => <div className="earth-static" />,
});

export default function EarthHero() {
  const section = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(true);
  const inView = useInView(section, { amount: 0 });
  const playing = visible && inView;
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  const { scrollYProgress } = useScroll({
    target: section,
    offset: ["start start", "end end"],
  });
  const progress = useSpring(scrollYProgress, { stiffness: 85, damping: 28, mass: 0.5 });
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
    <section ref={section} id="inicio" className="earth-scroll" aria-label="SAROS: la Tierra y la órbita de NISAR">
      <div className="earth-stage" data-playing={playing}>
        <motion.div className="space-backdrop" aria-hidden="true" style={{ y: starsY }}>
          <SpaceBackdrop />
        </motion.div>
        <div className="space-dust" aria-hidden="true" />
        {/* Logotipo SAROS detrás del planeta */}
        <SarosWordmark progress={progress} departure={departure} />
        <motion.div className="earth-orbit" style={{ y, scale, rotate, opacity }}>
          <EarthGlobe progress={progress} playing={playing} />
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
        {/* Último evento, cifras y buscador de zonas */}
        <HeroOverlay progress={progress} />
        {/* Cintillo de titulares (arriba → abajo con el scroll) */}
        <SarosHeroChrome progress={progress} departure={departure} />
        <a href="#zonas" className="scroll-cue" aria-label="Bajar hasta el planeta"
          onClick={(event) => {
            event.preventDefault();
            const hero = section.current;
            if (hero) window.scrollTo({ top: hero.offsetTop + (hero.offsetHeight - window.innerHeight) * 0.92, behavior: "smooth" });
          }}>
          <ChevronDown size={22} />
        </a>
      </div>
    </section>
  );
}

