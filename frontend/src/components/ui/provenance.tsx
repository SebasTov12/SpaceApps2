import { cn } from "@/lib/utils";

type ProvenanceProps = {
  source: string;
  date: string;
  scale?: string;
  /** Limitación visible del dato. Criterio del reto: cada indicador la muestra. */
  limitation?: string;
  className?: string;
};

/** Fuente, fecha, escala y limitación de un indicador, en una sola línea legible. */
export function Provenance({ source, date, scale, limitation, className }: ProvenanceProps) {
  const items = [
    ["Fuente", source],
    ["Fecha", date],
    ["Escala", scale],
    ["Limitación", limitation],
  ].filter((item): item is [string, string] => Boolean(item[1]));

  return (
    <dl className={cn("ui-provenance", className)}>
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
