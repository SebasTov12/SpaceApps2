"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { Mountain, Satellite, ShieldCheck, Users } from "lucide-react";
import { useRef } from "react";
import { Reveal, Stagger, StaggerItem, trackSpotlight } from "@/components/motion/reveal";

const steps = [
  { icon: Satellite, title: "Observación", text: "NISAR registra cambios del terreno: deformación, humedad del suelo y retrodispersión.", tone: "sky" },
  { icon: Mountain, title: "Amenaza", text: "Los cambios se cruzan con pendiente, lluvia y geología para evaluar la amenaza.", tone: "green" },
  { icon: Users, title: "Exposición", text: "Se identifican personas, viviendas, vías y actividades económicas que podrían verse afectadas.", tone: "tech" },
  { icon: ShieldCheck, title: "Prevención", text: "Se priorizan zonas y se proponen acciones preventivas con su justificación.", tone: "mint" },
] as const;

export default function HowItWorks() {
  const section = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: section, offset: ["start end", "center center"] });
  const lineScale = useTransform(scrollYProgress, [0.15, 1], [0, 1]);

  return (
    <section ref={section} className="flow-section" id="como-funciona" aria-labelledby="flow-title">
      <Reveal className="flow-heading" once={false}>
        <p className="eyebrow">CÓMO FUNCIONA</p>
        <h2 id="flow-title">Del satélite a la <span>decisión preventiva</span></h2>
        <p>Cada paso muestra su fuente, fecha y limitaciones. TENUA no emite alertas oficiales: ayuda a priorizar dónde mirar primero.</p>
      </Reveal>

      <div className="flow-track">
        <motion.div className="flow-line" style={{ scaleX: lineScale }} aria-hidden="true" />
        <Stagger as="ol" className="flow-steps" once={false}>
          {steps.map(({ icon: Icon, title, text, tone }, index) => (
            <StaggerItem as="li" key={title} className={`flow-card lift spotlight flow-${tone}`} onPointerMove={trackSpotlight}>
              <span className="flow-index">0{index + 1}</span>
              <span className="flow-icon"><Icon size={22} strokeWidth={1.7} /></span>
              <h3>{title}</h3>
              <p>{text}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
