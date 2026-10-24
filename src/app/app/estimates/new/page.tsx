import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { Card, Field, Input, PageTitle, Select } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { vehicleTitle } from "@/lib/format";
import { getClient, listClients } from "@/lib/services/clients";
import { createEstimateAction } from "../actions";
import { LiveForm } from "@/components/busy";

export default async function NewEstimatePage({ searchParams }: { searchParams: Promise<{ clientId?: string; q?: string }> }) {
  const s = await requireSession();
  const { clientId, q } = await searchParams;
  const client = clientId ? await getClient(s.companyId, clientId).catch(() => null) : null;

  if (!client) {
    const clients = await listClients(s.companyId, q);
    return (
      <div className="flex flex-col gap-4">
        <PageTitle>Новая калькуляция: выберите клиента</PageTitle>
        <Card>
          <LiveForm className="mb-3 flex gap-2">
            <Input name="q" defaultValue={q} placeholder="Имя, телефон, госномер или VIN" className="min-w-72" />
            <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Найти</button>
          </LiveForm>
          <ul className="flex flex-col divide-y text-sm">
            {clients.map((c) => (
              <li key={c.id} className="py-2">
                <Link href={`/app/estimates/new?clientId=${c.id}`} className="text-blue-600 hover:underline">
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

  return (
    <div className="flex flex-col gap-4">
      <PageTitle>Новая калькуляция</PageTitle>
      <Card title={client.name}>
        <ActionForm action={createEstimateAction} className="flex flex-wrap items-end gap-3">
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
          <Field label="Комментарий" className="min-w-64 flex-1">
            <Input name="comment" />
          </Field>
          <Submit>Создать</Submit>
        </ActionForm>
      </Card>
    </div>
  );
}
