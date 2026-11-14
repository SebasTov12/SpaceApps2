"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Activity, AlertTriangle, ArrowUpRight, Briefcase, CalendarDays, ChevronRight, CloudRain,
  Layers3, LocateFixed, Maximize2, MapPin, Mountain, Satellite, ShieldCheck, Sprout, Users,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { CountUp, Reveal, Stagger, StaggerItem, easeOut, trackSpotlight } from "@/components/motion/reveal";
import { Badge, Button, Provenance } from "@/components/ui";
import { demoInsights, demoMetrics, demoObservations } from "@/lib/demo-dashboard";
import type { DecisionInsight } from "@/types/territory";

const initialLayers = { displacement: true, rainfall: false, slope: false };
type LayerKey = keyof typeof initialLayers;

const layerList: { key: LayerKey; title: string; detail: string; icon: ReactNode; tone: string }[] = [
  { key: "displacement", title: "Movimiento del terreno", detail: "NISAR · demo", icon: <Activity size={16} />, tone: "tech" },
  { key: "rainfall", title: "Precipitación", detail: "Fuente pendiente", icon: <CloudRain size={16} />, tone: "sky" },
  { key: "slope", title: "Pendiente", detail: "Fuente pendiente", icon: <Mountain size={16} />, tone: "green" },
];

const metricIcons = [<Activity key="a" size={18} />, <Mountain key="m" size={18} />, <Users key="u" size={18} />];
const insightIcons: Record<DecisionInsight["id"], ReactNode> = {
  change: <Activity size={20} />,
  social: <Users size={20} />,
  economic: <Sprout size={20} />,
  action: <ShieldCheck size={20} />,
};

