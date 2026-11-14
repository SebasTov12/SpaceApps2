"use client";

import { useState } from "react";
import { demoMetrics, demoObservations } from "@/lib/demo-dashboard";
import {
  Activity, ArrowDownRight, ArrowUpRight, CalendarDays, ChevronDown,
  ChevronRight, CloudRain, Layers3, LocateFixed, MapPin, Menu, Mountain,
  Satellite, Search, SlidersHorizontal, Users, X,
} from "lucide-react";

const initialLayers = { displacement: true, rainfall: false, slope: false };

export default function ExplorerDashboard() {
  const [layers, setLayers] = useState(initialLayers);
  const [dateIndex, setDateIndex] = useState(3);
  const [mobilePanel, setMobilePanel] = useState(false);
  const activeObservation = demoObservations[dateIndex];
  const dateLabels = demoObservations.map((observation) => observation.label);
  const formattedDate = new Intl.DateTimeFormat("es-CO", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
  }).format(new Date(activeObservation.date));
  const metricIcons = [<Activity key="activity" size={17} />, <Mountain key="mountain" size={17} />, <Users key="users" size={17} />];
  const toggleLayer = (key: keyof typeof initialLayers) =>
    setLayers((current) => ({ ...current, [key]: !current[key] }));

  return (
    <section className="explorer-section" id="explorador">
      <header className="app-header">
        <a className="brand" href="#inicio"><span className="brand-mark"><Satellite size={17} /></span><span>TOBARU <i>WORKTEAM</i></span></a>
        <div className="header-center"><span className="live-dot" /> ENTORNO DE DEMOSTRACIÓN</div>
        <div className="header-actions"><button className="header-icon" aria-label="Buscar"><Search size={17} /></button><button className="avatar">TW</button><button className="mobile-menu" onClick={() => setMobilePanel(!mobilePanel)} aria-label="Abrir filtros">{mobilePanel ? <X size={18} /> : <Menu size={18} />}</button></div>
      </header>

      <div className="explorer-layout">
        <aside className={`side-panel ${mobilePanel ? "side-panel-open" : ""}`}>
          <div className="panel-heading">
            <div><p className="eyebrow">ÁREA DE ANÁLISIS</p><h2>Explorador</h2></div>
            <button className="quiet-icon" aria-label="Ajustes"><SlidersHorizontal size={16} /></button>
          </div>
          <button className="area-select"><span className="area-icon"><MapPin size={17} /></span><span><small>REGIÓN SELECCIONADA</small><strong>Zona piloto <em>· por definir</em></strong></span><ChevronDown size={15} /></button>
          <div className="panel-divider" />
          <div className="section-label"><span>CAPAS DEL MAPA</span><Layers3 size={15} /></div>
          <LayerToggle active={layers.displacement} onClick={() => toggleLayer("displacement")} icon={<Activity size={16} />} title="Movimiento del terreno" detail="NISAR · demostración" color="cyan" />
          <LayerToggle active={layers.rainfall} onClick={() => toggleLayer("rainfall")} icon={<CloudRain size={16} />} title="Precipitación" detail="Fuente pendiente" color="blue" />
          <LayerToggle active={layers.slope} onClick={() => toggleLayer("slope")} icon={<Mountain size={16} />} title="Pendiente del terreno" detail="Fuente pendiente" color="amber" />
          <div className="panel-divider" />
          <div className="section-label"><span>FECHA DE OBSERVACIÓN</span><CalendarDays size={15} /></div>
          <button className="date-select"><span>{formattedDate}</span><ChevronDown size={15} /></button>
          <div className="date-note">Fechas simuladas para la propuesta visual</div>
          <div className="panel-divider" />
          <div className="source-card"><span className="source-icon"><Satellite size={17} /></span><div><strong>Fuente del análisis</strong><p>NISAR · producto por confirmar</p></div><ChevronRight size={14} /></div>
          <div className="side-foot"><span className="demo-dot" /> Los datos de esta vista son de demostración.</div>
        </aside>

        <main className="dashboard-main">
          <div className="dashboard-title-row">
            <div><div className="breadcrumb">TOBARU <ChevronRight size={12} /> EXPLORADOR</div><h1>Panorama territorial</h1><p>Explora observaciones y contexto del área seleccionada.</p></div>
            <button className="outline-button"><LocateFixed size={15} /> Centrar mapa</button>
          </div>

          <div className="metrics-grid">
            {demoMetrics.map((metric, index) => <MetricCard key={metric.id} label={metric.label} value={metric.value} suffix={metric.unit} trend={metric.context} icon={metricIcons[index]} accent={metric.accent} />)}
          </div>

          <section className="map-card" aria-label="Mapa de demostración">
            <div className="map-topline"><div className="map-place"><MapPin size={14} /><span>Región piloto <i>· ubicación por definir</i></span></div><div className="map-tools"><span className="map-demo"><span className="demo-dot" /> MAPA DEMO</span><button aria-label="Capas"><Layers3 size={16} /></button><button aria-label="Pantalla completa">⛶</button></div></div>
            <div className={`map-visual ${layers.rainfall ? "show-rainfall" : ""} ${layers.slope ? "show-slope" : ""}`}>
              <div className="map-grid" />
              <svg className="terrain-lines" viewBox="0 0 1100 580" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
                <path d="M-30 385C80 330 150 417 234 340S371 224 456 294 585 422 687 339 811 205 912 267s142 139 228 73" />
                <path d="M-18 419c102-61 179 21 273-53s151-117 222-57 124 119 215 55 133-130 227-83 150 101 228 35" />
                <path d="M-42 343c121-42 176 51 255-24s166-176 257-109 107 174 207 107 142-160 250-112 137 121 227 52" />
                <path d="M-28 466c112-78 189 7 298-65s139-100 206-50 149 130 239 67 129-103 212-66 130 86 209 16" />
                <path d="M-5 289c100-13 171 68 255-17s153-177 248-140 111 144 193 100 158-181 271-140 143 92 234 45" />
                <path d="M67 580c-6-97 76-109 59-201s-54-117 8-194 51-126 29-205M212 580c44-91 11-132 52-199s98-88 67-172 17-122 78-209M523 580c-41-85 27-138 20-205s-63-121-21-198 101-103 69-177M834 580c-49-99 34-157 16-229s-70-115-12-177 92-98 67-172" />
              </svg>
              <svg className="river-line" viewBox="0 0 1000 500" preserveAspectRatio="none" aria-hidden="true"><path d="M0 232c126-82 159 64 276-8 119-74 121 63 236 0s119-92 224-18 142 40 264-35" /></svg>
              {layers.rainfall && <div className="rainfall-overlay" />}
              {layers.slope && <div className="slope-overlay" />}
              {layers.displacement && <div className="change-zone zone-one"><i /><span>CAMBIO OBSERVADO</span></div>}
              {layers.displacement && <div className="change-zone zone-two"><i /><span>SEÑAL DEMO</span></div>}
              <div className="map-label label-one"><span>01</span> LADERA NORTE</div><div className="map-label label-two"><span>02</span> CUENCA ALTA</div><div className="map-label label-three">RÍO PRINCIPAL</div>
              <div className="map-compass">N <span>↑</span></div>
              <div className="map-scale"><i /> 0 <span>2 km</span></div>
              <div className="map-crosshair">+</div>
              <div className="map-legend"><strong>CAMBIO OBSERVADO</strong><span><i className="legend-low" /> señal demo</span><span><i className="legend-mid" /> punto seleccionado</span></div>
              <div className="map-disclaimer">Visualización ilustrativa · sin datos geográficos reales</div>
            </div>
            <div className="timeline">
              <div className="timeline-heading"><div><strong>Serie temporal</strong><span>Fechas simuladas · no representan la frecuencia real de NISAR</span></div><span className="timeline-current">{activeObservation.label} · {activeObservation.date.slice(0, 4)}</span></div>
              <div className="timeline-track"><input aria-label="Seleccionar fecha de observación" type="range" min="0" max="5" value={dateIndex} onChange={(event) => setDateIndex(Number(event.target.value))} style={{ "--range-progress": `${(dateIndex / 5) * 100}%` } as React.CSSProperties} /><div className="timeline-labels">{dateLabels.map((date, index) => <button key={date} className={index === dateIndex ? "is-current" : ""} onClick={() => setDateIndex(index)}>{date}</button>)}</div></div>
            </div>
          </section>

          <div className="below-grid">
            <section className="detail-card"><div className="card-heading"><div><p className="eyebrow">DETALLE DE LA OBSERVACIÓN</p><h2>Ladera norte</h2></div><button className="quiet-icon" aria-label="Más detalles"><ArrowDownRight size={17} /></button></div><div className="observation-value"><strong>+ {activeObservation.value.toFixed(1)}</strong><span>{activeObservation.unit}</span><span className="observation-badge"><ArrowUpRight size={13} /> cambio observado</span></div><p className="detail-copy">Valor ilustrativo para mostrar el diseño. La unidad, el método y los umbrales se definirán según el producto y la validación.</p><div className="detail-meta"><span>FUENTE <b>{activeObservation.source}</b></span><span>FECHA <b>{activeObservation.label} {activeObservation.date.slice(0, 4)}</b></span></div></section>
            <section className="review-card"><div className="review-icon"><Activity size={17} /></div><p className="eyebrow">ESTADO DE LA EVIDENCIA</p><h2>Revisión requerida</h2><p>Una variación observada necesita contexto y validación local. No es una alerta ni predice por sí sola un deslizamiento.</p><button className="text-link">Ver metodología <ChevronRight size={14} /></button></section>
          </div>
          <footer className="app-footer"><span>TOBARU WORKTEAM <i>· PROTOTIPO VISUAL</i></span><span>DATOS SIMULADOS PARA DEMOSTRACIÓN</span></footer>
        </main>
      </div>
    </section>
  );
}

function LayerToggle({ active, onClick, icon, title, detail, color }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; detail: string; color: string }) {
  return <button className="layer-toggle" onClick={onClick} aria-pressed={active}><span className={`layer-icon ${color}`}>{icon}</span><span className="layer-copy"><strong>{title}</strong><small>{detail}</small></span><span className={`switch ${active ? "switch-on" : ""}`}><i /></span></button>;
}

function MetricCard({ label, value, suffix, trend, icon, accent }: { label: string; value: string; suffix: string; trend: string; icon: React.ReactNode; accent: string }) {
  return <article className="metric-card"><div className={`metric-icon ${accent}`}>{icon}</div><p>{label}</p><div className="metric-number"><strong>{value}</strong><span>{suffix}</span></div><span className="metric-trend">{trend}</span></article>;
}
