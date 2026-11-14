"use client";

import { motion, useScroll, useSpring } from "framer-motion";

/** Barra superior que indica cuánto se ha recorrido de la página. */
export default function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 24, restDelta: 0.001 });
  return <motion.div className="scroll-progress" style={{ scaleX }} aria-hidden="true" />;
}
