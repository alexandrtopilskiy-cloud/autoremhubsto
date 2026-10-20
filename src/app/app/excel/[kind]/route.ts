import { currentSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { EXCEL_KINDS, exportExcel, isExcelKind } from "@/lib/services/excel";

/** Выгрузка справочника в Excel; ?template=1 — пустой шаблон для заполнения. */
export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const s = await currentSession();
  if (!s) return new Response("Нужно войти", { status: 401 });
  const { kind } = await params;
  if (!isExcelKind(kind)) return new Response("Нет такого справочника", { status: 404 });
  const def = EXCEL_KINDS[kind];
  if (!can(s.perms, def.section)) return new Response("Недостаточно прав", { status: 403 });

  const template = new URL(req.url).searchParams.get("template") === "1";
  const name = `${def.file}${template ? " — шаблон" : ""}.xlsx`;
  return new Response(new Uint8Array(await exportExcel(s.companyId, kind, template)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${kind}.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
}
