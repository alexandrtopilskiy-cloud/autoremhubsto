import { z } from "zod";
import { prisma } from "../db";
import { ownOrganization } from "../tenant";

const opt = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null));

export const companySchema = z.object({
  name: z.string().trim().min(2, "Укажите название СТО"),
  city: opt,
  hourPrice: z.coerce.number().int().min(0, "Цена нормочаса не может быть отрицательной"),
  utcOffset: z.coerce.number().int().min(-720).max(840).default(180),
  dayStart: z.coerce.number().int().min(0).max(1439).default(540),
  dayEnd: z.coerce.number().int().min(1).max(1440).default(1260),
}).refine((d) => d.dayEnd > d.dayStart, { message: "Конец рабочего дня должен быть позже начала" });

export const organizationSchema = z.object({
  name: z.string().trim().min(2, "Укажите название организации"),
  inn: opt.refine((v) => v === null || /^\d{10}(\d{2})?$/.test(v), "ИНН: 10 или 12 цифр"),
  kpp: opt.refine((v) => v === null || /^\d{9}$/.test(v), "КПП: 9 цифр"),
  ogrn: opt.refine((v) => v === null || /^\d{13}(\d{2})?$/.test(v), "ОГРН: 13 или 15 цифр"),
  address: opt,
  phone: opt,
});

export function getCompany(companyId: string) {
  return prisma.company.findUniqueOrThrow({ where: { id: companyId } });
}

export async function updateCompany(companyId: string, input: unknown) {
  const data = companySchema.parse(input);
  return prisma.company.update({ where: { id: companyId }, data });
}

export async function createOrganization(companyId: string, input: unknown) {
  const data = organizationSchema.parse(input);
  return prisma.organization.create({ data: { ...data, companyId } });
}

export async function updateOrganization(companyId: string, id: string, input: unknown) {
  await ownOrganization(prisma, companyId, id);
  const data = organizationSchema.parse(input);
  return prisma.organization.update({ where: { id }, data });
}
