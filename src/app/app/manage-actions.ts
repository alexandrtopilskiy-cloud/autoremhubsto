"use server";

import { fields, num, rub, type FormState } from "@/lib/actions";
import { redirect } from "next/navigation";
import { parseRub } from "@/lib/money";
import { guarded } from "@/lib/guard";
import { FLAGS, LEVELS, SECTIONS, type Level, type Section } from "@/lib/permissions";
import {
  createGroup,
  createProduct,
  createWork,
  createWorkGroup,
  deleteWorkGroup,
  moveWorks,
  renameWorkGroup,
  deleteGroup,
  deleteProduct,
  deleteWork,
  renameGroup,
  updateProduct,
  updateWork,
} from "@/lib/services/catalog";
import { createOrganization, updateCompany, updateOrganization } from "@/lib/services/settings";
import {
  addMember,
  createEmployee,
  createRole,
  linkMemberEmployee,
  deleteRole,
  updateRole,
  removeMember,
  setMemberRole,
  updateEmployee,
} from "@/lib/services/staff";

/** Справочники, сотрудники и настройки: раздел прав и уровень выводятся из названия действия. */
async function manage(
  section: Section,
  level: Level,
  path: string,
  fn: (companyId: string, userId: string) => Promise<unknown>,
): Promise<FormState> {
  return guarded(section, level, path, (c, s) => fn(c, s.userId));
}

const optRub = (fd: FormData, name: string) => parseRub(fd.get(name)?.toString()) ?? 0;

// --- справочник работ ---
const workInput = (fd: FormData) => ({
  ...fields(fd),
  normHours: fields(fd).normHours?.replace(",", "."),
  price: optRub(fd, "price"),
});
export async function createWorkAction(_: FormState, fd: FormData) {
  return manage("catalog", "CREATE", "/app/catalog/works", (c) => createWork(c, workInput(fd)));
}
export async function updateWorkCardAction(id: string, _: FormState, fd: FormData) {
  return manage("catalog", "EDIT", `/app/catalog/works/${id}`, (c) => updateWork(c, id, workInput(fd)));
}
export async function deleteWorkAction(id: string) {
  const res = await manage("catalog", "FULL", "/app/catalog/works", (c) => deleteWork(c, id));
  if (res?.ok) redirect("/app/catalog/works");
  return res;
}

// --- группы работ ---
export async function createWorkGroupAction(_: FormState, fd: FormData) {
  return manage("catalog", "CREATE", "/app/catalog/works", (c) => createWorkGroup(c, fd.get("name")?.toString()));
}
export async function renameWorkGroupAction(id: string, _: FormState, fd: FormData) {
  return manage("catalog", "EDIT", "/app/catalog/works", (c) => renameWorkGroup(c, id, fd.get("name")?.toString()));
}
export async function deleteWorkGroupAction(id: string, _: FormState, fd: FormData) {
  return manage("catalog", "FULL", "/app/catalog/works", (c) => deleteWorkGroup(c, id, fd.get("moveTo")?.toString() || undefined));
}
export async function moveWorksAction(_: FormState, fd: FormData) {
  const ids = fd.getAll("ids").map(String);
  return manage("catalog", "EDIT", "/app/catalog/works", (c) => moveWorks(c, ids, fd.get("groupId")?.toString() ?? ""));
}

// --- номенклатура ---
const productInput = (fd: FormData) => ({ ...fields(fd), price: rub(fd, "price", "Цена"), minQty: num(fd, "minQty") });
export async function createProductAction(_: FormState, fd: FormData) {
  return manage("catalog", "CREATE", "/app/catalog/products", (c) => createProduct(c, productInput(fd)));
}
export async function updateProductCardAction(id: string, _: FormState, fd: FormData) {
  return manage("catalog", "EDIT", `/app/catalog/products/${id}`, (c) => updateProduct(c, id, productInput(fd)));
}
export async function deleteProductAction(id: string) {
  const res = await manage("catalog", "FULL", "/app/catalog/products", (c) => deleteProduct(c, id));
  if (res?.ok) redirect("/app/catalog/products");
  return res;
}

