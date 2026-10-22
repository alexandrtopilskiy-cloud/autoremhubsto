import type { DocKind } from "@prisma/client";
import { prisma } from "../db";
import { NotFoundError, UserError } from "../errors";
import { can, type Permissions, type Section } from "../permissions";

/** Какое право нужно, чтобы видеть и менять вложения документа. */
export const ATTACHMENT_SECTION: Record<DocKind, Section> = { ORDER: "orders", ESTIMATE: "orders", RECEIPT: "stock", EMPLOYEE: "staff" };

/** Виды документов, вложения которых пользователь может открыть. */
export const viewableKinds = (p: Permissions) => (Object.keys(ATTACHMENT_SECTION) as DocKind[]).filter((k) => can(p, ATTACHMENT_SECTION[k]));

export const MAX_ATTACHMENT = 10 * 1024 * 1024;
/** Документы сотрудника: сканы до 30 МБ на файл, только картинки и PDF. */
export const MAX_EMPLOYEE_ATTACHMENT = 30 * 1024 * 1024;
export const EMPLOYEE_MIME = ["image/png", "image/jpeg", "image/webp", "application/pdf"];

/** Картинки, которые безопасно показывать прямо в браузере. SVG сюда не входит: в нём может быть скрипт. */
export const INLINE_MIME = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"];

async function ownDoc(companyId: string, kind: DocKind, docId: string) {
  const where = { id: docId, companyId };
  const found =
    kind === "ORDER"
      ? await prisma.workOrder.findFirst({ where, select: { id: true } })
      : kind === "ESTIMATE"
        ? await prisma.estimate.findFirst({ where, select: { id: true } })
        : kind === "EMPLOYEE"
          ? await prisma.employee.findFirst({ where, select: { id: true } })
          : await prisma.receipt.findFirst({ where, select: { id: true } });
  if (!found) throw new NotFoundError("Документ");
}

export async function addAttachment(
  companyId: string,
  kind: DocKind,
  docId: string,
  file: { name: string; type: string; size: number; bytes: Uint8Array },
) {
  if (!file.size) throw new UserError("Выберите файл");
  if (kind === "EMPLOYEE") {
    if (!EMPLOYEE_MIME.includes(file.type)) throw new UserError(`«${file.name}»: можно только картинки (JPG, PNG, WEBP) или PDF`);
    if (file.size > MAX_EMPLOYEE_ATTACHMENT) throw new UserError(`«${file.name}»: файл больше 30 МБ`);
  } else if (file.size > MAX_ATTACHMENT) throw new UserError("Файл больше 10 МБ");
  await ownDoc(companyId, kind, docId);
  return prisma.attachment.create({
    data: {
      companyId,
      docKind: kind,
      docId,
      name: file.name.slice(0, 200) || "файл",
      mime: file.type || "application/octet-stream",
      size: file.size,
      data: Buffer.from(file.bytes),
    },
    select: { id: true },
  });
}

export function listAttachments(companyId: string, kind: DocKind, docId: string) {
  return prisma.attachment.findMany({
    where: { companyId, docKind: kind, docId },
    select: { id: true, name: true, mime: true, size: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function getAttachment(companyId: string, id: string, allowedKinds?: DocKind[]) {
  const a = await prisma.attachment.findFirst({ where: { id, companyId, ...(allowedKinds && { docKind: { in: allowedKinds } }) } });
  if (!a) throw new NotFoundError("Файл");
  return a;
}

export async function deleteAttachment(companyId: string, id: string) {
  await prisma.attachment.deleteMany({ where: { id, companyId } });
}
