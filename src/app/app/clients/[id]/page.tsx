import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/form";
import { Badge, Card, Field, Input, PageTitle, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { formatDate, orderNo, vehicleTitle } from "@/lib/format";
import { getClient } from "@/lib/services/clients";
import { stageLabel } from "@/lib/services/orders";
import { listRecommendations } from "@/lib/services/recommendations";
import { formatRub } from "@/lib/money";
import { addVehicleAction, archiveClientAction, updateClientAction } from "../actions";
import { ClientFields } from "../client-fields";
import { listCategories } from "@/lib/services/prices";
import { dicts } from "@/lib/services/dictionaries";
import { DictList } from "@/components/dict-list";
import { VinField } from "@/components/vin-field";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const lists = await dicts(s.companyId, ["COLOR", "CLIENT_SOURCE"]);
  const categories = await listCategories(s.companyId);
  const { id } = await params;
  const client = await getClient(s.companyId, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const recs = await listRecommendations(s.companyId, { clientId: client.id, status: "OPEN" });
  return (
    <div className="flex flex-col gap-4">
      <PageTitle
        actions={
          <div className="flex gap-2">
            <Link
              href={`/app/estimates/new?clientId=${client.id}`}
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
            >
              Калькуляция
            </Link>
            <Link
              href={`/app/orders/new?clientId=${client.id}`}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Новый заказ-наряд
            </Link>
            <form action={archiveClientAction.bind(null, client.id, !client.archived)}>
              <button className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">
                {client.archived ? "Вернуть из архива" : "В архив"}
              </button>
            </form>
          </div>
        }
      >
        {client.name} {client.archived && <Badge>в архиве</Badge>}
      </PageTitle>

      <Card title="Данные клиента">
        <ActionForm action={updateClientAction.bind(null, client.id)} className="flex flex-wrap items-end gap-3">
          <ClientFields c={client} categories={categories} sources={lists.CLIENT_SOURCE} />
          <Submit>Сохранить</Submit>
        </ActionForm>
      </Card>

      <Card title="Автомобили">
        {client.vehicles.length > 0 && (
          <ul className="mb-4 flex flex-col gap-1 text-sm">
            {client.vehicles.map((v) => (
              <li key={v.id}>
                <span className="font-medium">{vehicleTitle(v)}</span>
                {v.vin && <span className="text-slate-500"> · VIN {v.vin}</span>}
                {v.color && <span className="text-slate-500"> · {v.color}</span>}
              </li>
            ))}
          </ul>
        )}
        <p className="mb-2 text-xs text-slate-500">Введите VIN первым: марка и год подставятся сами, модель укажите вручную.</p>
        <ActionForm action={addVehicleAction.bind(null, client.id)} reset className="flex flex-wrap items-start gap-3">
          <VinField />
          <Field label="Марка">
            <Input name="make" required />
          </Field>
          <Field label="Модель">
            <Input name="model" required />
          </Field>
          <Field label="Год">
            <Input name="year" type="number" min={1900} max={2100} className="w-24" />
          </Field>
          <Field label="Госномер">
            <Input name="plate" className="w-32" />
          </Field>
          <Field label="Цвет">
            <Input name="color" list="car-colors" className="w-28" />
            <DictList id="car-colors" items={lists.COLOR} />
          </Field>
          <div className="self-end pb-5">
            <Submit variant="ghost">Добавить автомобиль</Submit>
          </div>
        </ActionForm>
      </Card>

      <Card title="История заказ-нарядов">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className={th}>Номер</th>
              <th className={th}>Дата</th>
              <th className={th}>Автомобиль</th>
              <th className={th}>Стадия</th>
            </tr>
          </thead>
          <tbody>
            {client.workOrders.map((o) => (
              <tr key={o.id} className="border-b last:border-0">
                <td className={td}>
                  <Link className="text-blue-600 hover:underline" href={`/app/orders/${o.id}`}>
                    {orderNo(o.number)}
                  </Link>
                </td>
                <td className={td}>{formatDate(o.acceptedAt)}</td>
                <td className={td}>{o.vehicle ? vehicleTitle(o.vehicle) : ""}</td>
                <td className={td}>{stageLabel(o.stage)}</td>
              </tr>
            ))}
            {client.workOrders.length === 0 && (
              <tr>
                <td colSpan={4} className={`${td} text-slate-500`}>
                  Заказ-нарядов пока нет
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {recs.length > 0 && (
        <Card title={`Невыполненные рекомендации · ${recs.length}`}>
          <ul className="flex flex-col gap-1 text-sm">
            {recs.map((r) => (
              <li key={r.id}>
                {formatDate(r.createdAt)} · {r.vehicle ? `${vehicleTitle(r.vehicle)} · ` : ""}
                <b>{r.name}</b>
                {r.price > 0 && ` · ${formatRub(Math.round(Number(r.qty) * r.price))}`}
                {r.order && (
                  <Link href={`/app/orders/${r.order.id}`} className="text-blue-600 hover:underline">
                    {" "}
                    · из {orderNo(r.order.number)}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
