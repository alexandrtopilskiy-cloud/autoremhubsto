import { prisma } from "../db";

export function listEmployees(companyId: string) {
  return prisma.employee.findMany({ where: { companyId, active: true }, orderBy: { name: "asc" } });
}

export function listOrganizations(companyId: string) {
  return prisma.organization.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } });
}
