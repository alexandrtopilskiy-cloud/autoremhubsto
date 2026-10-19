// Изоляция данных СТО: каждая функция сервисов получает companyId из сессии
// и обязана фильтровать по нему. Здесь — проверки принадлежности связанных записей.
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { NotFoundError } from "./errors";

type Db = Prisma.TransactionClient | typeof prisma;

export async function ownClient(db: Db, companyId: string, id: string) {
  const c = await db.client.findFirst({ where: { id, companyId } });
  if (!c) throw new NotFoundError("Клиент");
  return c;
}

export async function ownVehicle(db: Db, companyId: string, id: string) {
  const v = await db.vehicle.findFirst({ where: { id, companyId } });
  if (!v) throw new NotFoundError("Автомобиль");
  return v;
}

export async function ownEmployee(db: Db, companyId: string, id: string) {
  const e = await db.employee.findFirst({ where: { id, companyId } });
  if (!e) throw new NotFoundError("Сотрудник");
  return e;
}

export async function ownOrder(db: Db, companyId: string, id: string) {
  const o = await db.workOrder.findFirst({ where: { id, companyId } });
  if (!o) throw new NotFoundError("Заказ-наряд");
  return o;
}

export async function ownOrganization(db: Db, companyId: string, id: string) {
  const o = await db.organization.findFirst({ where: { id, companyId } });
  if (!o) throw new NotFoundError("Организация");
  return o;
}
