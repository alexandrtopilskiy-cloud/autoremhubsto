import { ActionForm, Submit } from "@/components/form";
import { Card, PageTitle } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { listWorkplaces } from "@/lib/services/appointments";
import { listClients } from "@/lib/services/clients";
import { listEmployees } from "@/lib/services/employees";
import { getCompany } from "@/lib/services/settings";
import { isDateStr, isTimeStr, todayLocal } from "@/lib/time";
import { createAppointmentAction } from "../actions";
import { AppointmentFields } from "../appointment-fields";
import { dicts } from "@/lib/services/dictionaries";

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; workplaceId?: string; start?: string; end?: string; clientId?: string }>;
}) {
  const s = await requireSession();
  const lists = await dicts(s.companyId, ["REPAIR_KIND"]);
  const sp = await searchParams;
  const company = await getCompany(s.companyId);
  const [workplaces, clients, employees] = await Promise.all([
    listWorkplaces(s.companyId),
    listClients(s.companyId),
    listEmployees(s.companyId),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <PageTitle>Новая запись</PageTitle>
      <Card>
        <ActionForm action={createAppointmentAction} className="flex flex-wrap items-end gap-3">
          <AppointmentFields
            reasons={lists.REPAIR_KIND}
            workplaces={workplaces}
            clients={clients}
            employees={employees}
            d={{
              date: isDateStr(sp.date) ? sp.date : todayLocal(company.utcOffset),
              workplaceId: sp.workplaceId,
              start: isTimeStr(sp.start) ? sp.start : undefined,
              end: isTimeStr(sp.end) ? sp.end : undefined,
              clientId: sp.clientId,
            }}
          />
          <Submit>Записать</Submit>
        </ActionForm>
        <p className="mt-3 text-xs text-slate-500">
          Выберите клиента из базы или впишите имя и телефон нового: карточка клиента создастся, когда по записи откроют заказ-наряд.
        </p>
      </Card>
    </div>
  );
}
