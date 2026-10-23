import Link from "next/link";
import { IconLink } from "@/components/icon-button";
import { ActionForm, Submit } from "@/components/form";
import { Allowed } from "@/components/manager-only";
import { Badge, Card, Field, Input, NewPanel, PageTitle, Select, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { PreviewHint, PreviewLines, PreviewRow, PreviewTitle } from "@/components/list-view";
import { ListRow, PreviewPane } from "@/components/preview-pane";
import { previewHref, previewId } from "@/lib/list-query";
import { formatDate, formatQty, receiptNo } from "@/lib/format";
import { formatRub } from "@/lib/money";
import { listSuppliers } from "@/lib/services/stock";
import { getSupplierOrder, listSupplierOrders, supplierOrderStatusLabel } from "@/lib/services/supplier-orders";
import { StockTabs } from "../tabs";
import { createSupplierOrderAction } from "../warehouse-actions";
import { previewSession } from "@/lib/preview";

const tone = {
  NEW: "amber",
  SENT: "blue",
  RECEIVED: "green",
  CANCELLED: "slate",
} as const;

const PATH = "/app/stock/orders";

async function Preview({ companyId, id }: { companyId: string; id: string }) {
  const o = await getSupplierOrder(companyId, id).catch(() => null);
  if (!o) return <p className="text-sm text-slate-500">Заказ не найден.</p>;
  return (
    <>
      <PreviewTitle title={`ЗП-${o.number} от ${formatDate(o.createdAt)}`} href={`${PATH}/${o.id}`} />
      <PreviewRow label="Статус">{supplierOrderStatusLabel(o.status)}</PreviewRow>
      <PreviewRow label="Поставщик">{o.supplier.name}</PreviewRow>
      <PreviewRow label="Телефон">{o.supplier.phone}</PreviewRow>
      <PreviewRow label="Комментарий">{o.comment}</PreviewRow>
      <PreviewRow label="Приход">
        {o.receipt ? (
          <Link className="text-blue-600 hover:underline" href={`/app/stock/receipts/${o.receipt.id}`}>
            {receiptNo(o.receipt.number, o.receipt.numberPrefix)}
          </Link>
        ) : null}
      </PreviewRow>
      <PreviewLines
        title="Товары"
        lines={o.lines.map((l) => ({ key: l.id, name: l.product.name, right: `${formatQty(Number(l.qty))} ${l.product.unit} × ${formatRub(l.cost)}` }))}
      />
    </>
  );
}

/** Панель просмотра по клику на строку: загружается отдельно, список не пересчитывается. */
async function loadPreview(id: string) {
  "use server";
  const s = await previewSession("stock", "costs");
  return s ? <Preview companyId={s.companyId} id={id} /> : null;
}

export default async function SupplierOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const preview = previewId(sp);
  const [orders, suppliers] = await Promise.all([listSupplierOrders(s.companyId), listSuppliers(s.companyId)]);
  return (
    <div className="flex flex-col gap-4">
      <PageTitle create="#new" createLabel="Новый заказ поставщику">Склад</PageTitle>
      <StockTabs active="orders" />
      <Allowed perms={s.perms} section="stock" flag="costs">
        <NewPanel>
          <Card title="Новый заказ поставщику">
            {suppliers.length === 0 ? (
              <p className="text-sm text-slate-600">
                Сначала добавьте поставщика на вкладке{" "}
                <Link className="text-blue-600 hover:underline" href="/app/stock/suppliers">
                  «Поставщики»
                </Link>
                .
              </p>
            ) : (
              <ActionForm action={createSupplierOrderAction} className="flex flex-wrap items-end gap-3">
                <Field label="Поставщик">
                  <Select name="supplierId" defaultValue="">
                    <option value="">Выберите поставщика</option>
                    {suppliers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Комментарий">
                  <Input name="comment" />
                </Field>
                <Submit>Создать</Submit>
              </ActionForm>
            )}
          </Card>
        </NewPanel>
        <PreviewPane
          load={loadPreview}
          selected={preview}
          panel={preview ? <Preview companyId={s.companyId} id={preview} /> : <PreviewHint what="заказ" open="заказ поставщику" />}
          list={
            <Card>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className={th}>Номер</th>
                    <th className={th}>Дата</th>
                    <th className={th}>Поставщик</th>
                    <th className={th}>Статус</th>
                    <th className={th}>Приход</th>
                    <th className={`${th} text-right`}>Сумма</th>
                    <th className={th} />
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <ListRow key={o.id} previewHref={previewHref(PATH, sp, o.id)} openHref={`${PATH}/${o.id}`} selected={preview === o.id}>
                      <td className={td}>
                        <span className="text-blue-600">
                          ЗП-{o.number}
                        </span>
                      </td>
                      <td className={td}>{formatDate(o.createdAt)}</td>
                      <td className={td}>{o.supplier.name}</td>
                      <td className={td}>
                        <Badge tone={tone[o.status]}>{supplierOrderStatusLabel(o.status)}</Badge>
                      </td>
                      <td className={td}>
                        {o.receipt && (
                          <span className="text-blue-600">
                            {receiptNo(o.receipt.number, o.receipt.numberPrefix)}
                          </span>
                        )}
                      </td>
                      <td className={`${td} text-right whitespace-nowrap`}>{formatRub(o.total)}</td>
                      <td className={`${td} py-1.5`}>
                        <div className="flex justify-end">
                          <IconLink small newTab icon="print" label="Печать" href={`${PATH}/${o.id}/print`} />
                        </div>
                      </td>
                    </ListRow>
                  ))}
                  {orders.length === 0 && (
                    <tr>
                      <td colSpan={7} className={`${td} text-slate-500`}>
                        Заказов поставщикам пока нет
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
