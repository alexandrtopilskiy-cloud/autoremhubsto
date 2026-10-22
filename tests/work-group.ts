import { prisma } from "@/lib/db";

/** Группа работ для тестов: работа без группы не создаётся. */
export async function wg(companyId: string, name = "Общие работы") {
  const g = await prisma.workGroup.findFirst({ where: { companyId, name } });
  return (g ?? (await prisma.workGroup.create({ data: { companyId, name } }))).id;
}
