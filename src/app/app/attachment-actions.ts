"use server";

import { revalidatePath } from "next/cache";
import type { DocKind } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { run, type FormState } from "@/lib/actions";
import { UserError } from "@/lib/errors";
import { addAttachment, deleteAttachment } from "@/lib/services/attachments";

export async function uploadAttachmentAction(kind: DocKind, docId: string, path: string, _: FormState, fd: FormData) {
  const s = await requireSession();
  const res = await run(async () => {
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
  const res = await run(() => deleteAttachment(s.companyId, id));
  revalidatePath(path);
  return res;
}
