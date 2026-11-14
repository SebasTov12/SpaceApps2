"use client";

import { motion, useInView, useScroll, useSpring, useTransform } from "framer-motion";
import { ChevronDown, Pause, Play } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import SpaceBackdrop from "@/components/space-backdrop";

const EarthGlobe = dynamic(() => import("@/components/earth-globe"), {
  ssr: false,
  loading: () => <div className="earth-static" />,
});

export default function EarthHero() {
  const section = useRef<HTMLElement>(null);
  // Continuous motion is intentional for this orbital scene. A local control
  // replaces the previous OS preference that silently froze both objects.
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  const inView = useInView(section, { amount: 0 });
  const playing = !paused && visible && inView;
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
    <section ref={section} id="inicio" className="earth-scroll" aria-label="La Tierra y la órbita de NISAR">
      <div className="earth-stage" data-playing={playing}>
        <motion.div className="space-backdrop" aria-hidden="true" style={{ y: starsY }}>
          <SpaceBackdrop />
        </motion.div>
        <div className="space-dust" aria-hidden="true" />
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
        <button className="scene-motion-toggle" onClick={() => setPaused((value) => !value)}
          aria-label={paused ? "Reanudar animación orbital" : "Pausar animación orbital"}
          title={paused ? "Reanudar animación orbital" : "Pausar animación orbital"}>
          {paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
        </button>
        <a href="#explorador" className="scroll-cue" aria-label="Ir al explorador">
          <ChevronDown size={22} />
        </a>
      </div>
    </section>
  );
}

