"use client";

import { motion } from "framer-motion";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { shortDate } from "@/lib/sites";
import { endOf, isProjected, readoutAt, strongestCell, type LiveInput } from "./live-data";
import { fringeStepFor, liveClock } from "./live-scene";

const TITLES: Record<string, { es: string; en: string }> = {
  landslide: { es: "La ladera en movimiento", en: "The hillside on the move" },
  subsidence: { es: "El suelo que se hunde", en: "The ground that sinks" },
  flood: { es: "El agua que cubre y se retira", en: "Water spreading and receding" },
  glacier: { es: "El hielo que fluye", en: "The flowing ice" },
  deforestation: { es: "El bosque que desaparece", en: "The vanishing forest" },
  mining: { es: "Huellas de minería", en: "Mining footprints" },
  volcano: { es: "El volcán que se infla", en: "The swelling volcano" },
  earthquake: { es: "Ondas del sismo", en: "Earthquake waves" },
  wildfire: { es: "El frente de fuego", en: "The fire front" },
};

/** Qué es medido y qué es ilustración en cada escena. */
const MEASURED: Record<string, { es: string; en: string }> = {
  landslide: { es: "La lámina se hunde con el desplazamiento medido en cada pase", en: "The sheet sinks with the displacement measured each pass" },
  subsidence: { es: "La lámina y la columna bajan con el hundimiento medido", en: "Sheet and column drop with the measured subsidence" },
  volcano: { es: "La lámina se infla con la deformación medida; franjas como un interferograma", en: "The sheet swells with measured deformation; interferogram-style fringes" },
  flood: { es: "El agua cubre las celdas que el radar ve como agua en cada pase", en: "Water covers the cells the radar sees as water each pass" },
  deforestation: { es: "Cada árbol cae en la celda y la fecha en que el radar vio la pérdida", en: "Each tree falls in the cell and date the radar saw the loss" },
  mining: { es: "Árboles que caen y piscinas nuevas según la señal del radar", en: "Falling trees and new pits from the radar signal" },
  glacier: { es: "El brillo de la lámina es la velocidad del hielo medida", en: "Sheet brightness is the measured ice speed" },
};
const ILLUSTRATION: Record<string, { es: string; en: string } | undefined> = {
  landslide: { es: "partículas de tierra (dirección: la pendiente)", en: "soil particles (direction: the slope)" },
  glacier: { es: "partículas de hielo (dirección: la pendiente)", en: "ice particles (direction: the slope)" },
  volcano: { es: "vapor del cráter", en: "crater steam" },
  earthquake: { es: "ondas y sacudida", en: "waves and shaking" },
  wildfire: { es: "frente de fuego y brasas", en: "fire front and embers" },
};

const STEP_SECONDS = 1.2;   // duración de cada pase al reproducir
const START_DELAY = 3400;   // ms: deja terminar el vuelo de la cámara al relieve

