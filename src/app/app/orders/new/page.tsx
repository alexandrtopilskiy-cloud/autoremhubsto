import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { Card, Field, Input, PageTitle, Select } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { vehicleTitle } from "@/lib/format";
import { getClient, listClients } from "@/lib/services/clients";
import { listEmployees } from "@/lib/services/employees";
import { createOrderAction } from "../actions";
import { dicts } from "@/lib/services/dictionaries";
import { DictList } from "@/components/dict-list";

export default async function NewOrderPage({ searchParams }: { searchParams: Promise<{ clientId?: string; q?: string }> }) {
  const s = await requireSession();
  const lists = await dicts(s.companyId, ["REPAIR_KIND"]);
  const { clientId, q } = await searchParams;
  const client = clientId ? await getClient(s.companyId, clientId).catch(() => null) : null;

  if (!client) {
    const clients = await listClients(s.companyId, q);
    return (
      <div className="flex flex-col gap-4">
        <PageTitle>Новый заказ-наряд: выберите клиента</PageTitle>
        <Card>
          <form className="mb-3 flex gap-2">
            <Input name="q" defaultValue={q} placeholder="Имя, телефон, госномер или VIN" className="min-w-72" />
            <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Найти</button>
          </form>
          <ul className="flex flex-col divide-y text-sm">
            {clients.map((c) => (
              <li key={c.id} className="py-2">
                <Link href={`/app/orders/new?clientId=${c.id}`} className="text-blue-600 hover:underline">
                  {c.name}
                </Link>
                <span className="text-slate-500"> {c.phone} {c.vehicles.map(vehicleTitle).join(", ")}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-slate-600">
            Нет в списке? <Link href="/app/clients" className="text-blue-600">Добавьте клиента</Link>
          </p>
        </Card>
      </div>
    );
  }

  const employees = await listEmployees(s.companyId);
  return (
    <div className="flex flex-col gap-4">
      <PageTitle>Новый заказ-наряд</PageTitle>
      <Card title={client.name}>
        <ActionForm action={createOrderAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="clientId" value={client.id} />
          <Field label="Автомобиль">
            <Select name="vehicleId" defaultValue={client.vehicles[0]?.id ?? ""}>
              <option value="">Без автомобиля</option>
              {client.vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {vehicleTitle(v)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Пробег, км">
            <Input name="mileage" type="number" min={0} className="w-32" />
          </Field>
          <Field label="Менеджер">
            <Select name="managerId" defaultValue="">
              <option value="">Не указан</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Причина обращения" className="w-full">
            <Input name="reason" list="repair-kinds" />
            <DictList id="repair-kinds" items={lists.REPAIR_KIND} />
          </Field>
          <Submit>Создать</Submit>
        </ActionForm>
      </Card>
    </div>
  );
}
