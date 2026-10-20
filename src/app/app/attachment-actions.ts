"use server";

import { revalidatePath } from "next/cache";
import type { DocKind } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { run, type FormState } from "@/lib/actions";
import { UserError } from "@/lib/errors";
import { assertCan, type Section } from "@/lib/permissions";

const SECTION: Record<DocKind, Section> = { ORDER: "orders", ESTIMATE: "orders", RECEIPT: "stock" };
import { addAttachment, deleteAttachment } from "@/lib/services/attachments";

export async function uploadAttachmentAction(kind: DocKind, docId: string, path: string, _: FormState, fd: FormData) {
  const s = await requireSession();
  const res = await run(async () => {
    assertCan(s.perms, SECTION[kind], "EDIT");
    const files = fd.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) throw new UserError("Выберите файл");
    for (const f of files)
      await addAttachment(s.companyId, kind, docId, { name: f.name, type: f.type, size: f.size, bytes: new Uint8Array(await f.arrayBuffer()) });
  });
  revalidatePath(path);
  return res;
}

export async function deleteAttachmentAction(id: string, path: string) {
  const s = await requireSession();
  const res = await run(async () => {
    const att = await prisma.attachment.findFirst({ where: { id, companyId: s.companyId }, select: { docKind: true } });
    if (att) assertCan(s.perms, SECTION[att.docKind], "EDIT");
    await deleteAttachment(s.companyId, id);
  });
  revalidatePath(path);
  return res;
}
