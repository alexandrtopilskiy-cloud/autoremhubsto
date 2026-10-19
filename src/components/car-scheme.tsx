import { ZONES, type Damage } from "@/lib/services/inspections";

/** Схема кузова сверху: повреждённые зоны закрашены, на них номера повреждений из списка. */
export function CarScheme({ damages, className = "" }: { damages: Damage[]; className?: string }) {
  const numbers = new Map<string, number[]>();
  damages.forEach((d, i) => numbers.set(d.zone, [...(numbers.get(d.zone) ?? []), i + 1]));
  return (
    <svg viewBox="0 0 240 404" className={className} role="img" aria-label="Схема кузова">
      <rect x="14" y="4" width="212" height="396" rx="46" fill="none" stroke="#94a3b8" strokeWidth="2" />
      {ZONES.filter((z) => z.w > 0).map((z) => {
        const n = numbers.get(z.key);
        return (
          <g key={z.key}>
            <title>{z.label}</title>
            <rect x={z.x} y={z.y} width={z.w} height={z.h} rx="6" fill={n ? "#fecaca" : "#f8fafc"} stroke={n ? "#dc2626" : "#94a3b8"} />
            {n && (
              <text x={z.x + z.w / 2} y={z.y + z.h / 2 + 5} textAnchor="middle" fontSize="13" fontWeight="700" fill="#b91c1c">
                {n.join(",")}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
