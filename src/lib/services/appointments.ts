import { z } from "zod";
import type { AppointmentStage, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { NotFoundError, UserError } from "../errors";
import { isDateStr, isTimeStr, localMinutes, localToUtc } from "../time";
import { ownClient, ownEmployee, ownVehicle } from "../tenant";
import { createOrder } from "./orders";

type Tx = Prisma.TransactionClient;

export const APPOINTMENT_STAGES: { value: AppointmentStage; label: string; color: string }[] = [
  { value: "NEW", label: "Новая", color: "bg-sky-100 border-sky-400 text-sky-900" },
  { value: "CONFIRMED", label: "Подтверждена", color: "bg-indigo-100 border-indigo-400 text-indigo-900" },
  { value: "IN_WORK", label: "В работе", color: "bg-amber-100 border-amber-400 text-amber-900" },
  { value: "DONE", label: "Выполнена", color: "bg-green-100 border-green-500 text-green-900" },
  { value: "CANCELLED", label: "Отказ", color: "bg-slate-100 border-slate-300 text-slate-500 line-through" },
];

export const appointmentStage = (s: AppointmentStage) => APPOINTMENT_STAGES.find((x) => x.value === s)!;

// --- посты ---

export function listWorkplaces(companyId: string, opts: { all?: boolean } = {}) {
  return prisma.workplace.findMany({
    where: { companyId, ...(opts.all ? {} : { active: true }) },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
}

export const workplaceSchema = z.object({
  name: z.string().trim().min(1, "Укажите название поста"),
  active: z
    .union([z.boolean(), z.literal("on"), z.literal("")])
    .optional()
    .transform((v) => v === true || v === "on"),
});

export async function createWorkplace(companyId: string, input: unknown) {
  const data = workplaceSchema.parse({ active: true, ...(input as object) });
  const position = await prisma.workplace.count({ where: { companyId } });
  return prisma.workplace.create({ data: { ...data, companyId, position } });
}

export async function updateWorkplace(companyId: string, id: string, input: unknown) {
  if (!(await prisma.workplace.findFirst({ where: { id, companyId } }))) throw new NotFoundError("Пост");
  return prisma.workplace.update({ where: { id }, data: workplaceSchema.parse(input) });
}

// --- записи ---

const optId = z
  .string()
  .optional()
  .transform((v) => (v ? v : null));
const optText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null));

export const appointmentSchema = z
  .object({
    workplaceId: z.string().min(1, "Выберите пост"),
    date: z.string().refine(isDateStr, "Укажите дату"),
    start: z.string().refine(isTimeStr, "Укажите время начала"),
    end: z.string().refine(isTimeStr, "Укажите время окончания"),
    clientId: optId,
    vehicleId: optId,
    contactName: optText,
    contactPhone: optText,
    reason: optText,
    amount: z.coerce.number().int().min(0).default(0),
    masterId: optId,
  })
  .refine((d) => d.end > d.start, { message: "Окончание должно быть позже начала" })
  .refine((d) => d.clientId || d.contactName || d.contactPhone, { message: "Укажите клиента или имя и телефон" });

async function checkAppointment(
  tx: Tx,
  companyId: string,
  d: z.infer<typeof appointmentSchema>,
  selfId?: string,
): Promise<{ startAt: Date; endAt: Date }> {
  const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
  const wp = await tx.workplace.findFirst({ where: { id: d.workplaceId, companyId } });
  if (!wp) throw new NotFoundError("Пост");
  if (d.clientId) await ownClient(tx, companyId, d.clientId);
  if (d.vehicleId) {
    const v = await ownVehicle(tx, companyId, d.vehicleId);
    if (d.clientId && v.clientId !== d.clientId) throw new UserError("Автомобиль принадлежит другому клиенту");
  }
  if (d.masterId) await ownEmployee(tx, companyId, d.masterId);
  const startAt = localToUtc(d.date, d.start, company.utcOffset);
  const endAt = localToUtc(d.date, d.end, company.utcOffset);
  const clash = await tx.appointment.findFirst({
    where: {
      companyId,
      workplaceId: d.workplaceId,
      stage: { not: "CANCELLED" },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
      ...(selfId ? { id: { not: selfId } } : {}),
    },
  });
  if (clash) throw new UserError(`На посту «${wp.name}» это время уже занято`);
  return { startAt, endAt };
}

function toData(d: z.infer<typeof appointmentSchema>) {
  return {
    workplaceId: d.workplaceId,
    clientId: d.clientId,
    vehicleId: d.vehicleId,
    contactName: d.contactName,
    contactPhone: d.contactPhone,
    reason: d.reason,
    amount: d.amount,
    masterId: d.masterId,
  };
}

export async function createAppointment(companyId: string, input: unknown) {
  const d = appointmentSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    const t = await checkAppointment(tx, companyId, d);
    return tx.appointment.create({ data: { ...toData(d), ...t, companyId } });
  });
}

