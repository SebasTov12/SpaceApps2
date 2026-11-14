"use client";

import { motion, useTransform, type MotionValue } from "framer-motion";
import HeadlineTicker from "@/components/headline-ticker";
import { SarosStar } from "@/components/saros-logo";

/**
 * Cintillo de titulares sobre el planeta. Arriba al cargar; con el scroll se desvanece y
 * reaparece abajo hasta verse completo cuando el planeta llega a su posición final (0.8).
 * `progress` es el mismo progreso suavizado que mueve el planeta (earth-hero).
 */
export default function SarosHeroChrome({ progress, departure }: { progress: MotionValue<number>; departure: MotionValue<number> }) {
  const topOpacity = useTransform(progress, [0, 0.2], [1, 0]);
  const topY = useTransform(progress, [0, 0.2], [0, -14]);
  const topBlur = useTransform(progress, [0, 0.2], ["blur(0px)", "blur(4px)"]);
  const bottomOpacity = useTransform(progress, [0.42, 0.8], [0, 1]);
  const bottomY = useTransform(progress, [0.42, 0.8], [36, 0]);
  const bottomBlur = useTransform(progress, [0.42, 0.8], ["blur(6px)", "blur(0px)"]);
  const topEvents = useTransform(topOpacity, (v) => (v > 0.4 ? "auto" : "none"));
  const bottomEvents = useTransform(bottomOpacity, (v) => (v > 0.4 ? "auto" : "none"));
  const chromeOpacity = useTransform(departure, [0, 0.5], [1, 0]);

  return (
    <motion.div className="saros-chrome" style={{ opacity: chromeOpacity }}>
      <motion.div className="ticker-dock ticker-dock-top" style={{ opacity: topOpacity, y: topY, filter: topBlur, pointerEvents: topEvents }}>
        <HeadlineTicker />
      </motion.div>
      <motion.div className="ticker-dock ticker-dock-bottom" style={{ opacity: bottomOpacity, y: bottomY, filter: bottomBlur, pointerEvents: bottomEvents }}>
        <HeadlineTicker />
      </motion.div>
    </motion.div>
  );
}

/**
 * Logotipo SAROS. Al cargar se ve grande en la parte superior; con el scroll baja junto con
 * el planeta y termina detrás de él, centrado en ambos ejes y atenuado (el planeta es el protagonista).
 */
/**
 * Logotipo SAROS. Al cargar se ve nítido en la parte superior; conforme el usuario hace scroll
 * y el planeta asciende para descubrirse, el título desciende sutilmente con un suave desenfoque espacial
 * y desaparece por completo (opacidad 0), de modo que al estar completamente descubierto solo se ve el planeta.
 */
export function SarosWordmark({ progress }: { progress: MotionValue<number>; departure?: MotionValue<number> }) {
  // Acompaña el ascenso del planeta y se desvanece con suavidad antes de que el planeta se centre por completo
  const y = useTransform(progress, [0, 0.65], ["-31vh", "-6vh"]);
  const scale = useTransform(progress, [0, 0.65], [1, 0.9]);
  const opacity = useTransform(progress, [0, 0.12, 0.6], [1, 0.95, 0]);
  const filter = useTransform(progress, [0.15, 0.6], ["blur(0px)", "blur(10px)"]);

  return (
    <motion.div className="hero-wordmark" style={{ y, scale, opacity, filter }} aria-hidden="true">
      <p className="wordmark-title">
        <span>S</span>
        <span className="wm-a">A<SarosStar className="wm-star" /></span>
        <span>R</span>
        <span className="wm-o">O<SarosStar className="wm-star" /></span>
        <span>S</span>
      </p>
    </motion.div>
  );
}
