import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/app/app/orders/[id]/print/print-button";
import { Allowed } from "@/components/manager-only";
import { requireSession } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { formatDate, orderNo } from "@/lib/format";
import { formatRub } from "@/lib/money";
import { monthPeriod, payslip } from "@/lib/services/payroll";
import { getCompany } from "@/lib/services/settings";
import { monthTitle, pageMonth } from "../../month";

/** Расчётный листок сотрудника за месяц. */
export default async function PayslipPage({
  params,
  searchParams,
}: {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const s = await requireSession();
  const { employeeId } = await params;
  const company = await getCompany(s.companyId);
  const month = pageMonth((await searchParams).month, company.utcOffset);
  const slip = await payslip(s.companyId, employeeId, monthPeriod(month, company.utcOffset)).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const t = slip.totals;
  const cell = "border border-slate-400 px-2 py-1";
  return (
    <Allowed perms={s.perms} section="staff">
      <div className="mx-auto max-w-3xl bg-white p-8 text-sm print:p-0">
        <div className="mb-4 flex justify-between print:hidden">
          <Link className="text-blue-600 hover:underline" href={`/app/staff/payroll?month=${month}`}>
            ← К расчёту зарплаты
          </Link>
          <PrintButton />
        </div>
        <p className="font-semibold">{s.companyName}</p>
        <h1 className="my-4 text-center text-lg font-bold">Расчётный листок за {monthTitle(month)}</h1>
        <p className="mb-4">
          Сотрудник: <b>{slip.employee.name}</b>
          {slip.employee.position && `, ${slip.employee.position}`}
        </p>
        {slip.lines.length > 0 && (
          <table className="mb-4 w-full border-collapse">
            <thead>
              <tr>
                <th className={cell}>Документ</th>
                <th className={cell}>Дата</th>
                <th className={`${cell} text-left`}>Основание</th>
                <th className={cell}>База</th>
                <th className={cell}>%</th>
                <th className={cell}>Начислено</th>
              </tr>
            </thead>
            <tbody>
              {slip.lines.map((l, i) => (
                <tr key={i}>
                  <td className={cell}>
                    <Link className="text-blue-600 print:text-inherit" href={`/app/orders/${l.orderId}`}>
                      {orderNo(l.number)}
                    </Link>
                  </td>
                  <td className={cell}>{formatDate(l.closedAt)}</td>
                  <td className={cell}>{l.title}</td>
                  <td className={`${cell} text-right whitespace-nowrap`}>{formatRub(l.base)}</td>
                  <td className={`${cell} text-right`}>{l.percent ?? "по схеме"}</td>
                  <td className={`${cell} text-right whitespace-nowrap`}>{formatRub(l.reward)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {slip.entries.length > 0 && (
          <ul className="mb-4">
            {slip.entries.map((e) => (
              <li key={e.id}>
                {formatDate(e.date)} · {e.kind === "BONUS" ? "Премия" : "Удержание"} {formatRub(e.amount)}
                {e.comment && `, ${e.comment}`}
              </li>
            ))}
          </ul>
        )}
        {slip.payouts.length > 0 && (
          <ul className="mb-4">
            {slip.payouts.map((p) => (
              <li key={p.id}>
                {formatDate(p.date)} · Выплачено {formatRub(-p.amount)} ({p.cashbox.name})
              </li>
            ))}
          </ul>
        )}
        {t && (
          <div className="ml-auto w-80">
            {[
              ["За работы", t.executor],
              ["Как менеджер", t.manager],
              ["Премии", t.bonus],
              ["Удержания", -t.deduction || 0],
            ].map(([label, v]) => (
              <div key={label} className="flex justify-between">
                <span>{label}</span>
                <span>{formatRub(v as number)}</span>
              </div>
            ))}
            <div className="flex justify-between border-t pt-1">
              <span>Начислено за месяц</span>
              <b>{formatRub(t.accrued)}</b>
            </div>
            <div className="flex justify-between">
              <span>Выплачено за месяц</span>
              <span>{formatRub(t.paid)}</span>
            </div>
            <div className="flex justify-between">
              <span>К выплате на конец месяца</span>
              <b>{formatRub(t.balance)}</b>
            </div>
          </div>
        )}
        <div className="mt-12 grid grid-cols-2 gap-8">
          <div className="border-t border-slate-400 pt-1 text-slate-600">Руководитель</div>
          <div className="border-t border-slate-400 pt-1 text-slate-600">Сотрудник</div>
        </div>
      </div>
    </Allowed>
  );
}
