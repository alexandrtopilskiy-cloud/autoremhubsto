import type { Role } from "@prisma/client";

export const ROLES: { value: Role; label: string }[] = [
  { value: "OWNER", label: "Владелец" },
  { value: "ADMIN", label: "Администратор" },
  { value: "MANAGER", label: "Менеджер" },
  { value: "MECHANIC", label: "Механик" },
];

export const roleLabel = (r: Role) => ROLES.find((x) => x.value === r)?.label ?? r;
