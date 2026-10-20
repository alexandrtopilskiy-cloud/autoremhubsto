import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/form";
import { Allowed } from "@/components/manager-only";
import { Card, Field, Input, PageTitle, Select } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PAY_BASES } from "@/lib/pay-scheme";
import { updatePaySchemeAction } from "../payroll-actions";
import { StaffTabs } from "../tabs";

/** 8.2 Схема начисления зарплаты сотрудника. */
export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const e = await prisma.employee.findFirst({ where: { id, companyId: s.companyId } });
  if (!e) notFound();
  return (
    <div className="flex flex-col gap-4">
      <PageTitle>Сотрудники</PageTitle>
      <StaffTabs active="staff" />
      <Allowed perms={s.perms} section="staff">
        <h2 className="text-lg font-semibold">
          {e.name}
          {e.position && <span className="font-normal text-slate-500">, {e.position}</span>}
        </h2>
        <Card title="Схема начисления зарплаты">
          <ActionForm action={updatePaySchemeAction.bind(null, e.id)} className="flex flex-col gap-4">
            <fieldset className="flex flex-wrap items-end gap-3">
              <legend className="mb-2 text-sm font-medium">Как исполнитель работ</legend>
              <Field label="% от работ">
                <Input name="workPercent" type="number" min={0} max={100} defaultValue={e.workPercent} className="w-24" />
              </Field>
              <Field label="База">
                <Select name="workBase" defaultValue={e.workBase}>
                  {PAY_BASES.filter((b) => b.value !== "PROFIT").map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <p className="w-full text-xs text-slate-500">
                Для отдельных работ можно задать свой процент в{" "}
                <Link className="text-blue-600" href="/app/catalog/works">
                  справочнике работ
                </Link>
                , он заменит процент сотрудника.
              </p>
            </fieldset>
            <fieldset className="flex flex-wrap items-end gap-3">
              <legend className="mb-2 text-sm font-medium">Как менеджер заказ-нарядов</legend>
              <Field label="% от работ">
                <Input name="salesPercent" type="number" min={0} max={100} defaultValue={e.salesPercent} className="w-24" />
              </Field>
              <Field label="% от товаров">
                <Input
                  name="itemsPercent"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={e.itemsPercent ?? ""}
                  placeholder="как от работ"
                  className="w-32"
                />
              </Field>
              <Field label="База для товаров">
                <Select name="itemsBase" defaultValue={e.itemsBase}>
                  {PAY_BASES.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </fieldset>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="paidOnly" defaultChecked={e.paidOnly} /> начислять только по полностью оплаченным заказ-нарядам
            </label>
            <div>
              <Submit>Сохранить схему</Submit>
            </div>
          </ActionForm>
        </Card>
        <p className="text-sm">
          <Link className="text-blue-600 hover:underline" href={`/app/staff/payroll/${e.id}`}>
            Расчётный листок за текущий месяц
          </Link>
        </p>
      </Allowed>
    </div>
  );
}
