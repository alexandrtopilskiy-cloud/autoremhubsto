import { ActionForm, Submit } from "@/components/form";
import { PreviewHint, PreviewLines, PreviewRow, PreviewTitle } from "@/components/list-view";
import { Allowed } from "@/components/manager-only";
import { ListRow, PreviewPane } from "@/components/preview-pane";
import { Card, Field, Input, NewPanel, PageTitle, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatDate, receiptNo } from "@/lib/format";
import { previewHref, previewId } from "@/lib/list-query";
import { formatRub } from "@/lib/money";
import { listSuppliers, supplierPreview } from "@/lib/services/stock";
import { createSupplierAction } from "../actions";
import { StockTabs } from "../tabs";

const PATH = "/app/stock/suppliers";

async function Preview({ companyId, id, costs }: { companyId: string; id: string; costs: boolean }) {
  const p = await supplierPreview(companyId, id);
  if (!p) return <p className="text-sm text-slate-500">Поставщик не найден.</p>;
  return (
    <>
      <PreviewTitle title={p.name} href={`${PATH}/${p.id}`} open="Открыть карточку" />
      <PreviewRow label="ИНН">{p.inn}</PreviewRow>
      <PreviewRow label="Телефон">{p.phone}</PreviewRow>
      <PreviewRow label="Комментарий">{p.comment}</PreviewRow>
      {costs && (
        <>
          <PreviewLines
            title="Последние приходы"
            lines={p.receipts.map((r) => ({ key: r.id, name: `${receiptNo(r.number, r.numberPrefix)} от ${formatDate(r.date)}`, right: formatRub(r.total) }))}
          />
          <PreviewLines title="Последние заказы" lines={p.orders.map((o) => ({ key: o.id, name: `ЗП-${o.number} от ${formatDate(o.createdAt)}` }))} />
        </>
      )}
    </>
  );
}

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const preview = previewId(sp);
  const suppliers = await listSuppliers(s.companyId);
  return (
    <div className="flex flex-col gap-4">
      <PageTitle create="#new" createLabel="Новый поставщик">Склад</PageTitle>
      <StockTabs active="suppliers" />
      <Allowed perms={s.perms} section="stock">
        <NewPanel>
          <Card title="Новый поставщик">
            <ActionForm action={createSupplierAction} reset className="flex flex-wrap items-end gap-3">
              <Field label="Название" className="min-w-64 flex-1">
                <Input name="name" required />
              </Field>
              <Field label="ИНН">
                <Input name="inn" className="w-36" />
              </Field>
              <Field label="Телефон">
                <Input name="phone" />
              </Field>
              <Field label="Комментарий">
                <Input name="comment" />
              </Field>
              <Submit>Добавить</Submit>
            </ActionForm>
          </Card>
        </NewPanel>
        <PreviewPane
          selected={preview}
          panel={preview ? <Preview companyId={s.companyId} id={preview} costs={s.perms.flags.costs} /> : <PreviewHint what="поставщика" open="его карточку" />}
          list={
            <Card>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className={th}>Название</th>
                    <th className={th}>ИНН</th>
                    <th className={th}>Телефон</th>
                    <th className={th}>Комментарий</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((p) => (
                    <ListRow key={p.id} previewHref={previewHref(PATH, sp, p.id)} openHref={`${PATH}/${p.id}`} selected={preview === p.id}>
                      <td className={td}>{p.name}</td>
                      <td className={td}>{p.inn}</td>
                      <td className={td}>{p.phone}</td>
                      <td className={`${td} text-slate-600`}>{p.comment}</td>
                    </ListRow>
                  ))}
                  {suppliers.length === 0 && (
                    <tr>
                      <td colSpan={4} className={`${td} text-slate-500`}>
                        Поставщиков пока нет
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>
          }
        />
      </Allowed>
    </div>
  );
}
