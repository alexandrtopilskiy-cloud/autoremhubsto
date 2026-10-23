import { Card, PageTitle } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { EXCEL_KINDS, MAX_ROWS, type ExcelKind } from "@/lib/services/excel";
import { AdDocsForm } from "./ad-docs-form";
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
      {can(s.perms, "orders", "CREATE") && can(s.perms, "stock", "CREATE") && (
        <div id="autodealer" className="scroll-mt-4">
          <Card title="Документы из АвтоДилера">
            <p className="mb-3 text-sm text-slate-600">
              Заказ-наряды, приходные и расходные накладные из выгрузки АвтоДилера — по одному файлу за раз. Документ находится по ID
              АвтоДилера: повторная загрузка обновляет его, а не создаёт дубль. Клиент ищется по VIN, госномеру, телефону и наименованию,
              не найденный — добавляется. Работы, которых нет в справочнике, остаются только в заказ-нарядах. Сначала загрузите
              приходные накладные, затем заказ-наряды и расходные.
            </p>
            <AdDocsForm />
          </Card>
        </div>
      )}
      {kinds.map((k) => {
        const def = EXCEL_KINDS[k];
        return (
          <div key={k} id={k} className="scroll-mt-4">
            <Card
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
          </div>
        );
      })}
    </div>
  );
}
