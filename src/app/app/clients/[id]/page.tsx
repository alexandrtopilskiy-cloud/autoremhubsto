import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/form";
import { Badge, Card, PageTitle, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { formatDate, orderNo, vehicleTitle } from "@/lib/format";
import { MAX_BANK_ACCOUNTS, MAX_CONTACTS } from "@/lib/client-codes";
import { CLIENT_KINDS, getClient } from "@/lib/services/clients";
import { stageLabel } from "@/lib/services/orders";
import { listRecommendations } from "@/lib/services/recommendations";
import { formatRub } from "@/lib/money";
import {
  addBankAccountAction,
  addContactAction,
  addVehicleAction,
  archiveClientAction,
  deleteBankAccountAction,
  deleteContactAction,
  updateBankAccountAction,
  updateClientAction,
  updateContactAction,
  updateVehicleAction,
} from "../actions";
import { BankAccountFields, ClientFields, ContactFields, VehicleFields } from "../client-fields";
import { listCategories } from "@/lib/services/prices";
import { dicts } from "@/lib/services/dictionaries";
import { carModelsByMake } from "@/lib/services/car-catalog";

/** Вкладки карточки; выбранная хранится в адресе (?tab=), чтобы после сохранения форм оставаться на ней. */
const TABS = [
  { key: "main", label: "Основное" },
  { key: "contacts", label: "Контакты" },
  { key: "bank", label: "Банковские счета" },
  { key: "cars", label: "Автомобили" },
  { key: "history", label: "История заказ-нарядов" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const del = "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600 hover:border-red-300 hover:text-red-700";

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; car?: string }>;
}) {
  const s = await requireSession();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const tab: Tab = TABS.find((x) => x.key === sp.tab)?.key ?? "main";
  const [lists, categories, carCatalog] = await Promise.all([
    dicts(s.companyId, ["COLOR", "CLIENT_SOURCE"]),
    listCategories(s.companyId),
    carModelsByMake(s.companyId),
  ]);
  const client = await getClient(s.companyId, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const recs = await listRecommendations(s.companyId, { clientId: client.id, status: "OPEN" });
  const counts: Partial<Record<Tab, number>> = {
    contacts: client.contacts.length,
    bank: client.bankAccounts.length,
    cars: client.vehicles.length,
    history: client.workOrders.length,
  };
  const href = (t: Tab, extra = "") => `/app/clients/${client.id}?tab=${t}${extra}`;
  const car = sp.car === "new" ? null : (client.vehicles.find((v) => v.id === sp.car) ?? client.vehicles[0] ?? null);
  const kind = CLIENT_KINDS.find((k) => k.value === client.kind);

  return (
    <div className="flex flex-col gap-4">
      <PageTitle tab={client.name}
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
        {client.name}{" "}
        <span className="text-sm font-normal text-slate-500">
          {kind?.label}
          {client.code && ` · ID ${client.code}`}
        </span>{" "}
        {client.archived && <Badge>в архиве</Badge>}
      </PageTitle>

      <nav className="flex flex-wrap gap-x-6 gap-y-1 border-b border-slate-200">
        {TABS.map((x) => (
          <Link
            key={x.key}
            href={href(x.key)}
            scroll={false}
            className={`-mb-px flex items-center gap-1.5 border-b-2 py-2 text-[15px] ${x.key === tab ? "border-blue-500 font-medium text-blue-600" : "border-transparent text-slate-600 hover:text-blue-600"}`}
          >
            {x.label}
            {!!counts[x.key] && <span className="rounded-full bg-slate-100 px-1.5 text-xs font-medium text-slate-600">{counts[x.key]}</span>}
          </Link>
        ))}
      </nav>

      {tab === "main" && (
        <ActionForm action={updateClientAction.bind(null, client.id)} className="flex flex-col gap-3">
          <ClientFields c={client} categories={categories} sources={lists.CLIENT_SOURCE} />
          <div>
            <Submit>Сохранить</Submit>
          </div>
        </ActionForm>
      )}

      {tab === "contacts" && (
        <div className="flex flex-col gap-3">
          {client.contacts.map((c, i) => (
            <Card key={c.id} title={`${i === 0 ? "Основной контакт" : `Контакт ${i + 1}`}${c.code ? ` · ID ${c.code}` : ""}`}>
              <ActionForm action={updateContactAction.bind(null, client.id, c.id)} className="flex flex-col gap-3">
                <ContactFields c={c} />
                <div className="flex gap-2">
                  <Submit variant="ghost">Сохранить</Submit>
                </div>
              </ActionForm>
              <form action={deleteContactAction.bind(null, client.id, c.id)} className="mt-2">
                <button className={del}>Удалить контакт</button>
              </form>
            </Card>
          ))}
          {client.contacts.length < MAX_CONTACTS ? (
            <Card title="Новый контакт">
              <ActionForm action={addContactAction.bind(null, client.id)} reset className="flex flex-col gap-3">
                <ContactFields />
                <div>
                  <Submit>Добавить контакт</Submit>
                </div>
              </ActionForm>
            </Card>
          ) : (
            <p className="text-sm text-slate-500">У клиента {MAX_CONTACTS} контактов, больше добавить нельзя.</p>
          )}
          <p className="text-xs text-slate-500">
            Телефон первого контакта виден в списке клиентов. Искать клиента можно по телефону любого контакта. Пустая фамилия
            заполняется из имени.
          </p>
        </div>
      )}

      {tab === "bank" && (
        <div className="flex flex-col gap-3">
          {client.bankAccounts.map((b, i) => (
            <Card key={b.id} title={`Счёт ${i + 1}${b.code ? ` · ID ${b.code}` : ""}`}>
              <ActionForm action={updateBankAccountAction.bind(null, client.id, b.id)} className="flex flex-col gap-3">
                <BankAccountFields b={b} />
                <div>
                  <Submit variant="ghost">Сохранить</Submit>
                </div>
              </ActionForm>
              <form action={deleteBankAccountAction.bind(null, client.id, b.id)} className="mt-2">
                <button className={del}>Удалить счёт</button>
              </form>
            </Card>
          ))}
          {client.bankAccounts.length < MAX_BANK_ACCOUNTS ? (
            <Card title="Новый банковский счёт">
              <ActionForm action={addBankAccountAction.bind(null, client.id)} reset className="flex flex-col gap-3">
                <BankAccountFields />
                <div>
                  <Submit>Добавить счёт</Submit>
                </div>
              </ActionForm>
            </Card>
          ) : (
            <p className="text-sm text-slate-500">У клиента {MAX_BANK_ACCOUNTS} счёта, больше добавить нельзя.</p>
          )}
        </div>
      )}

      {tab === "cars" && (
        <div className="flex flex-col gap-4">
          {client.vehicles.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b">
                    <th className={th}>Автомобиль</th>
                    <th className={th}>Госномер</th>
                    <th className={th}>VIN</th>
                    <th className={th}>Двигатель</th>
                    <th className={th}>Примечание</th>
                    <th className={th}>ID</th>
                  </tr>
                </thead>
                <tbody>
                  {client.vehicles.map((v) => (
                    <tr key={v.id} className={`border-b last:border-0 ${car?.id === v.id ? "bg-blue-100" : "hover:bg-slate-50"}`}>
                      <td className={td}>
                        <Link href={href("cars", `&car=${v.id}`)} scroll={false} className="text-blue-600 hover:underline">
                          {vehicleTitle(v)}
                        </Link>
                      </td>
                      <td className={td}>{v.plate}</td>
                      <td className={`${td} font-mono`}>{v.vin}</td>
                      <td className={td}>
                        {[v.engineCode, v.engineType, v.engineVolume && `${v.engineVolume} л`, v.power && `${v.power} л.с.`]
                          .filter(Boolean)
                          .join(" · ")}
                      </td>
                      <td className={td}>{v.note}</td>
                      <td className={`${td} text-slate-500`}>{v.code}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {car ? (
            <Card
              title={`${vehicleTitle(car)}`}
              actions={
                <Link href={href("cars", "&car=new")} scroll={false} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50">
                  + Добавить автомобиль
                </Link>
              }
            >
              <ActionForm key={car.id} action={updateVehicleAction.bind(null, client.id, car.id)} className="flex flex-col gap-3">
                <VehicleFields v={car} colors={lists.COLOR} catalog={carCatalog} />
                <div>
                  <Submit>Сохранить автомобиль</Submit>
                </div>
              </ActionForm>
            </Card>
          ) : (
            <Card title="Новый автомобиль">
              <p className="mb-3 text-xs text-slate-500">Введите VIN первым: марка и год подставятся сами. Модель выберите из справочника — кузов, двигатель, трансмиссия и привод подскажутся по ней.</p>
              <ActionForm action={addVehicleAction.bind(null, client.id)} reset className="flex flex-col gap-3">
                <VehicleFields colors={lists.COLOR} catalog={carCatalog} />
                <div>
                  <Submit>Добавить автомобиль</Submit>
                </div>
              </ActionForm>
            </Card>
          )}
        </div>
      )}

      {tab === "history" && (
        <>
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
        </>
      )}
    </div>
  );
}
