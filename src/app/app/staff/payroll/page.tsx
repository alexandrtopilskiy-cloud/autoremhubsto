import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { Allowed } from "@/components/manager-only";
import { Card, Field, Input, PageTitle, Select, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { formatRub } from "@/lib/money";
import { listCashboxes } from "@/lib/services/cash";
import { monthPeriod, payroll } from "@/lib/services/payroll";
import { listOrganizations } from "@/lib/services/employees";
import { getCompany } from "@/lib/services/settings";
import { monthTitle, pageMonth } from "../month";
import { addPayrollEntryAction, deletePayrollEntryAction, payEmployeeAction } from "../payroll-actions";
import { StaffTabs } from "../tabs";

const money = (kop: number) => (kop / 100).toFixed(2).replace(".", ",");

/** 8.3 Расчёт зарплаты за месяц и 8.5 премии, удержания, выплата. */
export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ month?: string; org?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const company = await getCompany(s.companyId);
  const month = pageMonth(sp.month, company.utcOffset);
  const period = monthPeriod(month, company.utcOffset);
  const orgs = await listOrganizations(s.companyId);
  const org = orgs.some((o) => o.id === sp.org) ? sp.org : undefined;
  const [rows, entries, cashboxes] = await Promise.all([
    payroll(s.companyId, period, org),
    prisma.payrollEntry.findMany({
      where: { companyId: s.companyId, date: { gte: period.from, lt: period.to } },
      include: { employee: true },
      orderBy: { date: "asc" },
    }),
    listCashboxes(s.companyId),
  ]);
  const total = (k: "executor" | "manager" | "bonus" | "deduction" | "accrued" | "paid" | "balance") => rows.reduce((a, r) => a + r[k], 0);
  const employeeOptions = rows.map((r) => (
    <option key={r.employeeId} value={r.employeeId}>
      {r.name}
    </option>
  ));
  return (
    <div className="flex flex-col gap-4">
      <PageTitle>Сотрудники</PageTitle>
      <StaffTabs active="payroll" />
      <Allowed perms={s.perms} section="staff">
        <Card>
          <form className="mb-4 flex flex-wrap items-end gap-3">
            <Field label="Месяц">
              <Input type="month" name="month" defaultValue={month} />
            </Field>
            {orgs.length > 1 && (
              <Field label="Предприятие">
                <Select name="org" defaultValue={org ?? ""}>
                  <option value="">Все</option>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <button className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">Показать</button>
          </form>
          <h2 className="mb-2 font-semibold">Зарплата за {monthTitle(month)}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className={th}>Сотрудник</th>
                  <th className={`${th} text-right`}>За работы</th>
                  <th className={`${th} text-right`}>Как менеджер</th>
                  <th className={`${th} text-right`}>Премии</th>
                  <th className={`${th} text-right`}>Удержания</th>
                  <th className={`${th} text-right`}>Начислено</th>
                  {!org && <th className={`${th} text-right`}>Выплачено</th>}
                  {!org && <th className={`${th} text-right`}>К выплате</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.employeeId} className="border-b last:border-0">
                    <td className={td}>
                      <Link className="text-blue-600 hover:underline" href={`/app/staff/payroll/${r.employeeId}?month=${month}`}>
                        {r.name}
                      </Link>
                      {r.position && <span className="text-slate-500">, {r.position}</span>}
                    </td>
                    <td className={`${td} text-right whitespace-nowrap`}>{formatRub(r.executor)}</td>
                    <td className={`${td} text-right whitespace-nowrap`}>{formatRub(r.manager)}</td>
                    <td className={`${td} text-right whitespace-nowrap`}>{r.bonus ? formatRub(r.bonus) : ""}</td>
                    <td className={`${td} text-right whitespace-nowrap`}>{r.deduction ? formatRub(r.deduction) : ""}</td>
                    <td className={`${td} text-right font-medium whitespace-nowrap`}>{formatRub(r.accrued)}</td>
                    {!org && <td className={`${td} text-right whitespace-nowrap`}>{formatRub(r.paid)}</td>}
                    {!org && (
                      <td className={`${td} text-right font-medium whitespace-nowrap ${r.balance > 0 ? "text-red-600" : ""}`}>
                        {formatRub(r.balance)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t font-medium">
                  <td className={td}>Итого</td>
                  <td className={`${td} text-right whitespace-nowrap`}>{formatRub(total("executor"))}</td>
                  <td className={`${td} text-right whitespace-nowrap`}>{formatRub(total("manager"))}</td>
                  <td className={`${td} text-right whitespace-nowrap`}>{formatRub(total("bonus"))}</td>
                  <td className={`${td} text-right whitespace-nowrap`}>{formatRub(total("deduction"))}</td>
                  <td className={`${td} text-right whitespace-nowrap`}>{formatRub(total("accrued"))}</td>
                  {!org && <td className={`${td} text-right whitespace-nowrap`}>{formatRub(total("paid"))}</td>}
                  {!org && <td className={`${td} text-right whitespace-nowrap`}>{formatRub(total("balance"))}</td>}
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            За работы и как менеджер — по заказ-нарядам, проведённым в этом месяце, по схеме из карточки сотрудника. «К выплате» — всё
            начисленное минус всё выплаченное на конец месяца.
            {org && " С выбранным предприятием премии, удержания и выплаты не делятся, поэтому остаток не показан."}
          </p>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Премия или удержание">
            <ActionForm action={addPayrollEntryAction.bind(null, month)} reset className="flex flex-wrap items-end gap-3">
              <Field label="Сотрудник">
                <Select name="employeeId" defaultValue="">
                  <option value="">Выберите</option>
                  {employeeOptions}
                </Select>
              </Field>
              <Field label="Вид">
                <Select name="kind" defaultValue="BONUS">
                  <option value="BONUS">Премия</option>
                  <option value="DEDUCTION">Удержание</option>
                </Select>
              </Field>
              <Field label="Сумма, ₽">
                <Input name="amount" inputMode="decimal" className="w-28" required />
              </Field>
              <Field label="Основание" className="min-w-48 flex-1">
                <Input name="comment" />
              </Field>
              <Submit variant="ghost">Добавить</Submit>
            </ActionForm>
            {entries.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1 text-sm">
                {entries.map((e) => (
                  <li key={e.id} className="flex items-center gap-2">
                    <span className="text-slate-500">{formatDate(e.date)}</span>
                    <span>{e.employee.name}</span>
                    <b className={e.kind === "DEDUCTION" ? "text-red-600" : "text-green-700"}>
                      {e.kind === "DEDUCTION" ? "−" : "+"}
                      {formatRub(e.amount)}
                    </b>
                    {e.comment && <span className="text-slate-500">{e.comment}</span>}
                    <ActionForm action={deletePayrollEntryAction.bind(null, e.id)}>
                      <button className="text-red-600 hover:underline" title="Удалить">
                        ✕
                      </button>
                    </ActionForm>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Выдать зарплату">
            <ActionForm action={payEmployeeAction} reset className="flex flex-wrap items-end gap-3">
              <Field label="Сотрудник">
                <Select name="employeeId" defaultValue="">
                  <option value="">Выберите</option>
                  {rows.map((r) => (
                    <option key={r.employeeId} value={r.employeeId}>
                      {r.name}
                      {!org && r.balance > 0 ? ` (к выплате ${money(r.balance)})` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Касса">
                <Select name="cashboxId" defaultValue={cashboxes[0]?.id ?? ""}>
                  {cashboxes.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Сумма, ₽">
                <Input name="amount" inputMode="decimal" className="w-28" required />
              </Field>
              <Field label="Комментарий" className="min-w-48 flex-1">
                <Input name="comment" placeholder="аванс, расчёт за месяц…" />
              </Field>
              <Submit variant="ghost">Выдать</Submit>
            </ActionForm>
            <p className="mt-2 text-xs text-slate-500">Выплата проводится расходом из кассы по статье «Зарплата» сегодняшним днём.</p>
          </Card>
        </div>
      </Allowed>
    </div>
  );
}
