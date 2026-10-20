import { z } from "zod";
import { prisma } from "../db";
import { ownClient, ownVehicle } from "../tenant";
import { ownCategory } from "./prices";

const opt = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null));

export const clientSchema = z.object({
  kind: z.enum(["PERSON", "ENTREPRENEUR", "LEGAL"]).default("PERSON"),
  name: z.string().trim().min(1, "Укажите имя или название"),
  phone: opt,
  email: opt,
  inn: opt,
  comment: opt,
  discount: z.coerce.number().int().min(0).max(100).default(0),
  source: opt,
  priceCategoryId: opt,
});

export const vehicleSchema = z.object({
  make: z.string().trim().min(1, "Укажите марку"),
  model: z.string().trim().min(1, "Укажите модель"),
  year: z
    .union([z.literal(""), z.coerce.number().int().min(1900).max(2100)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  vin: opt.transform((v) => (v ? v.toUpperCase() : null)),
  plate: opt.transform((v) => (v ? v.toUpperCase().replace(/\s+/g, "") : null)),
  color: opt,
});

export async function listClients(companyId: string, q?: string, opts: { archived?: boolean } = {}) {
  const query = q?.trim();
  return prisma.client.findMany({
    where: {
      companyId,
      archived: opts.archived ?? false,
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { phone: { contains: query } },
              { vehicles: { some: { plate: { contains: query.toUpperCase().replace(/\s+/g, "") } } } },
              { vehicles: { some: { vin: { contains: query.toUpperCase() } } } },
            ],
          }
        : {}),
    },
    include: { vehicles: true },
    orderBy: { name: "asc" },
    take: 200,
  });
}

export async function getClient(companyId: string, id: string) {
  await ownClient(prisma, companyId, id);
  return prisma.client.findUniqueOrThrow({
    where: { id },
    include: {
      vehicles: { orderBy: { createdAt: "asc" } },
      workOrders: { orderBy: { number: "desc" }, take: 50, include: { vehicle: true } },
    },
  });
}

export async function createClient(companyId: string, input: unknown) {
  const data = clientSchema.parse(input);
  if (data.priceCategoryId) await ownCategory(prisma, companyId, data.priceCategoryId);
  return prisma.client.create({ data: { ...data, companyId } });
}

export async function updateClient(companyId: string, id: string, input: unknown) {
  await ownClient(prisma, companyId, id);
  const data = clientSchema.parse(input);
  if (data.priceCategoryId) await ownCategory(prisma, companyId, data.priceCategoryId);
  return prisma.client.update({ where: { id }, data });
}

export async function setClientArchived(companyId: string, id: string, archived: boolean) {
  await ownClient(prisma, companyId, id);
  return prisma.client.update({ where: { id }, data: { archived } });
}

export async function addVehicle(companyId: string, clientId: string, input: unknown) {
  await ownClient(prisma, companyId, clientId);
  const data = vehicleSchema.parse(input);
  return prisma.vehicle.create({ data: { ...data, companyId, clientId } });
}

export async function updateVehicle(companyId: string, id: string, input: unknown) {
  await ownVehicle(prisma, companyId, id);
  const data = vehicleSchema.parse(input);
  return prisma.vehicle.update({ where: { id }, data });
}
