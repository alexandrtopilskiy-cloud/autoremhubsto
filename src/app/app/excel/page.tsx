import { Card, PageTitle } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { EXCEL_KINDS, MAX_ROWS, type ExcelKind } from "@/lib/services/excel";
import { ImportForm } from "./import-form";

const link = "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50";

export default async function ExcelPage() {
  const s = await requireSession();
  const kinds = (Object.keys(EXCEL_KINDS) as ExcelKind[]).filter((k) => can(s.perms, EXCEL_KINDS[k].section));
  return (
    <div className="flex flex-col gap-4">
      <PageTitle>Загрузка и выгрузка Excel</PageTitle>
      <Card>
        <p className="text-sm text-slate-600">
          Скачайте шаблон или выгрузку, заполните или поправьте её в Excel и загрузите обратно. Сначала нажмите «Проверить»: файл
          проверяется целиком, и если в какой-то строке ошибка, не загружается ничего. Найденные записи обновляются, пустые ячейки их не
          меняют. За раз — до {MAX_ROWS} строк.
        </p>
      </Card>
      {kinds.length === 0 && (
        <Card>
          <p className="text-sm text-slate-600">Нет доступа к клиентам и справочникам.</p>
        </Card>
      )}
      {kinds.map((k) => {
        const def = EXCEL_KINDS[k];
        return (
          <Card
            key={k}
            title={def.label}
            actions={
              <div className="flex flex-wrap gap-2">
                <a href={`/app/excel/${k}?template=1`} className={link}>
                  Шаблон
                </a>
                <a href={`/app/excel/${k}`} className={link}>
                  Выгрузить
                </a>
              </div>
            }
          >
            <p className="mb-3 text-sm text-slate-600">{def.keys}</p>
            {can(s.perms, def.section, "CREATE") ? (
              <ImportForm kind={k} />
            ) : (
              <p className="text-sm text-slate-500">Загрузка доступна с правом создавать записи в этом разделе.</p>
            )}
          </Card>
        );
      })}
    </div>
  );
}
