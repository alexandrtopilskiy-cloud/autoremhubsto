import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { OperatorOnly } from "@/components/manager-only";
import { Badge, Card, Field, Input, PageTitle, Select, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { formatRub } from "@/lib/money";
import { listClients } from "@/lib/services/clients";
import { listSales } from "@/lib/services/warehouse";
import { docStatus } from "../product-select";
import { StockTabs } from "../tabs";
import { createSaleAction } from "../warehouse-actions";

export default async function SalesPage() {
  const s = await requireSession();
  const [sales, clients] = await Promise.all([listSales(s.companyId), listClients(s.companyId)]);
  return (
    <div className="flex flex-col gap-4">
      <PageTitle>Склад</PageTitle>
      <StockTabs active="sales" />
      <OperatorOnly role={s.role}>
        <Card title="Новая продажа без ремонта">
          <ActionForm action={createSaleAction} className="flex flex-wrap items-end gap-3">
            <Field label="Покупатель">
              <Select name="clientId" defaultValue="">
                <option value="">Розничный покупатель</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.phone && `, ${c.phone}`}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Комментарий">
              <Input name="comment" />
            </Field>
            <Submit>Создать</Submit>
          </ActionForm>
        </Card>
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className={th}>Номер</th>
                <th className={th}>Дата</th>
                <th className={th}>Покупатель</th>
                <th className={th}>Статус</th>
                <th className={`${th} text-right`}>Сумма</th>
                <th className={`${th} text-right`}>Долг</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((x) => (
                <tr key={x.id} className="border-b last:border-0">
                  <td className={td}>
                    <Link className="text-blue-600 hover:underline" href={`/app/stock/sales/${x.id}`}>
                      РТ-{x.number}
                    </Link>
                  </td>
                  <td className={td}>{formatDate(x.date)}</td>
                  <td className={td}>{x.client?.name ?? "Розничный покупатель"}</td>
                  <td className={td}>
                    <Badge tone={x.status === "POSTED" ? "green" : "amber"}>{docStatus(x.status === "POSTED")}</Badge>
                  </td>
                  <td className={`${td} text-right whitespace-nowrap`}>{formatRub(x.totals.total)}</td>
                  <td className={`${td} text-right whitespace-nowrap ${x.totals.due > 0 ? "text-red-600" : ""}`}>
                    {x.totals.due !== 0 && formatRub(x.totals.due)}
                  </td>
                </tr>
              ))}
              {sales.length === 0 && (
                <tr>
                  <td colSpan={6} className={`${td} text-slate-500`}>
                    Продаж пока нет
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </OperatorOnly>
    </div>
  );
}
