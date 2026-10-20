import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { hashPassword } from "../auth-core";
import { NotFoundError, UserError } from "../errors";
import { parsePermissions, PRESETS } from "../permissions";
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
  role: z.string().min(1, "Выберите роль"),
});

const BUILT_IN = ["ADMIN", "MANAGER", "MECHANIC"] as const;

/** Роль из формы: встроенная (ADMIN, MANAGER, MECHANIC) или своя роль СТО как «custom:<id>». */
async function resolveRole(db: Prisma.TransactionClient | typeof prisma, companyId: string, value: unknown) {
  const v = String(value ?? "");
  if ((BUILT_IN as readonly string[]).includes(v)) return { role: v as (typeof BUILT_IN)[number], customRoleId: null };
  if (v.startsWith("custom:")) {
    const r = await db.companyRole.findFirst({ where: { id: v.slice(7), companyId } });
    if (r) return { role: "MANAGER" as const, customRoleId: r.id };
  }
  throw new UserError("Выберите роль");
}

export function listMembers(companyId: string) {
  return prisma.membership.findMany({
    where: { companyId },
    include: { user: { select: { id: true, name: true, email: true } }, customRole: true },
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
    const role = await resolveRole(tx, companyId, data.role);
    let user = await tx.user.findUnique({ where: { email: data.email } });
    if (!user) {
      if (!data.password || data.password.length < 8) throw new UserError("Задайте пароль не короче 8 символов");
      user = await tx.user.create({
        data: { email: data.email, name: data.name, passwordHash: await hashPassword(data.password) },
      });
    }
    const exists = await tx.membership.findUnique({ where: { userId_companyId: { userId: user.id, companyId } } });
    if (exists) throw new UserError("У этого пользователя уже есть доступ к СТО");
    return tx.membership.create({ data: { userId: user.id, companyId, ...role } });
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
  await ownMembership(companyId, id, actorUserId);
  return prisma.membership.update({ where: { id }, data: await resolveRole(prisma, companyId, role) });
}

/** Отзывает доступ и завершает сессии пользователя в этой СТО. */
export async function removeMember(companyId: string, actorUserId: string, id: string) {
  const m = await ownMembership(companyId, id, actorUserId);
  await prisma.$transaction([
    prisma.session.deleteMany({ where: { userId: m.userId, companyId } }),
    prisma.membership.delete({ where: { id } }),
  ]);
}

// --- 8.7 свои роли ---

export const companyRoleSchema = z.object({ name: z.string().trim().min(2, "Укажите название роли") });

export function listRoles(companyId: string) {
  return prisma.companyRole.findMany({ where: { companyId }, include: { _count: { select: { members: true } } }, orderBy: { name: "asc" } });
}

/** Новая роль начинается с прав механика: доступ расширяют явно. */
export async function createRole(companyId: string, input: unknown) {
  const { name } = companyRoleSchema.parse(input);
  if (await prisma.companyRole.findFirst({ where: { companyId, name } })) throw new UserError("Роль с таким названием уже есть");
  return prisma.companyRole.create({ data: { companyId, name, permissions: PRESETS.MECHANIC } });
}

async function ownRole(companyId: string, id: string) {
  const r = await prisma.companyRole.findFirst({ where: { id, companyId } });
  if (!r) throw new NotFoundError("Роль");
  return r;
}

export async function updateRole(companyId: string, id: string, input: { name: unknown; permissions: unknown }) {
  await ownRole(companyId, id);
  const { name } = companyRoleSchema.parse({ name: input.name });
  if (await prisma.companyRole.findFirst({ where: { companyId, name, id: { not: id } } })) throw new UserError("Роль с таким названием уже есть");
  return prisma.companyRole.update({ where: { id }, data: { name, permissions: parsePermissions(input.permissions) } });
}

export async function deleteRole(companyId: string, id: string) {
  await ownRole(companyId, id);
  if (await prisma.membership.count({ where: { customRoleId: id } })) throw new UserError("Роль назначена пользователям. Сначала смените им роль.");
  await prisma.companyRole.delete({ where: { id } });
}
