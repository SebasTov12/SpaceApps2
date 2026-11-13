"use client";

import { animate, motion, useInView, useReducedMotion, type Variants } from "framer-motion";
import { useEffect, useRef, type PointerEvent, type ReactNode } from "react";

export const easeOut = [0.22, 1, 0.36, 1] as const;

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  /** Desplazamiento inicial en px. */
  y?: number;
  /** false: el elemento se desvanece al salir de la vista y reaparece al volver. */
  once?: boolean;
};

const revealVariants = (y: number, delay: number): Variants => ({
  hidden: { opacity: 0, y, filter: "blur(8px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.8, ease: easeOut, delay } },
});

/** Aparece al entrar en pantalla (fundido + subida + desenfoque). */
export function Reveal({ children, className, delay = 0, y = 32, once = true }: RevealProps) {
  return (
    <motion.div
      className={className}
      variants={revealVariants(y, delay)}
      initial="hidden"
      whileInView="show"
      viewport={{ once, amount: 0.2 }}
    >
      {children}
    </motion.div>
  );
}

const staggerParent: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};

export const staggerChild: Variants = {
  hidden: { opacity: 0, y: 28, scale: 0.97 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.7, ease: easeOut } },
};

/** Contenedor que hace aparecer a sus hijos uno tras otro. */
export function Stagger({ children, className, once = true, as = "div" }: { children: ReactNode; className?: string; once?: boolean; as?: "div" | "ol" | "ul" }) {
  const Tag = motion[as];
  return (
    <Tag className={className} variants={staggerParent} initial="hidden" whileInView="show" viewport={{ once, amount: 0.15 }}>
      {children}
    </Tag>
  );
}

export function StaggerItem({ children, className, as = "div", ...rest }: { children: ReactNode; className?: string; as?: "div" | "article" | "li"; onPointerMove?: (event: PointerEvent<HTMLElement>) => void }) {
  const Tag = motion[as];
  return (
    <Tag className={className} variants={staggerChild} {...rest}>
      {children}
    </Tag>
  );
}

/** Cifra que cuenta desde cero al entrar en pantalla. Conserva decimales y separador de miles. */
export function CountUp({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node || !inView || reduce) return;
    const target = Number.parseFloat(value.replace(/,/g, ""));
    if (Number.isNaN(target)) return;
    const decimals = (value.split(".")[1] ?? "").length;
    const format = new Intl.NumberFormat("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    const controls = animate(0, target, {
      duration: 1.6,
      ease: easeOut,
      onUpdate: (latest) => { node.textContent = format.format(latest); },
    });
    return () => controls.stop();
  }, [inView, reduce, value]);

  return <span ref={ref}>{value}</span>;
}

/** Guarda la posición del cursor en --mx/--my para el efecto de luz de .spotlight. */
export function trackSpotlight(event: PointerEvent<HTMLElement>) {
  const target = event.currentTarget;
  const rect = target.getBoundingClientRect();
  target.style.setProperty("--mx", `${event.clientX - rect.left}px`);
  target.style.setProperty("--my", `${event.clientY - rect.top}px`);
}
