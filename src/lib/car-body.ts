// Развёртка кузова как в аукционном листе: вид сверху, перед вверху, борта раскрыты влево и вправо.
// Координаты в системе 360 × 500. Левый борт рисуется слева, правый — его зеркало.

export const BODY_W = 360;
export const BODY_H = 500;

export type BodyZone = {
  key: string;
  label: string;
  d: string;
  glass?: boolean;
  cx: number;
  cy: number;
};
export type Wheel = { key: string; label: string; cx: number; cy: number };

const CENTER: BodyZone[] = [
  {
    key: "f_bumper",
    label: "Передний бампер",
    d: "M116,64 C116,38 142,24 180,24 C218,24 244,38 244,64 L232,64 C230,50 210,42 180,42 C150,42 130,50 128,64 Z",
    cx: 180,
    cy: 33,
  },
  {
    key: "hood",
    label: "Капот",
    d: "M128,64 C130,50 150,42 180,42 C210,42 230,50 232,64 L234,150 L126,150 Z",
    cx: 180,
    cy: 100,
  },
  {
    key: "windshield",
    label: "Лобовое стекло",
    d: "M126,152 L234,152 C230,168 226,182 224,194 C200,189 160,189 136,194 C134,182 130,168 126,152 Z",
    glass: true,
    cx: 180,
    cy: 172,
  },
  {
    key: "roof",
    label: "Крыша",
    d: "M136,196 C160,191 200,191 224,196 L224,300 C200,305 160,305 136,300 Z",
    cx: 180,
    cy: 248,
  },
  {
    key: "r_window",
    label: "Заднее стекло",
    d: "M136,302 C160,307 200,307 224,302 C226,314 230,326 234,336 L126,336 C130,326 134,314 136,302 Z",
    glass: true,
    cx: 180,
    cy: 322,
  },
  {
    key: "trunk",
    label: "Крышка багажника",
    d: "M126,338 L234,338 L232,424 C210,430 150,430 128,424 Z",
    cx: 180,
    cy: 382,
  },
  {
    key: "r_bumper",
    label: "Задний бампер",
    d: "M128,426 C150,432 210,432 232,426 L244,428 C244,456 220,472 180,472 C140,472 116,456 116,428 Z",
    cx: 180,
    cy: 455,
  },
  {
    key: "l_headlight",
    label: "Левая фара",
    d: "M129,62 C131,54 137,49 146,47 L152,56 L131,68 Z",
    glass: true,
    cx: 140,
    cy: 58,
  },
  {
    key: "r_headlight",
    label: "Правая фара",
    d: "M231,62 C229,54 223,49 214,47 L208,56 L229,68 Z",
    glass: true,
    cx: 220,
    cy: 58,
  },
  {
    key: "l_taillight",
    label: "Левый фонарь",
    d: "M127,410 L146,414 L146,426 C138,425 132,424 128,423 Z",
    glass: true,
    cx: 136,
    cy: 418,
  },
  {
    key: "r_taillight",
    label: "Правый фонарь",
    d: "M233,410 L214,414 L214,426 C222,425 228,424 232,423 Z",
    glass: true,
    cx: 224,
    cy: 418,
  },
];

// Левый борт: крыша/стёкла ближе к центру, порог и колёса — снаружи.
const LEFT: BodyZone[] = [
  {
    key: "lf_fender",
    label: "Левое переднее крыло",
    d: "M116,62 C100,60 72,62 54,66 C45,68 40,72 40,80 L40,84 A24,24 0 0 1 40,132 L40,150 L116,150 Z",
    cx: 86,
    cy: 108,
  },
  {
    key: "lf_door",
    label: "Левая передняя дверь",
    d: "M116,152 L116,246 L40,246 L40,152 Z",
    cx: 62,
    cy: 200,
  },
  {
    key: "lf_glass",
    label: "Стекло левой передней двери",
    d: "M114,160 L114,240 L86,240 C83,214 83,188 90,166 Z",
    glass: true,
    cx: 100,
    cy: 204,
  },
  {
    key: "lr_door",
    label: "Левая задняя дверь",
    d: "M116,248 L116,330 L40,330 L40,248 Z",
    cx: 62,
    cy: 290,
  },
  {
    key: "lr_glass",
    label: "Стекло левой задней двери",
    d: "M114,254 L114,316 L95,324 C86,302 84,276 86,254 Z",
    glass: true,
    cx: 100,
    cy: 285,
  },
  {
    key: "lr_fender",
    label: "Левое заднее крыло",
    d: "M116,332 L40,332 L40,356 A24,24 0 0 1 40,404 L40,412 C40,420 45,426 54,428 C72,432 100,432 116,428 Z",
    cx: 86,
    cy: 380,
  },
  {
    key: "l_sill",
    label: "Левый порог",
    d: "M40,132 L40,356 L31,356 L31,132 Z",
    cx: 35,
    cy: 244,
  },
  {
    key: "l_mirror",
    label: "Левое зеркало",
    d: "M116,146 C106,140 96,138 89,141 C85,147 89,155 97,156 L116,154 Z",
    cx: 100,
    cy: 148,
  },
];
const LEFT_WHEELS: Wheel[] = [
  { key: "lf_wheel", label: "Левое переднее колесо", cx: 38, cy: 108 },
  { key: "lr_wheel", label: "Левое заднее колесо", cx: 38, cy: 380 },
];

