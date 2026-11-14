"use client";

import { RotateCcw } from "lucide-react";
import { useEffect } from "react";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="route-state route-error" role="alert">
      <div className="route-state-copy">
        <span className="state-kicker">VISUALIZACIÓN INTERRUMPIDA</span>
        <h1>No pudimos cargar esta vista</h1>
        <p>La información del proyecto sigue intacta. Intenta volver a iniciar la visualización.</p>
        <button type="button" className="state-action" onClick={retry}>
          <RotateCcw size={17} aria-hidden="true" /> Reintentar
        </button>
      </div>
    </main>
  );
}
