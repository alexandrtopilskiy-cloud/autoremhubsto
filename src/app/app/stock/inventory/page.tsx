import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { Allowed } from "@/components/manager-only";
import { Badge, Card, Field, Input, NewPanel, PageTitle, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { listInventories } from "@/lib/services/warehouse";
import { docStatus } from "../product-select";
import { StockTabs } from "../tabs";
import { createInventoryAction } from "../warehouse-actions";

export default async function InventoriesPage() {
  const s = await requireSession();
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
                <tr key={i.id} className="border-b last:border-0">
                  <td className={td}>
                    <Link className="text-blue-600 hover:underline" href={`/app/stock/inventory/${i.id}`}>
                      ИН-{i.number}
                    </Link>
                  </td>
                  <td className={td}>{formatDate(i.date)}</td>
                  <td className={td}>{i.comment}</td>
                  <td className={td}>
                    <Badge tone={i.status === "POSTED" ? "green" : "amber"}>{docStatus(i.status === "POSTED")}</Badge>
                  </td>
                  <td className={`${td} text-right`}>{i.lines.length}</td>
                  <td className={`${td} text-right ${i.diffLines ? "text-red-600" : ""}`}>{i.diffLines}</td>
                </tr>
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
      </Allowed>
    </div>
  );
}
