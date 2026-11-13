"use client";

import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform, type MotionValue } from "framer-motion";
import { ArrowDown, ArrowRight } from "lucide-react";
import Image from "next/image";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui";
import GlobeCanvas, { type GlobeState, type GlobeTarget } from "./globe-canvas";

/** Zona piloto ilustrativa (por definir con especialistas). */
const TARGET: GlobeTarget = { lat: 7.88, lon: -72.5 };

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const wrapDegrees = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

/**
 * Coreografía del globo según el progreso del scroll (0–1):
 *  0.00–0.16  la Tierra gira a la derecha mientras se presenta TENUA
 *  0.16–0.38  gira hasta Colombia, se centra y aparece la franja de NISAR
 *  0.44–0.68  zoom hasta la zona piloto con retícula y anillos
 *  0.68–0.92  interferograma ilustrativo
 */
function choreograph(p: number, time: number, width: number, height: number): GlobeState {
  const mobile = width < 1024; // por debajo de 1024 px el texto va arriba y el globo abajo
  const half = Math.min(width, height) / 2;
  const range = (a: number, b: number) => easeInOut(clamp01((p - a) / (b - a)));

  const turn = range(0.14, 0.38);
  const zoom = range(0.44, 0.68);
  const push = range(0.68, 0.92);

  const autoLon = 20 - time * 2.4;
  const autoLat = 16;
  const lon = autoLon + wrapDegrees(TARGET.lon - autoLon) * turn;
  const lat = lerp(autoLat, TARGET.lat, turn);

  const r1 = half * (mobile ? 0.82 : 0.86);
  const r2 = half * (mobile ? 0.9 : 0.92);
  const r3 = half * 11;
  const r4 = half * 17;
  let radius = lerp(r1, r2, turn);
  radius *= Math.pow(r3 / r2, zoom);
  radius *= Math.pow(r4 / r3, push);

  const start = mobile ? { x: 0.5, y: 0.74 } : { x: 0.7, y: 0.53 };
  const middle = mobile ? { x: 0.5, y: 0.36 } : { x: 0.63, y: 0.5 };
  const close = mobile ? { x: 0.5, y: 0.33 } : { x: 0.64, y: 0.5 };
  const centerX = lerp(lerp(start.x, middle.x, turn), close.x, zoom) * width;
  const centerY = lerp(lerp(start.y, middle.y, turn), close.y, zoom) * height;

  return {
    centerX,
    centerY,
    radius,
    lon,
    lat,
    swath: range(0.26, 0.38) * (1 - range(0.6, 0.7)),
    grid: range(0.2, 0.34) * 0.8 * (1 - range(0.62, 0.72)),
    gridFine: range(0.52, 0.64),
    ring: range(0.52, 0.62),
    fringe: range(0.7, 0.8),
    clouds: 1 - range(0.4, 0.54),
    halo: 1 - range(0.46, 0.56),
  };
}

const chapters = [
  { id: "inicio", label: "Inicio" },
  { id: "satelite", label: "El satélite" },
  { id: "zona", label: "Zona piloto" },
  { id: "senal", label: "La señal" },
];
const chapterStarts = [0, 0.2, 0.44, 0.7];

/** Panel que entra y sale según un tramo del scroll. */
function Chapter({ progress, range, className, children }: { progress: MotionValue<number>; range: [number, number, number, number]; className?: string; children: ReactNode }) {
  const opacity = useTransform(progress, range, [0, 1, 1, 0]);
  const y = useTransform(progress, range, [60, 0, 0, -60]);
  const filter = useTransform(progress, range, ["blur(10px)", "blur(0px)", "blur(0px)", "blur(10px)"]);
  const pointerEvents = useTransform(opacity, (value) => (value > 0.5 ? "auto" : "none"));
  return (
    <motion.article className={`journey-panel ${className ?? ""}`} style={{ opacity, y, filter, pointerEvents }}>
      {children}
    </motion.article>
  );
}

const introEase = [0.22, 1, 0.36, 1] as const;

