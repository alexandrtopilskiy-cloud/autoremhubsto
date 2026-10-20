"use server";

import { redirect } from "next/navigation";
import type { FormState } from "@/lib/actions";
import { requireSession } from "@/lib/auth";
import { guarded } from "@/lib/guard";
import { assertCan } from "@/lib/permissions";
import { moveToTrash, purgeFromTrash, restoreFromTrash, TRASH_KINDS, trashKind, type TrashKind } from "@/lib/services/trash";

const TRASH = "/app/documents/trash";

/** Удаление документа в корзину (нужен полный доступ к разделу); после удаления — к списку документов. */
export async function trashDocAction(kind: TrashKind, id: string, back: string): Promise<FormState> {
  const k = TRASH_KINDS[kind];
  let done = false;
  const res = await guarded(k.section, "FULL", back, async (c, s) => {
    await moveToTrash(c, kind, id, { id: s.userId, name: s.userName });
    done = true;
  });
  if (!done) return res;
  redirect(back);
}

async function onTrashed(id: string, fn: (companyId: string) => Promise<unknown>) {
  const s = await requireSession();
  return guarded("documents", "VIEW", TRASH, async (c) => {
    assertCan(s.perms, (await trashKind(c, id)).section, "FULL");
    await fn(c);
  });
}

export async function restoreTrashAction(id: string): Promise<FormState> {
  let href: string | undefined;
  const res = await onTrashed(id, async (c) => {
    href = await restoreFromTrash(c, id);
  });
  if (!href) return res;
  redirect(href);
}

export async function purgeTrashAction(id: string): Promise<FormState> {
  return onTrashed(id, (c) => purgeFromTrash(c, id));
}
