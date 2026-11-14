export default function Loading() {
  return (
    <main className="route-state" aria-busy="true" aria-live="polite">
      <div className="route-state-orbit" aria-hidden="true"><span /></div>
      <div className="route-state-copy">
        <span className="state-kicker">INICIALIZANDO VISUALIZACIÓN</span>
        <strong>Cargando la observación terrestre</strong>
        <div className="state-progress"><i /></div>
      </div>
    </main>
  );
}
