"use client";

import { useI18n } from "@/lib/i18n";
import { shortDate } from "@/lib/sites";

type TimeSeriesChartProps = {
  dates: string[];
  values: (number | null)[];
  unit: string;
  activeIndex: number;
  onSelect: (index: number) => void;
};

const W = 520;
const H = 190;
const PAD = { top: 18, right: 16, bottom: 30, left: 46 };

/** Serie temporal del punto seleccionado, en SVG para no añadir dependencias. */
export default function TimeSeriesChart({ dates, values, unit, activeIndex, onSelect }: TimeSeriesChartProps) {
  const { lang, t } = useI18n();
  const sd = (iso: string) => shortDate(iso, lang);
  const valid = values.filter((value): value is number => value !== null);
  if (valid.length < 2) {
    return <p className="chart-empty">{t.chartEmpty}</p>;
  }
  let min = Math.min(...valid, 0);
  let max = Math.max(...valid, 0);
  if (max - min < 1e-6) {
    max += 1;
    min -= 1;
  }
  const margin = (max - min) * 0.12;
  min -= margin;
  max += margin;
  const x = (i: number) => PAD.left + (i / (dates.length - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - min) / (max - min)) * (H - PAD.top - PAD.bottom);
  const points = values.map((v, i) => (v === null ? null : [x(i), y(v)] as const)).filter(Boolean) as (readonly [number, number])[];
  const line = points.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");
  const area = `${line} L${points[points.length - 1][0].toFixed(1)} ${y(Math.max(min, Math.min(0, max)))} L${points[0][0].toFixed(1)} ${y(Math.max(min, Math.min(0, max)))} Z`;
  const ticks = [min + margin, (min + max) / 2, max - margin];

  return (
    <svg className="ts-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${t.chartLabel(unit)}: ${values.map((v, i) => `${sd(dates[i])} ${v ?? t.noValue}`).join(", ")}`}>
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} className="ts-grid" />
          <text x={PAD.left - 8} y={y(tick) + 4} className="ts-tick" textAnchor="end">{tick.toFixed(Math.abs(max - min) < 10 ? 1 : 0)}</text>
        </g>
      ))}
      {min < 0 && max > 0 && <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} className="ts-zero" />}
      <path d={area} className="ts-area" />
      <path d={line} className="ts-line" />
      {values.map((v, i) => v !== null && (
        <g key={dates[i]} className={`ts-point ${i === activeIndex ? "is-active" : ""}`} onClick={() => onSelect(i)}>
          <circle cx={x(i)} cy={y(v)} r={i === activeIndex ? 6 : 4} />
          <rect x={x(i) - 14} y={PAD.top} width={28} height={H - PAD.top - PAD.bottom} fill="transparent" />
        </g>
      ))}
      {dates.map((d, i) => (i % 2 === 0 || i === dates.length - 1) && (
        <text key={d} x={x(i)} y={H - 8} className={`ts-tick ${i === activeIndex ? "is-active" : ""}`} textAnchor="middle">{sd(d)}</text>
      ))}
      <text x={PAD.left} y={11} className="ts-unit">{unit}</text>
    </svg>
  );
}