export default function GlobeJourney() {
  const section = useRef<HTMLElement>(null);
  const reduce = useReducedMotion() ?? false;
  const { scrollYProgress } = useScroll({ target: section, offset: ["start start", "end end"] });
  const smooth = useRef(0);
  const [active, setActive] = useState(0);

  useMotionValueEvent(scrollYProgress, "change", (value) => {
    const index = chapterStarts.findLastIndex((start) => value >= start - 0.02);
    setActive(Math.max(0, index));
  });

  // El globo sigue al scroll con inercia para que el zoom se sienta fluido
  const getState = useCallback((time: number, width: number, height: number) => {
    const target = scrollYProgress.get();
    smooth.current += (target - smooth.current) * (reduce ? 1 : 0.09);
    return choreograph(smooth.current, time, width, height);
  }, [scrollYProgress, reduce]);

  // Intro: visible al cargar, sale al empezar el scroll
  const introOpacity = useTransform(scrollYProgress, [0, 0.1, 0.16], [1, 1, 0]);
  const introY = useTransform(scrollYProgress, [0, 0.16], [0, -80]);
  const introBlur = useTransform(scrollYProgress, [0.08, 0.16], ["blur(0px)", "blur(10px)"]);
  const cueOpacity = useTransform(scrollYProgress, [0, 0.05], [1, 0]);

  // Satélite NISAR: baja, emite su haz y se aleja cuando empieza el zoom
  const satOpacity = useTransform(scrollYProgress, [0.18, 0.26, 0.44, 0.52], [0, 1, 1, 0]);
  const satY = useTransform(scrollYProgress, [0.18, 0.3, 0.44, 0.54], ["-30vh", "0vh", "0vh", "-45vh"]);
  const satX = useTransform(scrollYProgress, [0.18, 0.54], ["8vw", "-6vw"]);
  const satScale = useTransform(scrollYProgress, [0.18, 0.3, 0.54], [0.7, 1, 1.25]);
  const beamOpacity = useTransform(scrollYProgress, [0.27, 0.33, 0.42, 0.46], [0, 1, 1, 0]);

  // Viñeta que da profundidad durante el zoom
  const vignette = useTransform(scrollYProgress, [0.46, 0.62, 0.95, 1], [0, 1, 1, 0.4]);
  const railProgress = useTransform(scrollYProgress, [0, 0.95], [0, 1]);

  return (
    <section ref={section} className="journey" id="recorrido" aria-label="Recorrido: de la órbita a la zona piloto">
      <div className="journey-stage">
        <div className="journey-backdrop" aria-hidden="true" />
        <GlobeCanvas target={TARGET} getState={getState} reduceMotion={reduce} />
        <motion.div className="journey-vignette" style={{ opacity: vignette }} aria-hidden="true" />

        <motion.div className="journey-satellite" style={{ opacity: satOpacity, x: satX, y: satY, scale: satScale }} aria-hidden="true">
          <motion.div className="satellite-beam" style={{ opacity: beamOpacity }} />
          <Image src="/nisar-side-tilt.png" alt="" width={2500} height={2160} sizes="220px" className="satellite-image" />
        </motion.div>

        {/* 0 · Presentación */}
        <motion.div className="journey-intro" style={{ opacity: introOpacity, y: introY, filter: introBlur }} initial="hidden" animate="show">
          <motion.p className="eyebrow" variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: introEase, delay: 0.1 } } }}>
            NASA SPACE APPS · RETO NISAR
          </motion.p>
          <h1>
            {["La Tierra", "en movimiento."].map((line, index) => (
              <span className="intro-line" key={line}>
                <motion.span
                  className={index === 1 ? "text-gradient" : undefined}
                  variants={{ hidden: { y: "110%" }, show: { y: "0%", transition: { duration: 1.1, ease: introEase, delay: 0.25 + index * 0.14 } } }}
                >
                  {line}
                </motion.span>
              </span>
            ))}
          </h1>
          <motion.p className="intro-lead" variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.9, ease: introEase, delay: 0.65 } } }}>
            TENUA traduce las observaciones del radar NISAR en información clara: qué cambió en el terreno, a quién podría afectar y qué hacer primero.
          </motion.p>
          <motion.div className="intro-actions" variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.9, ease: introEase, delay: 0.8 } } }}>
            <a className="ui-button ui-button--primary" href="#satelite-ancla">Iniciar recorrido <ArrowDown size={16} /></a>
            <a className="ui-button ui-button--outline" href="#explorador">Ir al explorador</a>
          </motion.div>
        </motion.div>

        {/* 1 · El satélite */}
        <Chapter progress={scrollYProgress} range={[0.2, 0.26, 0.38, 0.43]}>
          <p className="eyebrow">01 · EL SATÉLITE</p>
          <h2>NISAR mira la Tierra cada 12 días</h2>
          <p>Su radar de apertura sintética ve a través de las nubes, de día y de noche, y registra movimientos del terreno de apenas centímetros.</p>
          <dl className="stat-grid">
            <div><dt>Altitud</dt><dd>747 km</dd></div>
            <div><dt>Radar</dt><dd>Bandas L + S</dd></div>
            <div><dt>Franja</dt><dd>242 km</dd></div>
            <div><dt>Revisita</dt><dd>12 días</dd></div>
          </dl>
          <p className="panel-source">Fuente: NASA/JPL · ISRO. La franja azul sobre el globo representa una pasada del radar.</p>
        </Chapter>

        {/* 2 · Zona piloto */}
        <Chapter progress={scrollYProgress} range={[0.45, 0.51, 0.64, 0.69]}>
          <p className="eyebrow">02 · ZONA PILOTO</p>
          <h2>Acercamos la mirada al territorio</h2>
          <p>El piloto se concentra en una región y una amenaza: deslizamientos. La ubicación exacta se definirá con especialistas y autoridades locales.</p>
          <dl className="meta-list">
            <div><dt>Coordenadas</dt><dd>7°53′ N · 72°30′ W</dd></div>
            <div><dt>Amenaza</dt><dd>Deslizamientos</dd></div>
            <div><dt>Área de análisis</dt><dd>48.2 km² <Badge tone="demo">Demo</Badge></dd></div>
          </dl>
        </Chapter>

        {/* 3 · La señal */}
        <Chapter progress={scrollYProgress} range={[0.71, 0.77, 0.94, 0.99]}>
          <p className="eyebrow">03 · LA SEÑAL</p>
          <h2>Cada franja de color es movimiento</h2>
          <p>Un interferograma compara dos pasadas del radar. Cada ciclo completo de color equivale a unos 12 cm de desplazamiento en la línea de vista del satélite (banda L).</p>
          <div className="fringe-legend" aria-label="Escala del interferograma: un ciclo de color equivale a unos 12 centímetros">
            <span className="fringe-bar" />
            <div><span>0</span><span>1 ciclo ≈ 12 cm</span></div>
          </div>
          <div className="panel-footer">
            <Badge tone="demo">Ilustración demo</Badge>
            <a className="ui-button ui-button--primary" href="#explorador">Explorar los datos <ArrowRight size={16} /></a>
          </div>
        </Chapter>

        <motion.a href="#satelite-ancla" className="journey-cue" style={{ opacity: cueOpacity }}>
          <span>Desliza para acercarte</span>
          <span className="cue-mouse" aria-hidden="true"><i /></span>
        </motion.a>

        <nav className="journey-rail" aria-label="Capítulos del recorrido">
          <div className="rail-track"><motion.span className="rail-fill" style={{ scaleY: railProgress }} /></div>
          <ol>
            {chapters.map((chapter, index) => (
              <li key={chapter.id} className={index === active ? "is-active" : index < active ? "is-done" : undefined}>
                <span className="rail-dot" />
                <span className="rail-label">{chapter.label}</span>
              </li>
            ))}
          </ol>
        </nav>
      </div>
      {/* ancla para "Iniciar recorrido": cae en el capítulo del satélite */}
      <span id="satelite-ancla" className="journey-anchor" aria-hidden="true" />
    </section>
  );
}
