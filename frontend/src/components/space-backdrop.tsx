// Seeded positions avoid a repeating wallpaper pattern and hydration changes.
const stars = Array.from({ length: 240 }, (_, index) => {
  const noise = (seed: number) => {
    // Integer hashing is identical across Node and browser JS engines.
    let value = Math.imul(seed ^ 0x9e3779b9, 0x21f0aaad);
    value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
    return ((value ^ (value >>> 15)) >>> 0) / 4294967296;
  };
  return {
    x: noise(index + 1) * 1600,
    y: noise(index + 401) * 1000,
    radius: 0.35 + noise(index + 701) ** 4 * 1.25,
    opacity: 0.15 + noise(index + 1001) * 0.55,
    color: ["#e1ebf6", "#b7cee9", "#e8dfca"][index % 3],
  };
});

export default function SpaceBackdrop() {
  return (
    <svg className="space-stars" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {stars.map((star, index) => (
        <circle key={index} cx={star.x} cy={star.y} r={star.radius} fill={star.color} opacity={star.opacity} />
      ))}
    </svg>
  );
}
