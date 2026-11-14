export default function Loading() {
  return (
    <main className="route-state" aria-busy="true" aria-live="polite">
      <div className="scene-prelude" role="status">
        <span>SAROS</span>
        <i aria-hidden="true" />
        <small>Preparando la Tierra 3D</small>
      </div>
    </main>
  );
}
