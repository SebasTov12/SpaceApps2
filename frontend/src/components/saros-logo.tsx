import { useId } from "react";

/** Estrella de cuatro puntas de la marca SAROS. */
export function SarosStar({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 0c.9 6.4 5.6 11.1 12 12-6.4.9-11.1 5.6-12 12-.9-6.4-5.6-11.1-12-12C6.4 11.1 11.1 6.4 12 0z" fill="currentColor" />
    </svg>
  );
}

/** Emblema: planeta con órbita en degradado violeta→cian y destello. */
export function SarosEmblem({ size = 34 }: { size?: number }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className="saros-emblem" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <radialGradient id={`p${id}`} cx="38%" cy="32%" r="70%">
          <stop offset="0" stopColor="#4fd1ff" />
          <stop offset=".55" stopColor="#1d4fd8" />
          <stop offset="1" stopColor="#0b1a4a" />
        </radialGradient>
        <linearGradient id={`o${id}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#8b5cf6" />
          <stop offset="1" stopColor="#00d4ff" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="17" fill={`url(#p${id})`} />
      <path d="M14 30c-3 4 0 7 2 7" fill="none" stroke="#7ee1a8" strokeWidth="2.4" strokeLinecap="round" opacity=".7" />
      <ellipse cx="32" cy="34" rx="29" ry="10" transform="rotate(-18 32 34)" fill="none" stroke={`url(#o${id})`} strokeWidth="3.2" strokeDasharray="120 20" strokeLinecap="round" />
      <path d="M52 14c.4 2.8 2.4 4.8 5.2 5.2-2.8.4-4.8 2.4-5.2 5.2-.4-2.8-2.4-4.8-5.2-5.2 2.8-.4 4.8-2.4 5.2-5.2z" fill="#e8f9ff" />
    </svg>
  );
}

/** Logo completo: emblema + "SAROS" + lema. */
export default function SarosLogo({ href = "#inicio", tagline = true, size = 34 }: { href?: string; tagline?: boolean; size?: number }) {
  return (
    <a className="saros-logo" href={href} aria-label="SAROS, inicio">
      <SarosEmblem size={size} />
      <span className="saros-word">
        <b>SAROS</b>
        {tagline && <small>OBSERVA · ANALIZA · PREVIENE</small>}
      </span>
    </a>
  );
}
