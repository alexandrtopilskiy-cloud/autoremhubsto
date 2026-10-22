import { prisma } from "../db";

/** Работающие сотрудники для выбора в документах; kind — только менеджеры или только исполнители. */
export function listEmployees(companyId: string, kind?: "MANAGER" | "EXECUTOR") {
  return prisma.employee.findMany({ where: { companyId, active: true, OR: [{ firedAt: null }, { firedAt: { gt: new Date() } }], ...(kind && { kind }) }, orderBy: { name: "asc" } });
}

export function listOrganizations(companyId: string) {
  return prisma.organization.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } });
}