/** Línea de tiempo de la «Zona viva»: reproduce los pases de NISAR y la proyección a 90 días. */
export default function LiveTimeline({ input, lang }: { input: LiveInput; lang: "es" | "en" }) {
  const es = lang === "es";
  const end = endOf(input);
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const strongest = useMemo(() => (input.measured ? strongestCell(input).index : 0), [input]);
  const fringe = useMemo(() => fringeStepFor(input), [input]);
  const frame = useRef(0);

  // al entrar al relieve: empieza desde el primer pase cuando la cámara ya llegó
  useEffect(() => {
    liveClock.t = 0;
    liveClock.end = end;
    liveClock.playing = false;
    const id = window.setTimeout(() => { liveClock.playing = true; setPlaying(true); }, START_DELAY);
    return () => { window.clearTimeout(id); liveClock.playing = false; };
  }, [input, end]);

  // reloj: avanza la escena cada cuadro; la interfaz se refresca a ~12 por segundo
  useEffect(() => {
    let last = performance.now();
    let shown = 0;
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (liveClock.playing) {
        const projecting = isProjected(input, liveClock.t);
        liveClock.t += dt / (projecting ? STEP_SECONDS * 2 : STEP_SECONDS);
        if (liveClock.t >= end) {
          if (input.measured) { liveClock.t = end; liveClock.playing = false; setPlaying(false); }
          else liveClock.t = 0; // ilustración: en bucle
        }
      }
      if (now - shown > 80) { shown = now; setT(liveClock.t); }
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [input, end]);

  const toggle = () => {
    if (!playing && liveClock.t >= end - 1e-3) liveClock.t = 0;
    liveClock.playing = !playing;
    setPlaying(!playing);
  };
  const scrub = (value: number) => {
    liveClock.t = value;
    liveClock.playing = false;
    setPlaying(false);
    setT(value);
  };

  const readout = readoutAt(input, Math.min(t, end), strongest);
  const projected = isProjected(input, t);
  const dateIndex = Math.min(input.dates.length - 1, Math.round(t));
  const title = TITLES[input.kind] ?? TITLES.landslide;
  const done = !playing && t >= end - 1e-3;

  return (
    <motion.div className="live-tl" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}>
      <div className="live-tl-head">
        <span className="live-tl-badge">{es ? "ZONA VIVA" : "LIVE ZONE"}</span>
        <strong>{title[lang]}</strong>
      </div>

      {input.measured ? (
        <>
          <div className="live-tl-row">
            <button type="button" className="live-tl-play" onClick={toggle} aria-label={playing ? (es ? "Pausar" : "Pause") : done ? (es ? "Repetir" : "Replay") : (es ? "Reproducir" : "Play")}>
              {playing ? <Pause size={15} /> : done ? <RotateCcw size={15} /> : <Play size={15} />}
            </button>
            <div className="live-tl-track">
              <input type="range" min={0} max={end} step={0.01} value={Math.min(t, end)} onChange={(e) => scrub(Number(e.target.value))}
                aria-label={es ? "Línea de tiempo de los pases de NISAR" : "NISAR passes timeline"}
                style={{ "--p": `${(Math.min(t, end) / end) * 100}%`, "--proj": input.projection ? `${((input.frames.length - 1) / end) * 100}%` : "100%" } as React.CSSProperties} />
              <div className="live-tl-ticks" aria-hidden="true">
                {input.dates.map((d, i) => <i key={d} className={i <= t ? "is-on" : undefined} style={{ left: `${(i / end) * 100}%` }} />)}
                {input.projection && <i className={`is-proj${projected ? " is-on" : ""}`} style={{ left: "100%" }} />}
              </div>
            </div>
            <span className={`live-tl-date${projected ? " is-proj" : ""}`}>
              {projected ? (es ? "+90 días · proyección" : "+90 days · projection") : `${es ? "Pase" : "Pass"} ${dateIndex + 1}/${input.dates.length} · ${shortDate(input.dates[dateIndex], lang)}`}
            </span>
          </div>
          {readout && (
            <div className="live-tl-read">
              <span>{readout.label[lang]}</span>
              <b>{readout.value}</b>
            </div>
          )}
          <div className="live-tl-keys">
            <span className="live-key is-data"><i />{input.demo ? (es ? "Datos con formato NISAR (demostración)" : "NISAR-format data (demo)") : (es ? "Medido por NISAR" : "Measured by NISAR")}: {(MEASURED[input.kind] ?? MEASURED.landslide)[lang]}</span>
            {ILLUSTRATION[input.kind] && <span className="live-key is-ill"><i />{es ? "Ilustración" : "Illustration"}: {ILLUSTRATION[input.kind]![lang]}</span>}
            {input.change === "deformation" && liveClock.exaggeration > 1 && (
              <span className="live-key is-ex">{es ? "Altura exagerada" : "Height exaggerated"} ×{liveClock.exaggeration.toLocaleString(es ? "es-CO" : "en-US")}</span>
            )}
            {fringe > 0 && <span className="live-key is-ex">{es ? "Cada vuelta de color" : "Each color cycle"} = {fringe} {input.unit}</span>}
          </div>
        </>
      ) : (
        <p className="live-tl-none">
          <span className="live-key is-ill"><i />{es ? "Ilustración" : "Illustration"}</span>{" "}
          {es
            ? "Esta zona aún no tiene datos NISAR procesados. Cuando el backend los entregue, la escena se moverá con lo medido en cada pase."
            : "This zone has no processed NISAR data yet. Once the backend delivers it, the scene will move with each pass."}
        </p>
      )}
    </motion.div>
  );
}
