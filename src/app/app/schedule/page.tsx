import Link from "next/link";
import { Card, PageTitle } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { vehicleTitle } from "@/lib/format";
import { APPOINTMENT_STAGES, appointmentStage, dayLoad, listAppointments, listWorkplaces, workplaceLoad } from "@/lib/services/appointments";
import { getCompany } from "@/lib/services/settings";
import {
  addDays,
  addMonths,
  dateLabel,
  isDateStr,
  localDate,
  localMinutes,
  localTime,
  localToUtc,
  minutesToTime,
  monthLabel,
  monthWeeks,
  todayLocal,
  weekdayLabel,
  weekStart,
} from "@/lib/time";
import { ScheduleTabs } from "./tabs";

const SLOT = 30; // минут в строке сетки
const ROW_PX = 40;

type Appt = Awaited<ReturnType<typeof listAppointments>>[number];

const who = (a: Appt) => a.client?.name ?? a.contactName ?? a.contactPhone ?? "Без клиента";
const SHOWN = 3; // записей в клетке месяца, остальные — «ещё N»

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ date?: string; view?: string; wp?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const company = await getCompany(s.companyId);
  const tz = company.utcOffset;
  const date = isDateStr(sp.date) ? sp.date : todayLocal(tz);
  const view = sp.view === "week" || sp.view === "month" ? sp.view : "day";
  const week = view === "week";
  const weeks = view === "month" ? monthWeeks(date) : [];
  const from = view === "month" ? weeks[0][0] : week ? weekStart(date) : date;
  const days = view === "month" ? weeks.length * 7 : week ? 7 : 1;
  const allPlaces = await listWorkplaces(s.companyId);
  // в месяце можно смотреть один пост
  const wp = view === "month" ? allPlaces.find((w) => w.id === sp.wp) : undefined;
  const workplaces = wp ? [wp] : allPlaces;
  const appts = await listAppointments(s.companyId, localToUtc(from, "00:00", tz), localToUtc(addDays(from, days), "00:00", tz), {
    workplaceId: wp?.id,
  });
  const workMinutes = company.dayEnd - company.dayStart;
  const workday = (d: string) => ({
    start: localToUtc(d, minutesToTime(company.dayStart), tz),
    end: localToUtc(d, minutesToTime(company.dayEnd), tz),
  });
  const shift = (n: number) => (view === "month" ? addMonths(date, n) : addDays(date, n * (week ? 7 : 1)));
  const nav = (d: string) => `/app/schedule?date=${d}${view !== "day" ? `&view=${view}` : ""}${wp ? `&wp=${wp.id}` : ""}`;
  const today = todayLocal(tz);

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
        <ScheduleTabs active={view} date={date} />
        <div className="flex items-center gap-1 text-sm">
          <Link href={nav(shift(-1))} className="rounded border border-slate-300 bg-white px-2 py-1">
            ←
          </Link>
          <Link href={nav(today)} className="rounded border border-slate-300 bg-white px-2 py-1">
            Сегодня
          </Link>
          <Link href={nav(shift(1))} className="rounded border border-slate-300 bg-white px-2 py-1">
            →
          </Link>
          <span className="ml-2 font-medium">
            {view === "month" ? monthLabel(date) : week ? `${dateLabel(from)} — ${dateLabel(addDays(from, 6))}` : dateLabel(date)}
          </span>
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
      ) : view === "month" ? (
        <Card>
          {allPlaces.length > 1 && (
            <form className="mb-3 flex items-center gap-2 text-sm">
              <input type="hidden" name="view" value="month" />
              <input type="hidden" name="date" value={date} />
              <select name="wp" defaultValue={wp?.id ?? ""} aria-label="Пост" className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5">
                <option value="">Все посты</option>
                {allPlaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              <button className="rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50">Показать</button>
            </form>
          )}
          <div className="overflow-x-auto">
            <div className="grid min-w-[720px] grid-cols-7 border-t border-l text-xs">
              {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => (
                <div key={d} className="border-r border-b bg-slate-50 p-1.5 font-medium text-slate-500">
                  {d}
                </div>
              ))}
              {weeks.flat().map((d) => {
                const list = appts.filter((a) => localDate(a.startAt, tz) === d);
                const load = dayLoad(appts, workplaces.map((w) => w.id), workday(d), workMinutes);
                const other = d.slice(0, 7) !== date.slice(0, 7);
                return (
                  <div key={d} className={`min-h-28 border-r border-b p-1 ${other ? "bg-slate-50 text-slate-400" : ""}`} data-date={d}>
                    <div className="mb-1 flex items-center justify-between gap-1">
                      <Link
                        href={`/app/schedule?date=${d}`}
                        className={`rounded px-1 font-medium hover:text-blue-600 ${d === today ? "bg-blue-600 text-white hover:text-white" : ""}`}
                      >
                        {Number(d.slice(8))}
                      </Link>
                      {list.length > 0 && (
                        <span className={load > 85 ? "text-red-600" : "text-slate-500"} title="Загрузка постов">
                          {load}%
                        </span>
                      )}
                    </div>
                    {list.length > 0 && (
                      <div className="mb-1 h-1 rounded bg-slate-100">
                        <div className={`h-1 rounded ${load > 85 ? "bg-red-500" : "bg-blue-500"}`} style={{ width: `${Math.min(100, load)}%` }} />
                      </div>
                    )}
                    <div className="flex flex-col gap-0.5">
                      {list.slice(0, SHOWN).map((a) => (
                        <Link key={a.id} href={`/app/schedule/${a.id}`} className={`block truncate rounded border px-1 py-0.5 ${appointmentStage(a.stage).color}`}>
                          {localTime(a.startAt, tz)} {who(a)}
                        </Link>
                      ))}
                      {list.length > SHOWN && (
                        <Link href={`/app/schedule?date=${d}`} className="px-1 text-blue-600 hover:underline">
                          ещё {list.length - SHOWN}
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
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
