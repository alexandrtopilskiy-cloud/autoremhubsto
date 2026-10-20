import { z } from "zod";
import { prisma } from "../db";
import { NotFoundError, UserError } from "../errors";
import { ownOrder } from "../tenant";

// Схема кузова (вид сверху, капот вверху): зона → прямоугольник в координатах 240 × 404.
const LEFT = [
  { key: "lf_fender", label: "Левое переднее крыло", x: 18, y: 40, w: 40, h: 90 },
  { key: "lf_door", label: "Левая передняя дверь", x: 18, y: 132, w: 44, h: 90 },
  { key: "lr_door", label: "Левая задняя дверь", x: 18, y: 224, w: 44, h: 80 },
  { key: "lr_fender", label: "Левое заднее крыло", x: 18, y: 306, w: 40, h: 62 },
];
export const ZONES = [
  { key: "f_bumper", label: "Передний бампер", x: 50, y: 8, w: 140, h: 26 },
  { key: "hood", label: "Капот", x: 60, y: 36, w: 120, h: 80 },
  { key: "windshield", label: "Лобовое стекло", x: 64, y: 118, w: 112, h: 34 },
  { key: "roof", label: "Крыша", x: 64, y: 154, w: 112, h: 110 },
  { key: "r_window", label: "Заднее стекло", x: 64, y: 266, w: 112, h: 30 },
  { key: "trunk", label: "Багажник", x: 60, y: 298, w: 120, h: 70 },
  { key: "r_bumper", label: "Задний бампер", x: 50, y: 370, w: 140, h: 26 },
  ...LEFT,
  ...LEFT.map((z) => ({ ...z, key: z.key.replace(/^l/, "r"), label: z.label.replace("Левое", "Правое").replace("Левая", "Правая"), x: 240 - z.x - z.w })),
  { key: "wheels", label: "Колёса и диски", x: 0, y: 0, w: 0, h: 0 },
  { key: "interior", label: "Салон", x: 0, y: 0, w: 0, h: 0 },
];
export const zoneLabel = (k: string) => ZONES.find((z) => z.key === k)?.label ?? k;

export const DAMAGE_TYPES = ["Царапина", "Вмятина", "Скол", "Трещина", "Коррозия", "Разбито или нет детали"];

export const KIT_ITEMS = [
  "Запасное колесо",
  "Домкрат",
  "Баллонный ключ",
  "Аптечка",
  "Огнетушитель",
  "Знак аварийной остановки",
  "Коврики",
  "Магнитола",
  "Свидетельство о регистрации",
  "Ключ и брелок сигнализации",
];

export const FUEL_LEVELS = [0, 25, 50, 75, 100];

export type Damage = { zone: string; type: string; note?: string | null };

export const inspectionSchema = z.object({
  fuel: z
    .union([z.literal(""), z.coerce.number().int().min(0).max(100)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  items: z.array(z.string()).default([]).transform((a) => a.filter((x) => KIT_ITEMS.includes(x))),
  dirty: z.boolean().default(false),
  dark: z.boolean().default(false),
  notes: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
});

export const damageSchema = z.object({
  zone: z.string().refine((z) => ZONES.some((x) => x.key === z), "Выберите место повреждения"),
  type: z.string().refine((t) => DAMAGE_TYPES.includes(t), "Выберите вид повреждения"),
  note: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
});

async function editable(companyId: string, orderId: string) {
  const o = await ownOrder(prisma, companyId, orderId);
  if (o.status === "POSTED") throw new UserError("Заказ-наряд проведён. Сначала отмените проведение.");
  return o;
}

export async function getInspection(companyId: string, orderId: string) {
  await ownOrder(prisma, companyId, orderId);
  const i = await prisma.inspection.findUnique({ where: { orderId } });
  return {
    fuel: i?.fuel ?? null,
    items: i?.items ?? [],
    damages: (i?.damages ?? []) as Damage[],
    dirty: i?.dirty ?? false,
    dark: i?.dark ?? false,
    notes: i?.notes ?? null,
    saved: !!i,
  };
}

export async function saveInspection(companyId: string, orderId: string, input: unknown) {
  const data = inspectionSchema.parse(input);
  await editable(companyId, orderId);
  return prisma.inspection.upsert({ where: { orderId }, create: { ...data, orderId }, update: data });
}

export async function addDamage(companyId: string, orderId: string, input: unknown) {
  const d = damageSchema.parse(input);
  await editable(companyId, orderId);
  const cur = await getInspection(companyId, orderId);
  const damages = [...cur.damages, d];
  return prisma.inspection.upsert({ where: { orderId }, create: { orderId, damages }, update: { damages } });
}

export async function removeDamage(companyId: string, orderId: string, index: number) {
  await editable(companyId, orderId);
  const cur = await getInspection(companyId, orderId);
  if (!cur.damages[index]) throw new NotFoundError("Повреждение");
  const damages = cur.damages.filter((_, i) => i !== index);
  return prisma.inspection.update({ where: { orderId }, data: { damages } });
}
