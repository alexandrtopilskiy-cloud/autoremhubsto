import type { DocKind } from "@prisma/client";
import { prisma } from "../db";
import { NotFoundError, UserError } from "../errors";

export const MAX_ATTACHMENT = 10 * 1024 * 1024;

/** Картинки, которые безопасно показывать прямо в браузере. SVG сюда не входит: в нём может быть скрипт. */
export const INLINE_MIME = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"];

async function ownDoc(companyId: string, kind: DocKind, docId: string) {
  const where = { id: docId, companyId };
  const found =
    kind === "ORDER"
      ? await prisma.workOrder.findFirst({ where, select: { id: true } })
      : kind === "ESTIMATE"
        ? await prisma.estimate.findFirst({ where, select: { id: true } })
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
  if (file.size > MAX_ATTACHMENT) throw new UserError("Файл больше 10 МБ");
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

export async function getAttachment(companyId: string, id: string) {
  const a = await prisma.attachment.findFirst({ where: { id, companyId } });
  if (!a) throw new NotFoundError("Файл");
  return a;
}

export async function deleteAttachment(companyId: string, id: string) {
  await prisma.attachment.deleteMany({ where: { id, companyId } });
}
