import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/form";
import { Card, PageTitle } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { orderNo } from "@/lib/format";
import { APPOINTMENT_STAGES, getAppointment, listWorkplaces } from "@/lib/services/appointments";
import { listClients } from "@/lib/services/clients";
import { listEmployees } from "@/lib/services/employees";
import { getCompany } from "@/lib/services/settings";
import { dateLabel, localDate, localTime } from "@/lib/time";
import { createOrderFromAppointmentAction, setAppointmentStageAction, updateAppointmentAction } from "../actions";
import { AppointmentFields } from "../appointment-fields";

export default async function AppointmentPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const a = await getAppointment(s.companyId, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [company, workplaces, clients, employees] = await Promise.all([
    getCompany(s.companyId),
    listWorkplaces(s.companyId, { all: true }),
    listClients(s.companyId),
    listEmployees(s.companyId),
  ]);
  const tz = company.utcOffset;
  const date = localDate(a.startAt, tz);
  return (
    <div className="flex flex-col gap-4">
      <PageTitle
        actions={
          a.order ? (
            <Link href={`/app/orders/${a.order.id}`} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50">
              Открыть {orderNo(a.order.number)}
            </Link>
          ) : a.stage !== "CANCELLED" ? (
            <ActionForm action={createOrderFromAppointmentAction.bind(null, a.id)}>
              <Submit>Создать заказ-наряд</Submit>
            </ActionForm>
          ) : null
        }
      >
        Запись на {dateLabel(date)}, {localTime(a.startAt, tz)}–{localTime(a.endAt, tz)} · {a.workplace.name}
      </PageTitle>
      <div className="flex flex-wrap gap-1">
        {APPOINTMENT_STAGES.map((x) => (
          <ActionForm key={x.value} action={setAppointmentStageAction.bind(null, a.id, x.value)}>
            <button className={`rounded-full border px-3 py-1 text-sm ${a.stage === x.value ? `${x.color} font-semibold ring-2 ring-offset-1` : "border-slate-300 bg-white"}`}>
              {x.label}
            </button>
          </ActionForm>
        ))}
      </div>
      <Card title="Запись">
        <ActionForm action={updateAppointmentAction.bind(null, a.id)} className="flex flex-wrap items-end gap-3">
          <AppointmentFields
            workplaces={workplaces}
            clients={clients}
            employees={employees}
            d={{
              workplaceId: a.workplaceId,
              date,
              start: localTime(a.startAt, tz),
              end: localTime(a.endAt, tz),
              clientId: a.clientId,
              vehicleId: a.vehicleId,
              contactName: a.contactName,
              contactPhone: a.contactPhone,
              reason: a.reason,
              amount: a.amount,
              masterId: a.masterId,
            }}
          />
          <Submit variant="ghost">Сохранить</Submit>
        </ActionForm>
      </Card>
      <Link href={`/app/schedule?date=${date}`} className="text-sm text-blue-600">
        ← К календарю на {dateLabel(date)}
      </Link>
    </div>
  );
}