export async function createGroupAction(_: FormState, fd: FormData) {
  return manage("catalog", "CREATE", "/app/catalog/products", (c) => createGroup(c, fields(fd)));
}
export async function renameGroupAction(id: string, _: FormState, fd: FormData) {
  return manage("catalog", "EDIT", "/app/catalog/products", (c) => renameGroup(c, id, fields(fd)));
}
export async function deleteGroupAction(id: string) {
  return manage("catalog", "FULL", "/app/catalog/products", (c) => deleteGroup(c, id));
}

// --- сотрудники и пользователи ---
const USERS = "/app/settings/users";
export async function createEmployeeAction(_: FormState, fd: FormData) {
  return manage("staff", "CREATE", "/app/staff", (c) => createEmployee(c, fields(fd)));
}
export async function updateEmployeeAction(id: string, _: FormState, fd: FormData) {
  return manage("staff", "EDIT", `/app/staff/${id}`, (c) => updateEmployee(c, id, fields(fd)));
}
export async function addMemberAction(_: FormState, fd: FormData) {
  return manage("settings", "CREATE", USERS, (c) => addMember(c, fields(fd)));
}
export async function setMemberRoleAction(id: string, _: FormState, fd: FormData) {
  return manage("settings", "EDIT", USERS, (c, u) => setMemberRole(c, u, id, fd.get("role")));
}
export async function removeMemberAction(id: string) {
  return manage("settings", "FULL", USERS, (c, u) => removeMember(c, u, id));
}
export async function linkMemberEmployeeAction(id: string, _: FormState, fd: FormData) {
  return manage("settings", "EDIT", USERS, (c) => linkMemberEmployee(c, id, String(fd.get("employeeId") ?? "")));
}

// --- настройки ---
export async function updateCompanyAction(_: FormState, fd: FormData) {
  const minutes = (name: string) => {
    const [h, m] = (fields(fd)[name] ?? "").split(":").map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : undefined;
  };
  return manage("settings", "EDIT", "/app", (c) =>
    updateCompany(c, {
      ...fields(fd),
      hourPrice: rub(fd, "hourPrice", "Цена нормочаса"),
      dayStart: minutes("dayStart"),
      dayEnd: minutes("dayEnd") === 0 ? 1440 : minutes("dayEnd"),
    }),
  );
}
export async function createOrganizationAction(_: FormState, fd: FormData) {
  return manage("settings", "CREATE", "/app/settings", (c) => createOrganization(c, fields(fd)));
}
export async function updateOrganizationAction(id: string, _: FormState, fd: FormData) {
  return manage("settings", "EDIT", "/app/settings", (c) => updateOrganization(c, id, fields(fd)));
}

// --- свои роли ---
export async function createRoleAction(_: FormState, fd: FormData) {
  return manage("settings", "CREATE", "/app/settings/roles", (c) => createRole(c, fields(fd)));
}
/** Матрица прав из формы: s_<раздел> — уровень, f_<флаг> — галочка. */
export async function updateRoleAction(id: string, _: FormState, fd: FormData) {
  const f = fields(fd);
  const permissions = {
    sections: Object.fromEntries(SECTIONS.map((x) => [x.key, LEVELS.some((l) => l.key === f[`s_${x.key}`]) ? f[`s_${x.key}`] : "NONE"])),
    flags: Object.fromEntries(FLAGS.map((x) => [x.key, f[`f_${x.key}`] === "on"])),
  };
  return manage("settings", "EDIT", "/app/settings/roles", (c) => updateRole(c, id, { name: f.name, permissions }));
}
export async function deleteRoleAction(id: string) {
  return manage("settings", "FULL", "/app/settings/roles", (c) => deleteRole(c, id));
}
