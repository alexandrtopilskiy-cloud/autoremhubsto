import { z } from "zod";
import { prisma } from "../db";
import { hashPassword } from "../auth-core";
import { UserError } from "../errors";
import { ownEmployee } from "../tenant";

export const employeeSchema = z.object({
  name: z.string().trim().min(2, "Укажите имя сотрудника"),
  position: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null)),
  workPercent: z.coerce.number().int().min(0).max(100).default(0),
  salesPercent: z.coerce.number().int().min(0).max(100).default(0),
  active: z
    .union([z.boolean(), z.literal("on"), z.literal("")])
    .optional()
    .transform((v) => v === true || v === "on"),
});

export function listAllEmployees(companyId: string) {
  return prisma.employee.findMany({ where: { companyId }, orderBy: [{ active: "desc" }, { name: "asc" }] });
}

export async function createEmployee(companyId: string, input: unknown) {
  const data = employeeSchema.parse({ active: true, ...(input as object) });
  return prisma.employee.create({ data: { ...data, companyId } });
}

export async function updateEmployee(companyId: string, id: string, input: unknown) {
  await ownEmployee(prisma, companyId, id);
  const data = employeeSchema.parse(input);
  return prisma.employee.update({ where: { id }, data });
}

export const memberSchema = z.object({
  email: z.string().trim().toLowerCase().email("Неверный email"),
  name: z.string().trim().min(2, "Укажите имя"),
  password: z.string().optional(),
  role: z.enum(["ADMIN", "MANAGER", "MECHANIC"], { message: "Выберите роль" }),
});

export function listMembers(companyId: string) {
  return prisma.membership.findMany({
    where: { companyId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Даёт пользователю доступ к СТО. Новый пользователь создаётся с заданным паролем;
 * уже существующий (работает в другой СТО) просто получает доступ, его пароль не меняется.
 */
export async function addMember(companyId: string, input: unknown) {
  const data = memberSchema.parse(input);
  return prisma.$transaction(async (tx) => {
    let user = await tx.user.findUnique({ where: { email: data.email } });
    if (!user) {
      if (!data.password || data.password.length < 8) throw new UserError("Задайте пароль не короче 8 символов");
      user = await tx.user.create({
        data: { email: data.email, name: data.name, passwordHash: await hashPassword(data.password) },
      });
    }
    const exists = await tx.membership.findUnique({ where: { userId_companyId: { userId: user.id, companyId } } });
    if (exists) throw new UserError("У этого пользователя уже есть доступ к СТО");
    return tx.membership.create({ data: { userId: user.id, companyId, role: data.role } });
  });
}

async function ownMembership(companyId: string, id: string, actorUserId: string) {
  const m = await prisma.membership.findFirst({ where: { id, companyId } });
  if (!m) throw new UserError("Пользователь не найден");
  if (m.userId === actorUserId) throw new UserError("Нельзя менять собственный доступ");
  if (m.role === "OWNER") throw new UserError("Доступ владельца менять нельзя");
  return m;
}

export async function setMemberRole(companyId: string, actorUserId: string, id: string, role: unknown) {
  const r = memberSchema.shape.role.parse(role);
  await ownMembership(companyId, id, actorUserId);
  return prisma.membership.update({ where: { id }, data: { role: r } });
}

/** Отзывает доступ и завершает сессии пользователя в этой СТО. */
export async function removeMember(companyId: string, actorUserId: string, id: string) {
  const m = await ownMembership(companyId, id, actorUserId);
  await prisma.$transaction([
    prisma.session.deleteMany({ where: { userId: m.userId, companyId } }),
    prisma.membership.delete({ where: { id } }),
  ]);
}
