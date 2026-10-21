import { BODY_H, BODY_W, BODY_ZONES, WHEELS, damageTag, markPoints, zoneLabel, type Damage } from "@/lib/car-body";

const INK = "#334155";
const MARK = "#dc2626";
export const HAND_FONT = "'Segoe Print','Bradley Hand','Comic Sans MS',cursive";

/**
 * Развёртка кузова как в аукционном листе: на деталях — коды повреждений (A2, U1, XX).
 * Детали и колёса несут data-zone, метки — data-mark, по ним кликает редактор акта.
 */
export function CarScheme({
  damages,
  className = "",
  selected = -1,
  interactive = false,
}: {
  damages: Damage[];
  className?: string;
  selected?: number;
  interactive?: boolean;
}) {
  const points = markPoints(damages);
  const hit = new Set(damages.map((d) => d.zone));
  const part = (zone: string, glass?: boolean) =>
    `${interactive ? "cursor-crosshair hover:fill-blue-100 " : ""}${hit.has(zone) ? "fill-red-50" : glass ? "fill-slate-100" : "fill-white"}`;
  return (
    <svg viewBox={`0 0 ${BODY_W} ${BODY_H}`} className={className} role="img" aria-label="Развёртка кузова">
      {BODY_ZONES.map((z) => (
        <path key={z.key} data-zone={z.key} d={z.d} className={part(z.key, z.glass)} stroke={INK} strokeWidth="1.2" strokeLinejoin="round">
          <title>{z.label}</title>
        </path>
      ))}
      {WHEELS.map((w) => (
        <g key={w.key} data-zone={w.key} className={interactive ? "cursor-crosshair" : ""}>
          <title>{w.label}</title>
          <circle data-zone={w.key} cx={w.cx} cy={w.cy} r="20" className={hit.has(w.key) ? "fill-red-100" : "fill-slate-300"} stroke={INK} strokeWidth="1.2" />
          <circle data-zone={w.key} cx={w.cx} cy={w.cy} r="11" className="fill-white" stroke={INK} strokeWidth="1" />
          <circle cx={w.cx} cy={w.cy} r="3" fill={INK} pointerEvents="none" />
        </g>
      ))}
      <g fill="#94a3b8" fontSize="9" textAnchor="middle" pointerEvents="none">
        <text x="180" y="16">
          перед
        </text>
        <text x="180" y="490">
          зад
        </text>
        <text x="20" y="250" transform="rotate(-90 20 250)">
          левый борт
        </text>
        <text x="340" y="250" transform="rotate(90 340 250)">
          правый борт
        </text>
      </g>
      {damages.map((d, i) => {
        const p = points[i];
        if (!p) return null;
        return (
          <text
            key={i}
            data-mark={i}
            x={p.x}
            y={p.y + 7}
            textAnchor="middle"
            fontFamily={HAND_FONT}
            fontWeight="700"
            fontSize="19"
            fill={MARK}
            stroke="white"
            strokeWidth="3"
            paintOrder="stroke"
            textDecoration={i === selected ? "underline" : undefined}
            className={interactive ? "cursor-pointer" : ""}
          >
            {damageTag(d)}
            <title>{`${i + 1}. ${zoneLabel(d.zone)}`}</title>
          </text>
        );
      })}
    </svg>
  );
}
