import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { Allowed } from "@/components/manager-only";
import { Badge, Card, Field, Input, NewPanel, PageTitle, Select, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { formatRub } from "@/lib/money";
import { listSuppliers } from "@/lib/services/stock";
import { listSupplierOrders, supplierOrderStatusLabel } from "@/lib/services/supplier-orders";
import { StockTabs } from "../tabs";
import { createSupplierOrderAction } from "../warehouse-actions";

const tone = {
  NEW: "amber",
  SENT: "blue",
  RECEIVED: "green",
  CANCELLED: "slate",
} as const;

export default async function SupplierOrdersPage() {
  const s = await requireSession();
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
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b last:border-0">
                  <td className={td}>
                    <Link className="text-blue-600 hover:underline" href={`/app/stock/orders/${o.id}`}>
                      ЗП-{o.number}
                    </Link>
                  </td>
                  <td className={td}>{formatDate(o.createdAt)}</td>
                  <td className={td}>{o.supplier.name}</td>
                  <td className={td}>
                    <Badge tone={tone[o.status]}>{supplierOrderStatusLabel(o.status)}</Badge>
                  </td>
                  <td className={td}>
                    {o.receipt && (
                      <Link className="text-blue-600 hover:underline" href={`/app/stock/receipts/${o.receipt.id}`}>
                        ПН-{o.receipt.number}
                      </Link>
                    )}
                  </td>
                  <td className={`${td} text-right whitespace-nowrap`}>{formatRub(o.total)}</td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={6} className={`${td} text-slate-500`}>
                    Заказов поставщикам пока нет
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </Allowed>
    </div>
  );
}
