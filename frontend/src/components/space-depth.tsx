/**
 * Profundidad del espacio detrás del planeta: franja de la Vía Láctea, galaxias lejanas,
 * estrellas que titilan y estrellas fugaces ocasionales. Solo decoración (sin texto ni controles).
 */

// generador determinista: el mismo cielo en el servidor y en el navegador (sin errores de hidratación)
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const rand = rng(7);
const TWINKLES = Array.from({ length: 70 }, (_, i) => ({
  id: i,
  x: rand() * 100,
  y: rand() * 100,
  r: 0.6 + rand() * 1.3,
  delay: rand() * 6,
  dur: 2.5 + rand() * 4,
  hue: rand() > 0.82 ? "#ffd9a8" : rand() > 0.6 ? "#a8d8ff" : "#ffffff",
}));
const GALAXIES = [
  { x: 14, y: 22, w: 7, h: 2.2, rot: -24, o: 0.5 },
  { x: 86, y: 68, w: 5, h: 1.6, rot: 32, o: 0.38 },
  { x: 78, y: 14, w: 3.4, h: 1.1, rot: -8, o: 0.32 },
];

export default function SpaceDepth() {
  return (
    <div className="space-depth" aria-hidden="true">
      <div className="space-milkyway" />
      {GALAXIES.map((g, i) => (
        <span key={i} className="space-galaxy" style={{ left: `${g.x}%`, top: `${g.y}%`, width: `${g.w}vw`, height: `${g.h}vw`, rotate: `${g.rot}deg`, opacity: g.o }} />
      ))}
      <svg className="space-twinkles" viewBox="0 0 100 100" preserveAspectRatio="none">
        {TWINKLES.map((s) => (
          <circle key={s.id} cx={s.x} cy={s.y} r={s.r / 10} fill={s.hue}
            style={{ animationDelay: `${s.delay.toFixed(2)}s`, animationDuration: `${s.dur.toFixed(2)}s` }} />
        ))}
      </svg>
      <i className="space-meteor" style={{ top: "14%", left: "62%", animationDelay: "3s" }} />
      <i className="space-meteor" style={{ top: "34%", left: "18%", animationDelay: "11s" }} />
      <i className="space-meteor" style={{ top: "8%", left: "36%", animationDelay: "19s" }} />
    </div>
  );
}

/** Anillos orbitales finos alrededor del planeta (giran despacio, detrás del globo). */
export function OrbitRings() {
  return (
    <svg className="orbit-rings" viewBox="-100 -100 200 200" aria-hidden="true">
      <defs>
        <linearGradient id="ring-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#7fdcff" stopOpacity="0" />
          <stop offset=".5" stopColor="#7fdcff" stopOpacity=".55" />
          <stop offset="1" stopColor="#a78bfa" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g className="orbit-ring orbit-ring-a">
        <circle r="72" fill="none" stroke="url(#ring-fade)" strokeWidth=".25" />
        {Array.from({ length: 72 }, (_, i) => (
          <line key={i} x1="0" y1={-72} x2="0" y2={i % 6 === 0 ? -74.6 : -73.2} stroke="#7fdcff" strokeOpacity={i % 6 === 0 ? 0.5 : 0.22} strokeWidth=".22" transform={`rotate(${i * 5})`} />
        ))}
      </g>
      <g className="orbit-ring orbit-ring-b">
        <circle r="84" fill="none" stroke="#8ea8ff" strokeOpacity=".18" strokeWidth=".2" strokeDasharray="1.2 2.4" />
        <circle r="84" fill="none" stroke="url(#ring-fade)" strokeWidth=".3" strokeDasharray="40 488" />
      </g>
      <g className="orbit-ring orbit-ring-c">
        <circle r="95" fill="none" stroke="#7fdcff" strokeOpacity=".08" strokeWidth=".18" />
        <circle cx="0" cy="-95" r=".9" fill="#9fe9ff" />
      </g>
    </svg>
  );
}
