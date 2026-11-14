"use client";

import { motion, useMotionValueEvent, useScroll } from "framer-motion";
import { Orbit } from "lucide-react";
import { useState } from "react";

const links = [
  { href: "#recorrido", label: "Recorrido" },
  { href: "#como-funciona", label: "Cómo funciona" },
  { href: "#explorador", label: "Explorador" },
];

/** Navegación fija: transparente sobre el recorrido, panel de vidrio al hacer scroll. */
export default function SiteNav() {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  useMotionValueEvent(scrollY, "change", (value) => setScrolled(value > 40));

  return (
    <motion.header
      className={`site-nav ${scrolled ? "is-scrolled" : ""}`}
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="site-nav-inner">
        <a className="brand" href="#recorrido" aria-label="TENUA, inicio">
          <span className="brand-mark"><Orbit size={18} strokeWidth={1.6} /></span>
          <span className="brand-name">TENUA</span>
        </a>
        <nav className="site-links" aria-label="Secciones">
          {links.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}
        </nav>
        <a className="ui-button ui-button--primary site-cta" href="#explorador">Abrir explorador</a>
      </div>
    </motion.header>
  );
}
