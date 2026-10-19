import Link from "next/link";
import type { AppointmentStage } from "@prisma/client";
import { Card, Field, Input, PageTitle, Select, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { orderNo, vehicleTitle } from "@/lib/format";
import { formatRub } from "@/lib/money";
import { APPOINTMENT_STAGES, appointmentStage, listAppointments, listWorkplaces } from "@/lib/services/appointments";
import { getCompany } from "@/lib/services/settings";
import { addDays, dateLabel, isDateStr, localDate, localTime, localToUtc, todayLocal } from "@/lib/time";
import { ScheduleTabs } from "../tabs";

export default async function AppointmentListPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; stage?: string; post?: string }>;
}) {
  const s = await requireSession();
  const sp = await searchParams;
  const company = await getCompany(s.companyId);
  const tz = company.utcOffset;
  const from = isDateStr(sp.from) ? sp.from : todayLocal(tz);
  const to = isDateStr(sp.to) ? sp.to : addDays(from, 6);
  const stage = APPOINTMENT_STAGES.some((x) => x.value === sp.stage) ? (sp.stage as AppointmentStage) : undefined;
  const [workplaces, rows] = await Promise.all([
    listWorkplaces(s.companyId, { all: true }),
    listAppointments(s.companyId, localToUtc(from, "00:00", tz), localToUtc(addDays(to, 1), "00:00", tz), {
      stage,
      workplaceId: sp.post || undefined,
    }),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <PageTitle>Запись на сервис</PageTitle>
      <ScheduleTabs active="list" date={from} />
      <Card>
        <form className="mb-3 flex flex-wrap items-end gap-2">
          <Field label="С">
            <Input type="date" name="from" defaultValue={from} />
          </Field>
          <Field label="По">
            <Input type="date" name="to" defaultValue={to} />
          </Field>
          <Field label="Этап">
            <Select name="stage" defaultValue={stage ?? ""}>
              <option value="">Все</option>
              {APPOINTMENT_STAGES.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Пост">
            <Select name="post" defaultValue={sp.post ?? ""}>
              <option value="">Все</option>
              {workplaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </Field>
          <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Показать</button>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className={th}>Когда</th>
                <th className={th}>Пост</th>
                <th className={th}>Клиент</th>
                <th className={th}>Автомобиль</th>
                <th className={th}>Причина</th>
                <th className={th}>Этап</th>
                <th className={`${th} text-right`}>Сумма</th>
                <th className={th}>Заказ-наряд</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className={`${td} whitespace-nowrap`}>
                    <Link href={`/app/schedule/${a.id}`} className="text-blue-600 hover:underline">
                      {dateLabel(localDate(a.startAt, tz))}, {localTime(a.startAt, tz)}–{localTime(a.endAt, tz)}
                    </Link>
                  </td>
                  <td className={td}>{a.workplace.name}</td>
                  <td className={td}>
                    {a.client?.name ?? a.contactName} <span className="text-slate-500">{a.client?.phone ?? a.contactPhone}</span>
                  </td>
                  <td className={td}>{a.vehicle ? vehicleTitle(a.vehicle) : ""}</td>
                  <td className={td}>{a.reason}</td>
                  <td className={td}>
                    <span className={`rounded border px-1.5 py-0.5 text-xs ${appointmentStage(a.stage).color}`}>{appointmentStage(a.stage).label}</span>
                  </td>
                  <td className={`${td} text-right whitespace-nowrap`}>{a.amount ? formatRub(a.amount) : ""}</td>
                  <td className={td}>
                    {a.order && (
                      <Link href={`/app/orders/${a.order.id}`} className="text-blue-600 hover:underline">
                        {orderNo(a.order.number)}
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className={`${td} text-slate-500`}>
                    Записей за период нет
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
