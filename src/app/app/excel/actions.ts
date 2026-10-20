"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { UserError } from "@/lib/errors";
import { can, LEVELS, SECTIONS } from "@/lib/permissions";
import { EXCEL_KINDS, importExcel, isExcelKind, type ImportReport } from "@/lib/services/excel";

export type ImportState = { error?: string; report?: ImportReport; at?: number } | undefined;

/** Загрузка файла: кнопка «Проверить» только проверяет, «Загрузить» записывает, если ошибок нет. */
export async function importAction(kind: string, _: ImportState, fd: FormData): Promise<ImportState> {
  const s = await requireSession();
  if (!isExcelKind(kind)) return { error: "Нет такого справочника" };
  const def = EXCEL_KINDS[kind];
  if (!can(s.perms, def.section, "CREATE")) {
    const section = SECTIONS.find((x) => x.key === def.section)!.label;
    return { error: `Нужен уровень «${LEVELS.find((l) => l.key === "CREATE")!.label}» на раздел «${section}»` };
  }
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Выберите файл .xlsx" };
  if (file.size > 10 * 1024 * 1024) return { error: "Файл больше 10 МБ" };
  try {
    const report = await importExcel(s.companyId, kind, Buffer.from(await file.arrayBuffer()), {
      save: fd.get("mode") === "save",
      canDiscount: s.perms.flags.discounts,
    });
    if (report.saved) revalidatePath(kind === "clients" ? "/app/clients" : `/app/catalog/${kind}`);
    return { report, at: Date.now() };
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    throw e;
  }
}
