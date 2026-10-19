import type { Role } from "@prisma/client";
import { UserError } from "./errors";

export const ROLES: { value: Role; label: string }[] = [
  { value: "OWNER", label: "Владелец" },
  { value: "ADMIN", label: "Администратор" },
  { value: "MANAGER", label: "Менеджер" },
  { value: "MECHANIC", label: "Механик" },
];

export const roleLabel = (r: Role) => ROLES.find((x) => x.value === r)?.label ?? r;

/** Настройки, сотрудники и справочники доступны владельцу и администратору. */
export const canManage = (r: Role) => r === "OWNER" || r === "ADMIN";

export function assertManager(r: Role) {
  if (!canManage(r)) throw new UserError("Недостаточно прав: нужен владелец или администратор");
}

/** Склад и касса: все, кроме механика. */
export const canOperate = (r: Role) => r !== "MECHANIC";

export function assertOperator(r: Role) {
  if (!canOperate(r)) throw new UserError("Недостаточно прав для склада и кассы");
}