const right = (k: string) => k.replace(/^l/, "r");
const rightLabel = (s: string) => s.replace("Левое", "Правое").replace("Левая", "Правая").replace("Левый", "Правый").replace("левой", "правой");

/** Зеркалит путь из абсолютных команд M/L/C/A/Z по горизонтали. */
export function mirrorPath(d: string, w = BODY_W): string {
  return d.replace(/([MLCA])([^MLCAZ]*)/g, (_, cmd: string, args: string) => {
    const n = args
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (cmd === "A") {
      // rx,ry rot large sweep x,y — при зеркалировании меняется направление дуги
      const [rx, ry, rot, large, sweep, x, y] = n;
      return `A${rx},${ry} ${rot} ${large} ${1 - sweep} ${w - x},${y} `;
    }
    const pairs: string[] = [];
    for (let i = 0; i < n.length; i += 2) pairs.push(`${w - n[i]},${n[i + 1]}`);
    return `${cmd}${pairs.join(" ")} `;
  });
}

export const BODY_ZONES: BodyZone[] = [
  ...CENTER,
  ...LEFT,
  ...LEFT.map((z) => ({
    ...z,
    key: right(z.key),
    label: rightLabel(z.label),
    d: mirrorPath(z.d),
    cx: BODY_W - z.cx,
  })),
];
export const WHEELS: Wheel[] = [
  ...LEFT_WHEELS,
  ...LEFT_WHEELS.map((w) => ({
    ...w,
    key: right(w.key),
    label: rightLabel(w.label),
    cx: BODY_W - w.cx,
  })),
];

/** Места без детали на схеме: отмечаются кнопкой. «wheels» — из старых актов, до отдельных колёс. */
export const EXTRA_ZONES = [
  { key: "interior", label: "Салон" },
  { key: "wheels", label: "Колёса и диски" },
];

export const ALL_ZONES: { key: string; label: string }[] = [...BODY_ZONES, ...WHEELS, ...EXTRA_ZONES];
export const zoneLabel = (k: string) => ALL_ZONES.find((z) => z.key === k)?.label ?? k;
export const zoneCenter = (k: string) => [...BODY_ZONES, ...WHEELS].find((z) => z.key === k);

// --- коды повреждений ---

/** Типы повреждений по умолчанию — коды японских аукционных листов. */
export const AUCTION_CODES = [
  "A — Царапина",
  "U — Вмятина",
  "B — Вмятина с царапиной",
  "W — Волна, следы ремонта",
  "S — Ржавчина",
  "C — Сквозная коррозия",
  "Y — Трещина, дыра",
  "P — Окрашено, отличается цвет",
  "G — Скол на стекле",
  "R — Трещина на стекле",
  "X — Требует замены",
  "XX — Заменено",
];

export const SIZES = {
  1: "до 3 см",
  2: "до 10 см",
  3: "больше 10 см",
} as const;

/** «A — Царапина» → код A и название; тип без кода (старые акты, свои значения) → первая буква. */
export function damageCode(type: string): { code: string; name: string } {
  const m = type.match(/^\s*([A-Za-zА-Яа-яЁё]{1,3}\d?)\s+[—–-]\s+(.+)$/);
  if (m) return { code: m[1].toUpperCase(), name: m[2] };
  return { code: type.trim().charAt(0).toUpperCase(), name: type };
}

export type Damage = {
  zone: string;
  type: string;
  note?: string | null;
  size?: number | null;
  x?: number | null;
  y?: number | null;
};

/** То, что пишется на схеме: код и размер, например A2. */
export const damageTag = (d: Pick<Damage, "type" | "size">) => damageCode(d.type).code + (d.size ? d.size : "");

/** Полная расшифровка для списка и печати. */
export function damageText(d: Damage) {
  const { name } = damageCode(d.type);
  const size = d.size ? `, ${SIZES[d.size as 1 | 2 | 3]}` : "";
  return `${name}${size}${d.note ? `, ${d.note}` : ""}`;
}

/** Точка метки: где ткнули, а для старых отметок без точки — середина детали со сдвигом, чтобы не наслаивались. */
export function markPoints(damages: Damage[]) {
  const used = new Map<string, number>();
  return damages.map((d) => {
    if (d.x != null && d.y != null) return { x: d.x, y: d.y };
    const c = zoneCenter(d.zone);
    if (!c) return null;
    const n = used.get(d.zone) ?? 0;
    used.set(d.zone, n + 1);
    return { x: c.cx, y: c.cy + n * 18 };
  });
}
