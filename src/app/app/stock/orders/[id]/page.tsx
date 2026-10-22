import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/form";
import { Allowed } from "@/components/manager-only";
import { Badge, Card, Field, Input, PageTitle, Select, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { formatDate, formatQty } from "@/lib/format";
import { formatRub } from "@/lib/money";
import { listGroups, listProducts } from "@/lib/services/catalog";
import { listSuppliers } from "@/lib/services/stock";
import { getSupplierOrder, supplierOrderStatusLabel } from "@/lib/services/supplier-orders";
import { ProductSelect } from "../../product-select";
import { StockTabs } from "../../tabs";
import {
  addDeficitLinesAction,
  addSupplierOrderLineAction,
  cancelSupplierOrderAction,
  receiveSupplierOrderAction,
  removeSupplierOrderLineAction,
  reopenSupplierOrderAction,
  sendSupplierOrderAction,
  updateSupplierOrderAction,
} from "../../warehouse-actions";
import { TrashButton } from "@/components/trash-button";
import { DocToolbar } from "@/components/doc-toolbar";
import { trashDocAction } from "@/app/app/trash-actions";
import { can } from "@/lib/permissions";

export default async function SupplierOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const o = await getSupplierOrder(s.companyId, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [suppliers, products, groups] = await Promise.all([listSuppliers(s.companyId), listProducts(s.companyId), listGroups(s.companyId)]);
  const editable = o.status === "NEW";
  const open = o.status === "NEW" || o.status === "SENT";
  return (
    <div className="flex flex-col gap-4">
      <StockTabs active="orders" />
      <Allowed perms={s.perms} section="stock" flag="costs">
        <PageTitle tab={`ЗП-${o.number} ${o.supplier.name}`}
          actions={
            <DocToolbar
              exitHref="/app/stock/orders"
              editable={editable}
              trash={
                (o.status === "NEW" || o.status === "CANCELLED") &&
                can(s.perms, "stock", "FULL") && <TrashButton icon action={trashDocAction.bind(null, "SUPPLIER_ORDER", o.id, "/app/stock/orders")} />
              }
            >
              {o.status === "NEW" && (
                <ActionForm action={sendSupplierOrderAction.bind(null, o.id)}>
                  <Submit variant="ghost">Отметить отправленным</Submit>
                </ActionForm>
              )}
              {o.status === "SENT" && (
                <ActionForm action={reopenSupplierOrderAction.bind(null, o.id)}>
                  <Submit variant="ghost">Изменить заказ</Submit>
                </ActionForm>
              )}
              {open && (
                <ActionForm action={receiveSupplierOrderAction.bind(null, o.id)}>
                  <Submit>Товар пришёл: создать приход</Submit>
                </ActionForm>
              )}
              {open && (
                <ActionForm action={cancelSupplierOrderAction.bind(null, o.id)}>
                  <Submit variant="danger">Отменить</Submit>
                </ActionForm>
              )}
            </DocToolbar>
          }
        >
          Заказ поставщику ЗП-{o.number} от {formatDate(o.createdAt)}{" "}
          <Badge tone={o.status === "RECEIVED" ? "green" : o.status === "SENT" ? "blue" : o.status === "NEW" ? "amber" : "slate"}>
            {supplierOrderStatusLabel(o.status)}
          </Badge>
        </PageTitle>
        {o.receipt && (
          <p className="text-sm">
            По заказу создан приход{" "}
            <Link className="text-blue-600 hover:underline" href={`/app/stock/receipts/${o.receipt.id}`}>
              ПН-{o.receipt.number}
            </Link>
            {o.receipt.status === "DRAFT" && ", проверьте количество и проведите его"}.
          </p>
        )}
        <Card>
          <ActionForm doc action={updateSupplierOrderAction.bind(null, o.id)} className="flex flex-wrap items-end gap-3">
            <Field label="Поставщик">
              <Select name="supplierId" defaultValue={o.supplierId} disabled={!editable}>
                {suppliers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Комментарий" className="min-w-64 flex-1">
              <Input name="comment" defaultValue={o.comment ?? ""} disabled={!editable} />
            </Field>
          </ActionForm>
        </Card>
        <Card title={`Товары · ${formatRub(o.total)}`}>
          <table className="mb-3 w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className={th}>Наименование</th>
                <th className={th}>Артикул</th>
                <th className={`${th} text-right`}>Кол-во</th>
                <th className={`${th} text-right`}>Цена</th>
                <th className={`${th} text-right`}>Сумма</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {o.lines.map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className={td}>{l.product.name}</td>
                  <td className={td}>{l.product.article}</td>
                  <td className={`${td} text-right`}>
                    {formatQty(Number(l.qty))} {l.product.unit}
                  </td>
                  <td className={`${td} text-right whitespace-nowrap`}>{formatRub(l.cost)}</td>
                  <td className={`${td} text-right whitespace-nowrap`}>{formatRub(Math.round(Number(l.qty) * l.cost))}</td>
                  <td className={`${td} text-right`}>
                    {editable && (
                      <ActionForm action={removeSupplierOrderLineAction.bind(null, o.id, l.id)}>
                        <button className="text-red-600 hover:underline" title="Удалить">
                          ✕
                        </button>
                      </ActionForm>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {editable && (
            <ActionForm action={addSupplierOrderLineAction.bind(null, o.id)} reset className="flex flex-wrap items-end gap-3">
              <Field label="Товар" className="min-w-64 flex-1">
                <ProductSelect products={products} />
              </Field>
              <Field label="Кол-во">
                <Input name="qty" defaultValue="1" inputMode="decimal" className="w-24" />
              </Field>
              <Field label="Цена, ₽">
                <Input name="cost" inputMode="decimal" className="w-36" placeholder="последний приход" />
              </Field>
              <Submit variant="ghost">Добавить</Submit>
            </ActionForm>
          )}
          {editable && (
            <ActionForm action={addDeficitLinesAction.bind(null, o.id)} className="mt-3 flex flex-wrap items-end gap-3 border-t pt-3">
              <Field label="Товары ниже минимального остатка">
                <Select name="groupId" defaultValue="">
                  <option value="">Все группы</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                  <option value="none">Без группы</option>
                </Select>
              </Field>
              <Submit variant="ghost">Добавить дефицит</Submit>
              <span className="pb-2 text-xs text-slate-500">Количество — до минимального остатка, цена — из последнего прихода.</span>
            </ActionForm>
          )}
        </Card>
      </Allowed>
    </div>
  );
}
