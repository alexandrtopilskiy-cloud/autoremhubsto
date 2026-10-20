import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { Allowed } from "@/components/manager-only";
import { Badge, Card, Field, Input, PageTitle, Select, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { formatRub } from "@/lib/money";
import { listReceipts, listSuppliers } from "@/lib/services/stock";
import { createReceiptAction } from "../actions";
import { StockTabs } from "../tabs";

export default async function ReceiptsPage() {
  const s = await requireSession();
  const [receipts, suppliers] = await Promise.all([listReceipts(s.companyId), listSuppliers(s.companyId)]);
  return (
    <div className="flex flex-col gap-4">
      <PageTitle>Склад</PageTitle>
      <StockTabs active="receipts" />
      <Allowed perms={s.perms} section="stock" flag="costs">
        <Card title="Новый приход">
          <ActionForm action={createReceiptAction} className="flex flex-wrap items-end gap-3">
            <Field label="Поставщик">
              <Select name="supplierId" defaultValue="">
                <option value="">Не указан</option>
                {suppliers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Номер документа поставщика">
              <Input name="supplierDoc" />
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
                <th className={th}>Поставщик</th>
                <th className={th}>Статус</th>
                <th className={`${th} text-right`}>Сумма</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className={td}>
                    <Link className="text-blue-600 hover:underline" href={`/app/stock/receipts/${r.id}`}>
                      ПН-{r.number}
                    </Link>
                    {r.supplierDoc && <span className="text-slate-500"> ({r.supplierDoc})</span>}
                  </td>
                  <td className={td}>{formatDate(r.date)}</td>
                  <td className={td}>{r.supplier?.name}</td>
                  <td className={td}>
                    <Badge tone={r.status === "POSTED" ? "green" : "amber"}>{r.status === "POSTED" ? "Проведён" : "Черновик"}</Badge>
                  </td>
                  <td className={`${td} text-right whitespace-nowrap`}>{formatRub(r.total)}</td>
                </tr>
              ))}
              {receipts.length === 0 && (
                <tr>
                  <td colSpan={5} className={`${td} text-slate-500`}>
                    Приходов пока нет
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
