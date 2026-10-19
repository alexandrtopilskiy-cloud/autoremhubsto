import Link from "next/link";
import { Card, PageTitle } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { vehicleTitle } from "@/lib/format";
import { APPOINTMENT_STAGES, appointmentStage, listAppointments, listWorkplaces, workplaceLoad } from "@/lib/services/appointments";
import { getCompany } from "@/lib/services/settings";
import {
  addDays,
  dateLabel,
  isDateStr,
  localDate,
  localMinutes,
  localTime,
  localToUtc,
  minutesToTime,
  todayLocal,
  weekdayLabel,
  weekStart,
} from "@/lib/time";
import { ScheduleTabs } from "./tabs";

const SLOT = 30; // минут в строке сетки
const ROW_PX = 40;

type Appt = Awaited<ReturnType<typeof listAppointments>>[number];

const who = (a: Appt) => a.client?.name ?? a.contactName ?? a.contactPhone ?? "Без клиента";

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ date?: string; view?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const company = await getCompany(s.companyId);
  const tz = company.utcOffset;
  const date = isDateStr(sp.date) ? sp.date : todayLocal(tz);
  const week = sp.view === "week";
  const from = week ? weekStart(date) : date;
  const days = week ? 7 : 1;
  const [workplaces, appts] = await Promise.all([
    listWorkplaces(s.companyId),
    listAppointments(s.companyId, localToUtc(from, "00:00", tz), localToUtc(addDays(from, days), "00:00", tz)),
  ]);
  const workMinutes = company.dayEnd - company.dayStart;
  const workday = (d: string) => ({
    start: localToUtc(d, minutesToTime(company.dayStart), tz),
    end: localToUtc(d, minutesToTime(company.dayEnd), tz),
  });
  const step = week ? 7 : 1;
  const nav = (d: string) => `/app/schedule?date=${d}${week ? "&view=week" : ""}`;

  return (
    <div className="flex flex-col gap-4">
      <PageTitle
        actions={
          <Link href={`/app/schedule/new?date=${date}`} className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Новая запись
          </Link>
        }
      >
        Запись на сервис
      </PageTitle>
      <div className="flex flex-wrap items-center gap-3">
        <ScheduleTabs active={week ? "week" : "day"} date={date} />
        <div className="flex items-center gap-1 text-sm">
          <Link href={nav(addDays(date, -step))} className="rounded border border-slate-300 bg-white px-2 py-1">
            ←
          </Link>
          <Link href={nav(todayLocal(tz))} className="rounded border border-slate-300 bg-white px-2 py-1">
            Сегодня
          </Link>
          <Link href={nav(addDays(date, step))} className="rounded border border-slate-300 bg-white px-2 py-1">
            →
          </Link>
          <span className="ml-2 font-medium">{week ? `${dateLabel(from)} — ${dateLabel(addDays(from, 6))}` : dateLabel(date)}</span>
        </div>
        <div className="ml-auto flex flex-wrap gap-1 text-xs">
          {APPOINTMENT_STAGES.map((x) => (
            <span key={x.value} className={`rounded border px-1.5 py-0.5 ${x.color}`}>
              {x.label}
            </span>
          ))}
        </div>
      </div>

      {workplaces.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">
            Постов пока нет. Добавьте их в <Link className="text-blue-600" href="/app/settings">настройках</Link>.
          </p>
        </Card>
      ) : week ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full table-fixed border-collapse text-xs">
              <thead>
                <tr>
                  <th className="w-32 border-b p-2 text-left text-slate-500">Пост</th>
                  {Array.from({ length: 7 }, (_, i) => addDays(from, i)).map((d) => (
                    <th key={d} className="border-b p-2 text-left font-medium">
                      <Link href={`/app/schedule?date=${d}`} className="hover:text-blue-600">
                        {weekdayLabel(d)} {d.slice(8)}.{d.slice(5, 7)}
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {workplaces.map((w) => (
                  <tr key={w.id} className="align-top">
                    <td className="border-b p-2 font-medium">{w.name}</td>
                    {Array.from({ length: 7 }, (_, i) => addDays(from, i)).map((d) => {
                      const list = appts.filter((a) => a.workplaceId === w.id && localDate(a.startAt, tz) === d);
                      return (
                        <td key={d} className="border-b border-l p-1">
                          <div className="flex flex-col gap-1">
                            {list.map((a) => (
                              <Link key={a.id} href={`/app/schedule/${a.id}`} className={`block truncate rounded border px-1 py-0.5 ${appointmentStage(a.stage).color}`}>
                                {localTime(a.startAt, tz)} {who(a)}
                              </Link>
                            ))}
                            <span className="text-slate-400">загрузка {workplaceLoad(appts, w.id, workday(d), workMinutes)}%</span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <div className="grid min-w-[640px]" style={{ gridTemplateColumns: `56px repeat(${workplaces.length}, minmax(160px, 1fr))` }}>
              <div />
              {workplaces.map((w) => (
                <div key={w.id} className="border-b p-2 text-sm font-medium">
                  {w.name}
                </div>
              ))}
              <div className="relative">
                {Array.from({ length: Math.ceil(workMinutes / SLOT) }, (_, i) => (
                  <div key={i} className="pr-1 text-right text-xs text-slate-400" style={{ height: ROW_PX }}>
                    {minutesToTime(company.dayStart + i * SLOT)}
                  </div>
                ))}
              </div>
              {workplaces.map((w) => (
                <div key={w.id} className="relative border-l" style={{ height: Math.ceil(workMinutes / SLOT) * ROW_PX }}>
                  {Array.from({ length: Math.ceil(workMinutes / SLOT) }, (_, i) => {
                    const start = company.dayStart + i * SLOT;
                    return (
                      <Link
                        key={i}
                        href={`/app/schedule/new?date=${date}&workplaceId=${w.id}&start=${minutesToTime(start)}&end=${minutesToTime(Math.min(start + 60, company.dayEnd))}`}
                        className="block border-b border-dashed border-slate-100 hover:bg-blue-50"
                        style={{ height: ROW_PX }}
                        title={`Записать на ${minutesToTime(start)}`}
                      />
                    );
                  })}
                  {appts
                    .filter((a) => a.workplaceId === w.id)
                    .map((a) => {
                      const top = Math.max(0, localMinutes(a.startAt, tz) - company.dayStart);
                      const bottom = Math.min(workMinutes, localMinutes(a.endAt, tz) - company.dayStart);
                      if (bottom <= 0 || top >= workMinutes) return null;
                      return (
                        <Link
                          key={a.id}
                          href={`/app/schedule/${a.id}`}
                          className={`absolute inset-x-1 overflow-hidden rounded border-l-4 px-1.5 py-0.5 text-xs shadow-sm ${appointmentStage(a.stage).color}`}
                          style={{ top: (top / SLOT) * ROW_PX + 1, height: Math.max(18, ((bottom - top) / SLOT) * ROW_PX - 2) }}
                        >
                          <b>
                            {localTime(a.startAt, tz)}–{localTime(a.endAt, tz)}
                          </b>{" "}
                          {who(a)}
                          {a.vehicle && <span className="block truncate">{vehicleTitle(a.vehicle)}</span>}
                          {a.reason && <span className="block truncate opacity-80">{a.reason}</span>}
                        </Link>
                      );
                    })}
                </div>
              ))}
              <div className="pt-2 text-right text-xs text-slate-500">Загрузка</div>
              {workplaces.map((w) => {
                const load = workplaceLoad(appts, w.id, workday(date), workMinutes);
                return (
                  <div key={w.id} className="border-l px-2 pt-2">
                    <div className="h-2 rounded bg-slate-100">
                      <div className={`h-2 rounded ${load > 85 ? "bg-red-500" : "bg-blue-500"}`} style={{ width: `${Math.min(100, load)}%` }} />
                    </div>
                    <span className="text-xs text-slate-600">{load}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
