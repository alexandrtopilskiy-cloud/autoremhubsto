import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { FilterSelect, ListFilters, Pager, PreviewHead, PreviewLink, PreviewRow, SortTh, WithPreview } from "@/components/list-view";
import { Card, NewPanel, PageTitle, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatDate, orderNo, vehicleTitle } from "@/lib/format";
import { listHref, parseListQuery } from "@/lib/list-query";
import { formatRub } from "@/lib/money";
import { CLIENT_KINDS } from "@/lib/services/clients";
import { CLIENT_FILTERS, CLIENT_SORTS, clientPreview, clientSources, searchClients, type ClientQuery } from "@/lib/services/lists";
import { stageLabel } from "@/lib/services/orders";
import { getCompany } from "@/lib/services/settings";
import { createClientAction } from "./actions";
import { ClientFields, ContactFields } from "./client-fields";
import { listCategories } from "@/lib/services/prices";
import { dicts } from "@/lib/services/dictionaries";

const PATH = "/app/clients";

async function Preview({ companyId, id, query }: { companyId: string; id: string; query: ClientQuery }) {
  const c = await clientPreview(companyId, id);
  if (!c) return null;
  return (
    <>
      <PreviewHead title={c.name} href={`/app/clients/${c.id}`} close={listHref(PATH, query, { preview: "" })} />
      <PreviewRow label="ID">{c.code}</PreviewRow>
      <PreviewRow label="Тип">{CLIENT_KINDS.find((k) => k.value === c.kind)?.label}</PreviewRow>
      <PreviewRow label="Телефон">{c.phone}</PreviewRow>
      <PreviewRow label="Email">{c.email}</PreviewRow>
      <PreviewRow label="ИНН">{c.inn}</PreviewRow>
      <PreviewRow label="Скидка">{c.discount ? `${c.discount}%` : null}</PreviewRow>
      <PreviewRow label="Откуда пришёл">{c.source}</PreviewRow>
      <PreviewRow label="Клиент с">{formatDate(c.createdAt)}</PreviewRow>
      <PreviewRow label="Комментарий">{c.comment}</PreviewRow>
      {c.vehicles.length > 0 && (
        <div className="mt-3 text-sm">
          <div className="mb-1 text-slate-500">Автомобили</div>
          <ul className="list-inside list-disc">
            {c.vehicles.map((v) => (
              <li key={v.id}>
                {vehicleTitle(v)}
                {v.vin && <span className="text-slate-500"> · {v.vin}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-3">
        <PreviewRow label="Заказ-нарядов">{c.orderCount}</PreviewRow>
        <PreviewRow label="Оплачено всего">{formatRub(c.spent)}</PreviewRow>
        <PreviewRow label="Долг">{c.due > 0 ? <span className="text-red-600">{formatRub(c.due)}</span> : "нет"}</PreviewRow>
      </div>
      {c.orders.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1 text-sm">
          {c.orders.map((o) => (
            <li key={o.id} className="flex justify-between gap-2">
              <Link href={`/app/orders/${o.id}`} className="text-blue-600 hover:underline">
                {orderNo(o.number)} от {formatDate(o.acceptedAt)}
              </Link>
              <span className="text-slate-500">
                {stageLabel(o.stage)} · {formatRub(o.totals.total)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default async function ClientsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireSession();
  const query = parseListQuery(await searchParams, { sorts: CLIENT_SORTS, sort: "name", dir: "asc", filters: CLIENT_FILTERS });
  const [lists, categories, company, sources] = await Promise.all([
    dicts(s.companyId, ["CLIENT_SOURCE"]),
    listCategories(s.companyId),
    getCompany(s.companyId),
    clientSources(s.companyId),
  ]);
  const list = await searchClients(s.companyId, query, company.utcOffset);
  return (
    <div className="flex flex-col gap-4">
      <PageTitle create="#new" createLabel="Новый клиент"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/app/excel" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50">
              Excel
            </Link>
            <Link href="/app/recommendations" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50">
              Рекомендации клиентам
            </Link>
          </div>
        }
      >
        Клиенты
      </PageTitle>
      <NewPanel>
        <Card title="Новый клиент">
          <ActionForm action={createClientAction} className="flex flex-col gap-3">
            <ClientFields categories={categories} sources={lists.CLIENT_SOURCE} nameHint="Пусто — из ФИО контакта" />
            <h3 className="mt-2 w-full font-semibold">Контакт</h3>
            <ContactFields prefix="c_" />
            <p className="w-full text-xs text-slate-500">
              ID клиенту и контакту присваиваются сами. Остальные контакты, банковские счета и автомобили добавляются в карточке.
            </p>
            <div>
              <Submit>Добавить</Submit>
            </div>
          </ActionForm>
        </Card>
      </NewPanel>
      <WithPreview panel={query.preview ? <Preview companyId={s.companyId} id={query.preview} query={query} /> : undefined}>
        <div>
          <ListFilters path={PATH} query={query} placeholder="Имя, телефон, ID, госномер, VIN, email или ИНН">
            <FilterSelect name="kind" label="Тип" value={query.f.kind} options={CLIENT_KINDS} />
            {sources.length > 0 && (
              <FilterSelect
                name="source"
                label="Откуда пришёл"
                value={query.f.source}
                options={[...sources.map((x) => ({ value: x, label: x })), { value: "none", label: "Не указано" }]}
              />
            )}
            <FilterSelect name="archived" label="Архив" value={query.f.archived} options={[{ value: "1", label: "Только архив" }]} />
          </ListFilters>
          <p className="-mt-1 mb-2 text-xs text-slate-500">Период — дата добавления клиента.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className={th} />
                  <SortTh path={PATH} query={query} sort="code">
                    ID
                  </SortTh>
                  <SortTh path={PATH} query={query} sort="name">
                    Клиент
                  </SortTh>
                  <th className={th}>Тип</th>
                  <th className={th}>Телефон</th>
                  <th className={th}>Автомобили</th>
                  <SortTh path={PATH} query={query} sort="created">
                    Добавлен
                  </SortTh>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((c) => (
                  <tr key={c.id} className={`border-b last:border-0 hover:bg-slate-50 ${query.preview === c.id ? "bg-blue-100" : ""}`}>
                    <td className={`${td} w-6`}>
                      <PreviewLink path={PATH} query={query} id={c.id} label={c.name} />
                    </td>
                    <td className={`${td} text-slate-500 tabular-nums`}>{c.code}</td>
                    <td className={td}>
                      <Link href={`/app/clients/${c.id}`} className="text-blue-600 hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td className={td}>{{ PERSON: "ФЛ", ENTREPRENEUR: "ИП", LEGAL: "ЮЛ" }[c.kind]}</td>
                    <td className={td}>{c.phone}</td>
                    <td className={td}>{c.vehicles.map((v) => [v.make, v.model, v.plate].filter(Boolean).join(" ")).join(", ")}</td>
                    <td className={td}>{formatDate(c.createdAt)}</td>
                  </tr>
                ))}
                {list.rows.length === 0 && (
                  <tr>
                    <td className={`${td} text-slate-500`} colSpan={7}>
                      Клиентов не найдено
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pager path={PATH} query={query} total={list.total} page={list.page} pages={list.pages} />
        </div>
      </WithPreview>
    </div>
  );
}
