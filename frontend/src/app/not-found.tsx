import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="route-state route-error">
      <div className="route-state-copy">
        <span className="state-kicker">404 · FUERA DE COBERTURA</span>
        <h1>Esta ubicación no existe</h1>
        <p>Regresa a la visualización principal para continuar explorando.</p>
        <Link className="state-action" href="/"><ArrowLeft size={17} aria-hidden="true" /> Volver al inicio</Link>
      </div>
    </main>
  );
}
