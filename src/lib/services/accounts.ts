import { z } from "zod";
import { prisma } from "../db";
import { hashPassword, verifyPassword } from "../auth-core";
import { UserError } from "../errors";

export const registerSchema = z.object({
  companyName: z.string().trim().min(2, "Укажите название СТО"),
  city: z.string().trim().optional(),
  name: z.string().trim().min(2, "Укажите ваше имя"),
  email: z.string().trim().toLowerCase().email("Неверный email"),
  password: z.string().min(8, "Пароль не короче 8 символов"),
});

/** Регистрация новой СТО: компания, организация по умолчанию, владелец. */
export async function registerCompany(input: unknown) {
  const data = registerSchema.parse(input);
  const exists = await prisma.user.findUnique({ where: { email: data.email } });
  if (exists) throw new UserError("Пользователь с таким email уже зарегистрирован");
  const passwordHash = await hashPassword(data.password);
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: { name: data.companyName, city: data.city || null },
    });
    await tx.organization.create({ data: { companyId: company.id, name: data.companyName } });
    const user = await tx.user.create({
      data: { email: data.email, name: data.name, passwordHash },
    });
    await tx.membership.create({ data: { userId: user.id, companyId: company.id, role: "OWNER" } });
    await tx.employee.create({ data: { companyId: company.id, kind: "MANAGER", name: data.name, position: "Руководитель", userId: user.id } });
    await tx.cashbox.createMany({
      data: [
        { companyId: company.id, name: "Касса", kind: "CASH" },
        { companyId: company.id, name: "Расчётный счёт", kind: "BANK" },
      ],
    });
    await tx.workplace.createMany({
      data: [
        { companyId: company.id, name: "Пост 1", position: 0 },
        { companyId: company.id, name: "Пост 2", position: 1 },
      ],
    });
    return { user, company };
  });
}

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Неверный email"),
  password: z.string().min(1, "Введите пароль"),
});

/** Проверка логина. Возвращает пользователя и компанию, в которую войти. */
export async function authenticate(input: unknown) {
  const data = loginSchema.parse(input);
  const user = await prisma.user.findUnique({
    where: { email: data.email },
    include: { memberships: { orderBy: { createdAt: "asc" }, take: 1 } },
  });
  if (!user || !(await verifyPassword(data.password, user.passwordHash))) {
    throw new UserError("Неверный email или пароль");
  }
  const m = user.memberships[0];
  if (!m) throw new UserError("У пользователя нет доступа ни к одной СТО");
  return { userId: user.id, companyId: m.companyId };
}
