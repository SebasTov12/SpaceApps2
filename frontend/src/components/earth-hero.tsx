"use client";

import { motion, useScroll, useSpring, useTransform } from "framer-motion";
import { ChevronDown } from "lucide-react";
import dynamic from "next/dynamic";
import { useRef } from "react";

const EarthGlobe = dynamic(() => import("@/components/earth-globe"), {
  ssr: false,
  loading: () => <div className="earth-static" />,
});

export default function EarthHero() {
  const section = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: section,
    offset: ["start start", "end end"],
  });
  const progress = useSpring(scrollYProgress, { stiffness: 85, damping: 28, mass: 0.5 });
  const y = useTransform(progress, [0, 0.8, 1], ["48vh", "0vh", "0vh"]);
  const scale = useTransform(progress, [0, 0.8, 1], [1.48, 0.94, 0.94]);
  const rotate = useTransform(progress, [0, 1], [-4, 0]);
  const starsY = useTransform(progress, [0, 1], ["0%", "-8%"]);

  return (
    <section ref={section} id="inicio" className="earth-scroll" aria-label="La Tierra y la órbita de NISAR">
      <div className="earth-stage">
        <motion.div className="starfield" aria-hidden="true" style={{ y: starsY }} />
        <div className="space-dust" aria-hidden="true" />
        <motion.div className="earth-orbit" style={{ y, scale, rotate }}>
          <EarthGlobe progress={progress} />
        </motion.div>
        <a href="#explorador" className="scroll-cue" aria-label="Ir al explorador">
          <ChevronDown size={22} />
        </a>
      </div>
    </section>
  );
}

