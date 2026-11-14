import { Orbit } from "lucide-react";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <div className="footer-brand">
          <span className="brand">
            <span className="brand-mark"><Orbit size={18} strokeWidth={1.6} /></span>
            <span className="brand-name">TENUA</span>
          </span>
          <p>Observación terrestre con NISAR para priorizar la prevención. Prototipo de Tobaru Workteam para NASA Space Apps.</p>
        </div>
        <div className="footer-note">
          <strong>Límites del prototipo</strong>
          <p>Los datos de esta página son simulados. TENUA no reemplaza alertas oficiales, estudios de ingeniería ni decisiones de protección civil. Un cambio detectado no significa un desastre inminente.</p>
        </div>
      </div>
    </footer>
  );
}
