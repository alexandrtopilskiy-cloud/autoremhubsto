import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { Allowed } from "@/components/manager-only";
import { Badge, Card, Field, Input, NewPanel, PageTitle, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { formatRub } from "@/lib/money";
import { listWriteOffs } from "@/lib/services/warehouse";
import { docStatus } from "../product-select";
import { StockTabs } from "../tabs";
import { createWriteOffAction } from "../warehouse-actions";
import { dicts } from "@/lib/services/dictionaries";
import { DictList } from "@/components/dict-list";

export default async function WriteOffsPage() {
  const s = await requireSession();
  const lists = await dicts(s.companyId, ["WRITE_OFF_REASON"]);
  const list = await listWriteOffs(s.companyId);
  return (
    <div className="flex flex-col gap-4">
      <PageTitle create="#new" createLabel="Новое списание">Склад</PageTitle>
      <StockTabs active="writeoffs" />
      <Allowed perms={s.perms} section="stock">
        <NewPanel>
          <Card title="Новое списание">
            <ActionForm action={createWriteOffAction} className="flex flex-wrap items-end gap-3">
              <Field label="Причина">
                <Input name="reason" list="writeoff-reasons" className="w-64" />
              </Field>
              <DictList id="writeoff-reasons" items={lists.WRITE_OFF_REASON} />
              <Submit>Создать</Submit>
            </ActionForm>
          </Card>
        </NewPanel>
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className={th}>Номер</th>
                <th className={th}>Дата</th>
                <th className={th}>Причина</th>
                <th className={th}>Статус</th>
                <th className={`${th} text-right`}>Себестоимость</th>
              </tr>
            </thead>
            <tbody>
              {list.map((w) => (
                <tr key={w.id} className="border-b last:border-0">
                  <td className={td}>
                    <Link className="text-blue-600 hover:underline" href={`/app/stock/writeoffs/${w.id}`}>
                      СП-{w.number}
                    </Link>
                  </td>
                  <td className={td}>{formatDate(w.date)}</td>
                  <td className={td}>{w.reason}</td>
                  <td className={td}>
                    <Badge tone={w.status === "POSTED" ? "green" : "amber"}>{docStatus(w.status === "POSTED")}</Badge>
                  </td>
                  <td className={`${td} text-right whitespace-nowrap`}>{formatRub(w.cost)}</td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={5} className={`${td} text-slate-500`}>
                    Списаний пока нет
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
