import { z } from "zod";
import { prisma } from "../db";
import { NotFoundError, UserError } from "../errors";
import { ownOrder } from "../tenant";
import { ALL_ZONES, BODY_H, BODY_W, type Damage } from "../car-body";
import { dict } from "./dictionaries";

export { zoneLabel, type Damage } from "../car-body";

export const FUEL_LEVELS = [0, 25, 50, 75, 100];

export const inspectionSchema = z.object({
  fuel: z
    .union([z.literal(""), z.coerce.number().int().min(0).max(100)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  items: z.array(z.string()).default([]),
  dirty: z.boolean().default(false),
  dark: z.boolean().default(false),
  notes: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
});

const point = (max: number) =>
  z
    .union([z.literal(""), z.null(), z.coerce.number().min(0).max(max)])
    .optional()
    .transform((v) => (v === "" || v === undefined || v === null ? null : Math.round(v)));

export const damageSchema = z.object({
  zone: z.string().refine((z) => ALL_ZONES.some((x) => x.key === z), "Выберите место повреждения"),
  type: z.string().trim().min(1, "Выберите вид повреждения"),
  // размер по аукционной шкале: 1 — до 3 см, 2 — до 10 см, 3 — больше
  size: z
    .union([z.literal(""), z.null(), z.coerce.number().int().min(1).max(3)])
    .optional()
    .transform((v) => (v === "" || v === undefined || v === null ? null : v)),
  note: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v ? v : null)),
  // точка на развёртке, куда ткнули
  x: point(BODY_W),
  y: point(BODY_H),
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
  // отметки комплектности — из справочника СТО или уже отмеченные раньше (если значение потом убрали из справочника)
  const [kit, cur] = await Promise.all([dict(companyId, "KIT_ITEM"), getInspection(companyId, orderId)]);
  data.items = data.items.filter((x) => kit.includes(x) || cur.items.includes(x));
  return prisma.inspection.upsert({ where: { orderId }, create: { ...data, orderId }, update: data });
}

export async function addDamage(companyId: string, orderId: string, input: unknown) {
  const d = damageSchema.parse(input);
  await editable(companyId, orderId);
  if (!(await dict(companyId, "DAMAGE_TYPE")).includes(d.type)) throw new UserError("Выберите вид повреждения из справочника");
  const cur = await getInspection(companyId, orderId);
  const damages = [...cur.damages, d];
  return prisma.inspection.upsert({ where: { orderId }, create: { orderId, damages }, update: { damages } });
}

/** Правка отметки: вид, размер, уточнение. Место не меняется. */
export async function updateDamage(companyId: string, orderId: string, index: number, input: unknown) {
  await editable(companyId, orderId);
  const cur = await getInspection(companyId, orderId);
  const old = cur.damages[index];
  if (!old) throw new NotFoundError("Повреждение");
  const d = damageSchema.parse({ ...old, ...(input as object), zone: old.zone, x: old.x, y: old.y });
  // старый вид, которого уже нет в справочнике, можно оставить как есть
  if (d.type !== old.type && !(await dict(companyId, "DAMAGE_TYPE")).includes(d.type)) throw new UserError("Выберите вид повреждения из справочника");
  const damages = cur.damages.map((x, i) => (i === index ? d : x));
  return prisma.inspection.update({ where: { orderId }, data: { damages } });
}

export async function removeDamage(companyId: string, orderId: string, index: number) {
  await editable(companyId, orderId);
  const cur = await getInspection(companyId, orderId);
  if (!cur.damages[index]) throw new NotFoundError("Повреждение");
  const damages = cur.damages.filter((_, i) => i !== index);
  return prisma.inspection.update({ where: { orderId }, data: { damages } });
}