export default function ExplorerDashboard() {
  const [layers, setLayers] = useState(initialLayers);
  const [dateIndex, setDateIndex] = useState(3);
  const active = demoObservations[dateIndex];
  const lastIndex = demoObservations.length - 1;
  const toggleLayer = (key: LayerKey) => setLayers((current) => ({ ...current, [key]: !current[key] }));

  return (
    <section className="explorer" id="explorador" aria-labelledby="explorer-title">
      <div className="container">
        <Reveal className="section-head">
          <div>
            <p className="eyebrow">EXPLORADOR TERRITORIAL</p>
            <h2 id="explorer-title">Panorama de la <span className="text-gradient">zona piloto</span></h2>
            <p>Observaciones del terreno, exposición y acciones sugeridas en un solo lugar. Cada dato muestra su fuente, fecha y limitación.</p>
          </div>
          <div className="section-head-aside">
            <Badge tone="demo">Datos de demostración</Badge>
            <span className="region-chip"><MapPin size={15} /> Zona piloto · por definir</span>
          </div>
        </Reveal>

        <div className="explorer-grid">
          {/* Mapa: protagonista */}
          <Reveal className="panel map-panel" y={40}>
            <div className="panel-bar">
              <div className="panel-bar-title">
                <span className="icon-chip tech"><Satellite size={16} /></span>
                <div><strong>Mapa de cambios</strong><small>Colombia · ubicación demo</small></div>
              </div>
              <div className="panel-bar-tools">
                <Badge tone="demo">Mapa demo</Badge>
                <Button size="icon" variant="ghost" aria-label="Centrar mapa"><LocateFixed size={17} /></Button>
                <Button size="icon" variant="ghost" aria-label="Pantalla completa"><Maximize2 size={16} /></Button>
              </div>
            </div>

            <div className="map-stage">
              <div className="map-grid" />
              <svg className="terrain-lines" viewBox="0 0 1100 580" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
                <path d="M-30 385C80 330 150 417 234 340S371 224 456 294 585 422 687 339 811 205 912 267s142 139 228 73" />
                <path d="M-18 419c102-61 179 21 273-53s151-117 222-57 124 119 215 55 133-130 227-83 150 101 228 35" />
                <path d="M-42 343c121-42 176 51 255-24s166-176 257-109 107 174 207 107 142-160 250-112 137 121 227 52" />
                <path d="M-28 466c112-78 189 7 298-65s139-100 206-50 149 130 239 67 129-103 212-66 130 86 209 16" />
                <path d="M-5 289c100-13 171 68 255-17s153-177 248-140 111 144 193 100 158-181 271-140 143 92 234 45" />
                <path d="M67 580c-6-97 76-109 59-201s-54-117 8-194 51-126 29-205M212 580c44-91 11-132 52-199s98-88 67-172 17-122 78-209M523 580c-41-85 27-138 20-205s-63-121-21-198 101-103 69-177M834 580c-49-99 34-157 16-229s-70-115-12-177 92-98 67-172" />
              </svg>
              <svg className="river-line" viewBox="0 0 1000 500" preserveAspectRatio="none" aria-hidden="true">
                <motion.path d="M0 232c126-82 159 64 276-8 119-74 121 63 236 0s119-92 224-18 142 40 264-35" initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 2.2, ease: easeOut }} />
              </svg>

              <AnimatePresence>
                {layers.rainfall && <motion.div key="rain" className="rainfall-overlay" initial={{ opacity: 0, scale: 1.08 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.08 }} transition={{ duration: 0.6, ease: easeOut }} />}
                {layers.slope && <motion.div key="slope" className="slope-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} />}
                {layers.displacement && (
                  <motion.div key="z1" className="change-zone zone-one" initial={{ opacity: 0, scale: 0.6, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.6, y: 8 }} transition={{ type: "spring", stiffness: 260, damping: 20 }}>
                    <i className="pulse" /><span>Cambio observado</span>
                  </motion.div>
                )}
                {layers.displacement && (
                  <motion.div key="z2" className="change-zone zone-two" initial={{ opacity: 0, scale: 0.6, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.6, y: 8 }} transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.08 }}>
                    <i className="pulse" /><span>Señal demo</span>
                  </motion.div>
                )}
              </AnimatePresence>

              <span className="map-label label-one"><b>01</b> Ladera norte</span>
              <span className="map-label label-two"><b>02</b> Cuenca alta</span>
              <span className="map-label label-river">Río principal</span>

              {/* Panel flotante de capas */}
              <div className="map-float map-layers">
                <p className="float-title"><Layers3 size={14} /> Capas</p>
                {layerList.map((layer) => (
                  <button key={layer.key} className={`layer-row ${layers[layer.key] ? "is-on" : ""}`} onClick={() => toggleLayer(layer.key)} aria-pressed={layers[layer.key]}>
                    <span className={`icon-chip ${layer.tone}`}>{layer.icon}</span>
                    <span className="layer-text"><strong>{layer.title}</strong><small>{layer.detail}</small></span>
                    <span className="switch"><i /></span>
                  </button>
                ))}
              </div>

              <div className="map-float map-legend">
                <p className="float-title">Leyenda</p>
                <span><i className="dot tech" /> Cambio observado</span>
                <span><i className="dot warning" /> Señal por revisar</span>
              </div>

              <div className="map-scale" aria-hidden="true"><i /> 2 km</div>
            </div>

            <div className="timeline">
              <div className="timeline-head">
                <div>
                  <strong><CalendarDays size={15} /> Serie temporal</strong>
                  <small>Fechas simuladas · no representan la frecuencia real de NISAR</small>
                </div>
                <span className="timeline-current">{active.label} · {active.date.slice(0, 4)}</span>
              </div>
              <input
                className="timeline-range"
                aria-label="Seleccionar fecha de observación"
                type="range" min={0} max={lastIndex} value={dateIndex}
                onChange={(event) => setDateIndex(Number(event.target.value))}
                style={{ "--range-progress": `${(dateIndex / lastIndex) * 100}%` } as React.CSSProperties}
              />
              <div className="timeline-labels">
                {demoObservations.map((observation, index) => (
                  <button key={observation.id} className={index === dateIndex ? "is-current" : undefined} onClick={() => setDateIndex(index)}>{observation.label}</button>
                ))}
              </div>
            </div>
          </Reveal>

          {/* Columna lateral de paneles */}
          <Stagger className="side-stack">
            <StaggerItem className="panel lift spotlight" onPointerMove={trackSpotlight}>
              <p className="eyebrow">RESUMEN DE LA ZONA</p>
              <ul className="metric-list">
                {demoMetrics.map((metric, index) => (
                  <li key={metric.id}>
                    <span className={`icon-chip ${["tech", "green", "sky"][index]}`}>{metricIcons[index]}</span>
                    <div className="metric-text">
                      <small>{metric.label.toLowerCase()}</small>
                      <span className="metric-value"><strong><CountUp value={metric.value} /></strong> {metric.unit}</span>
                    </div>
                    <span className="metric-context">{metric.context}</span>
                  </li>
                ))}
              </ul>
            </StaggerItem>

            <StaggerItem className="panel lift spotlight" onPointerMove={trackSpotlight}>
              <div className="panel-head">
                <div><p className="eyebrow">OBSERVACIÓN SELECCIONADA</p><h3>Ladera norte</h3></div>
                <Badge tone="accent"><ArrowUpRight size={13} /> Cambio</Badge>
              </div>
              <div className="observation-value">
                <AnimatePresence mode="wait" initial={false}>
                  <motion.strong key={active.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }} transition={{ duration: 0.3, ease: easeOut }}>
                    +{active.value.toFixed(1)}
                  </motion.strong>
                </AnimatePresence>
                <span>{active.unit}</span>
              </div>
              <p className="panel-copy">Valor ilustrativo. La unidad, el método y los umbrales se definirán según el producto NISAR y la validación local.</p>
              <Provenance source={active.source} date={`${active.label} ${active.date.slice(0, 4)}`} limitation="Sin validar" />
            </StaggerItem>

            <StaggerItem className="panel panel-warning lift" >
              <div className="panel-head">
                <div><p className="eyebrow">ESTADO DE LA EVIDENCIA</p><h3>Revisión requerida</h3></div>
                <span className="icon-chip warning"><AlertTriangle size={18} /></span>
              </div>
              <p className="panel-copy">Una variación observada necesita contexto y validación local. No es una alerta ni predice por sí sola un deslizamiento.</p>
              <button className="text-link">Ver metodología <ChevronRight size={15} /></button>
            </StaggerItem>
          </Stagger>
        </div>

        {/* Resumen para decisión */}
        <Reveal className="subsection-head">
          <p className="eyebrow">RESUMEN PARA DECISIÓN</p>
          <h3>De la señal a la acción preventiva</h3>
        </Reveal>
        <Stagger className="insight-grid">
          {demoInsights.map((insight) => (
            <StaggerItem as="article" key={insight.id} className={`panel insight-card insight-${insight.id} lift spotlight`} onPointerMove={trackSpotlight}>
              <span className="insight-icon">{insightIcons[insight.id]}</span>
              <p className="eyebrow">{insight.eyebrow}</p>
              <h4>{insight.title}</h4>
              <ul>{insight.points.map((point) => <li key={point}>{point}</li>)}</ul>
              {insight.id === "action" && (
                <p className="priority"><span className="priority-dot" aria-hidden="true" /> Prioridad relativa: <strong>media</strong></p>
              )}
              <Provenance source={insight.source} date="AGO 2026" limitation={insight.limitation} />
            </StaggerItem>
          ))}
        </Stagger>

        <Reveal className="explorer-note">
          <Briefcase size={16} />
          <p>Responsable sugerido: equipo municipal de gestión del riesgo. Las recomendaciones del sistema son propuestas y se separan de las decisiones de la autoridad.</p>
        </Reveal>
      </div>
    </section>
  );
}