async function ownAppointment(tx: Tx | typeof prisma, companyId: string, id: string) {
  const a = await tx.appointment.findFirst({ where: { id, companyId } });
  if (!a) throw new NotFoundError("Запись");
  return a;
}

export async function updateAppointment(companyId: string, id: string, input: unknown) {
  const d = appointmentSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    await ownAppointment(tx, companyId, id);
    const t = await checkAppointment(tx, companyId, d, id);
    return tx.appointment.update({ where: { id }, data: { ...toData(d), ...t } });
  });
}

export async function setAppointmentStage(companyId: string, id: string, stage: AppointmentStage) {
  const a = await ownAppointment(prisma, companyId, id);
  if (stage !== "CANCELLED" && a.stage === "CANCELLED") {
    // Возврат из отказа: время могли занять.
    const clash = await prisma.appointment.findFirst({
      where: { companyId, workplaceId: a.workplaceId, stage: { not: "CANCELLED" }, startAt: { lt: a.endAt }, endAt: { gt: a.startAt }, id: { not: id } },
    });
    if (clash) throw new UserError("Это время на посту уже занято другой записью");
  }
  return prisma.appointment.update({ where: { id }, data: { stage } });
}

export async function getAppointment(companyId: string, id: string) {
  await ownAppointment(prisma, companyId, id);
  return prisma.appointment.findUniqueOrThrow({
    where: { id },
    include: { workplace: true, client: { include: { vehicles: true } }, vehicle: true, master: true, order: true },
  });
}

export function listAppointments(companyId: string, from: Date, to: Date, f: { workplaceId?: string; stage?: AppointmentStage } = {}) {
  return prisma.appointment.findMany({
    where: {
      companyId,
      startAt: { lt: to },
      endAt: { gt: from },
      ...(f.workplaceId ? { workplaceId: f.workplaceId } : {}),
      ...(f.stage ? { stage: f.stage } : {}),
    },
    include: { workplace: true, client: true, vehicle: true, master: true, order: { select: { id: true, number: true } } },
    orderBy: { startAt: "asc" },
  });
}

/** Загрузка поста за день, % от рабочего времени СТО. Отказы не считаются. */
export function workplaceLoad(
  appointments: { workplaceId: string; startAt: Date; endAt: Date; stage: AppointmentStage }[],
  workplaceId: string,
  day: { start: Date; end: Date },
  workMinutes: number,
): number {
  if (workMinutes <= 0) return 0;
  const busy = appointments
    .filter((a) => a.workplaceId === workplaceId && a.stage !== "CANCELLED")
    .reduce((sum, a) => {
      const s = Math.max(a.startAt.getTime(), day.start.getTime());
      const e = Math.min(a.endAt.getTime(), day.end.getTime());
      return sum + Math.max(0, e - s) / 60_000;
    }, 0);
  return Math.round((busy / workMinutes) * 100);
}

/** Загрузка всех постов за день: среднее по постам, %. */
export function dayLoad(
  appointments: { workplaceId: string; startAt: Date; endAt: Date; stage: AppointmentStage }[],
  workplaceIds: string[],
  day: { start: Date; end: Date },
  workMinutes: number,
): number {
  if (workplaceIds.length === 0) return 0;
  const sum = workplaceIds.reduce((s, id) => s + workplaceLoad(appointments, id, day, workMinutes), 0);
  return Math.round(sum / workplaceIds.length);
}

/**
 * Заказ-наряд из записи. Если клиента ещё нет в базе, он создаётся из имени и телефона записи.
 * Запись получает этап «В работе» и ссылку на заказ-наряд.
 */
export async function createOrderFromAppointment(companyId: string, id: string) {
  const a = await ownAppointment(prisma, companyId, id);
  if (a.orderId) return prisma.workOrder.findUniqueOrThrow({ where: { id: a.orderId } });
  if (a.stage === "CANCELLED") throw new UserError("По отменённой записи заказ-наряд не создаётся");
  let clientId = a.clientId;
  if (!clientId) {
    const c = await prisma.client.create({
      data: { companyId, name: a.contactName || a.contactPhone || "Клиент из записи", phone: a.contactPhone },
    });
    clientId = c.id;
    await prisma.appointment.update({ where: { id }, data: { clientId } });
  }
  const order = await createOrder(companyId, {
    clientId,
    vehicleId: a.vehicleId ?? undefined,
    managerId: a.masterId ?? undefined,
    reason: a.reason ?? undefined,
  });
  await prisma.appointment.update({ where: { id }, data: { orderId: order.id, stage: "IN_WORK" } });
  return order;
}

export { localMinutes };
