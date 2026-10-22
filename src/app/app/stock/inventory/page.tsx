import { ActionForm, Submit } from "@/components/form";
import { Allowed } from "@/components/manager-only";
import { Badge, Card, Field, Input, NewPanel, PageTitle, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { PreviewHint, PreviewLines, PreviewRow, PreviewTitle } from "@/components/list-view";
import { ListRow, PreviewPane } from "@/components/preview-pane";
import { previewHref, previewId } from "@/lib/list-query";
import { formatDate, formatQty } from "@/lib/format";
import { formatRub } from "@/lib/money";
import { getInventory, listInventories } from "@/lib/services/warehouse";
import { docStatus } from "../product-select";
import { StockTabs } from "../tabs";
import { createInventoryAction } from "../warehouse-actions";

const PATH = "/app/stock/inventory";

async function Preview({ companyId, id }: { companyId: string; id: string }) {
  const inv = await getInventory(companyId, id).catch(() => null);
  if (!inv) return <p className="text-sm text-slate-500">Инвентаризация не найдена.</p>;
  const diff = inv.lines.filter((l) => l.diff !== 0);
  return (
    <>
      <PreviewTitle title={`ИН-${inv.number} от ${formatDate(inv.date)}`} href={`${PATH}/${inv.id}`} />
      <PreviewRow label="Статус">{docStatus(inv.status === "POSTED")}</PreviewRow>
      <PreviewRow label="Комментарий">{inv.comment}</PreviewRow>
      <PreviewRow label="Позиций">{inv.lines.length}</PreviewRow>
      <PreviewRow label="Излишки">{inv.surplus ? formatRub(inv.surplus) : null}</PreviewRow>
      <PreviewRow label="Недостача">{inv.shortage ? <span className="text-red-600">{formatRub(inv.shortage)}</span> : null}</PreviewRow>
      <PreviewLines
        title="Расхождения"
        lines={diff.map((l) => ({ key: l.id, name: l.product.name, right: `${l.diff > 0 ? "+" : ""}${formatQty(l.diff)} ${l.product.unit}` }))}
      />
    </>
  );
}

export default async function InventoriesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const preview = previewId(sp);
  const list = await listInventories(s.companyId);
  return (
    <div className="flex flex-col gap-4">
      <PageTitle create="#new" createLabel="Новая инвентаризация">Склад</PageTitle>
      <StockTabs active="inventory" />
      <Allowed perms={s.perms} section="stock">
        <NewPanel>
          <Card title="Новая инвентаризация">
            <p className="mb-3 text-sm text-slate-600">
              В документ попадут все товары с остатком. Впишите, сколько их на самом деле, и проведите: склад выровняется по факту.
            </p>
            <ActionForm action={createInventoryAction} className="flex flex-wrap items-end gap-3">
              <Field label="Комментарий">
                <Input name="comment" placeholder="Например, стеллаж 1" className="w-64" />
              </Field>
              <Submit>Начать</Submit>
            </ActionForm>
          </Card>
        </NewPanel>
        <PreviewPane
          selected={preview}
          panel={preview ? <Preview companyId={s.companyId} id={preview} /> : <PreviewHint what="инвентаризацию" open="документ" />}
          list={
            <Card>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className={th}>Номер</th>
                    <th className={th}>Дата</th>
                    <th className={th}>Комментарий</th>
                    <th className={th}>Статус</th>
                    <th className={`${th} text-right`}>Позиций</th>
                    <th className={`${th} text-right`}>С расхождением</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((i) => (
                    <ListRow key={i.id} previewHref={previewHref(PATH, sp, i.id)} openHref={`${PATH}/${i.id}`} selected={preview === i.id}>
                      <td className={td}>
                        <span className="text-blue-600">
                          ИН-{i.number}
                        </span>
                      </td>
                      <td className={td}>{formatDate(i.date)}</td>
                      <td className={td}>{i.comment}</td>
                      <td className={td}>
                        <Badge tone={i.status === "POSTED" ? "green" : "amber"}>{docStatus(i.status === "POSTED")}</Badge>
                      </td>
                      <td className={`${td} text-right`}>{i.lines.length}</td>
                      <td className={`${td} text-right ${i.diffLines ? "text-red-600" : ""}`}>{i.diffLines}</td>
                    </ListRow>
                  ))}
                  {list.length === 0 && (
                    <tr>
                      <td colSpan={6} className={`${td} text-slate-500`}>
                        Инвентаризаций пока не было
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
