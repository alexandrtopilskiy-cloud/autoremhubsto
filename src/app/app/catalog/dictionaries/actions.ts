"use server";

import type { FormState } from "@/lib/actions";
import { UserError } from "@/lib/errors";
import { guarded } from "@/lib/guard";
import type { Level } from "@/lib/permissions";
import { addDictItem, isDictKind, moveDictItem, removeDictItem, renameDictItem, resetDict } from "@/lib/services/dictionaries";
import type { DictKind } from "@prisma/client";

const PATH = "/app/catalog/dictionaries";

function op(kind: string, level: Level, fn: (companyId: string, kind: DictKind) => Promise<unknown>) {
  return guarded("catalog", level, PATH, async (c) => {
    if (!isDictKind(kind)) throw new UserError("Нет такого справочника");
    await fn(c, kind);
  });
}

export async function addDictItemAction(kind: string, _: FormState, fd: FormData) {
  return op(kind, "CREATE", (c, k) => addDictItem(c, k, fd.get("name")));
}
export async function renameDictItemAction(kind: string, name: string, _: FormState, fd: FormData) {
  return op(kind, "EDIT", (c, k) => renameDictItem(c, k, name, fd.get("name")));
}
export async function moveDictItemAction(kind: string, name: string, dir: -1 | 1) {
  await op(kind, "EDIT", (c, k) => moveDictItem(c, k, name, dir));
}
export async function removeDictItemAction(kind: string, name: string) {
  return op(kind, "FULL", (c, k) => removeDictItem(c, k, name));
}
export async function resetDictAction(kind: string) {
  return op(kind, "FULL", (c, k) => resetDict(c, k));
}
