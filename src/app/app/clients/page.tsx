import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { FilterSelect, Pager, PreviewRow, SortTh } from "@/components/list-view";
import { Card, NewPanel, PageTitle, Select, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatDate, orderNo, vehicleTitle } from "@/lib/format";
import { listHref, parseListQuery, PER_PAGE } from "@/lib/list-query";
import { formatRub } from "@/lib/money";
import { CLIENT_KINDS, contactName } from "@/lib/services/clients";
import { CLIENT_FILTERS, CLIENT_SORTS, clientPreview, clientSources, searchClients } from "@/lib/services/lists";
import { stageLabel } from "@/lib/services/orders";
import { createClientAction } from "./actions";
import { ClientFields, ContactFields } from "./client-fields";
import { ClientRow, PreviewPane, SearchBox } from "./list-client";
import { listCategories } from "@/lib/services/prices";
import { dicts } from "@/lib/services/dictionaries";

const PATH = "/app/clients";
const FORM = "client-filters";

const KIND_SHORT = { PERSON: "ФЛ", ENTREPRENEUR: "ИП", LEGAL: "ЮЛ" } as const;

async function Preview({ companyId, id }: { companyId: string; id: string }) {
  const c = await clientPreview(companyId, id);
  if (!c) return <p className="text-sm text-slate-500">Клиент не найден.</p>;
  const discounts = [c.partsDiscount && `товары ${c.partsDiscount}%`, c.discount && `работы ${c.discount}%`].filter(Boolean).join(", ");
  return (
    <>
      <div className="mb-3 flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{c.name}</h2>
        <span className="text-sm text-slate-500">
          {CLIENT_KINDS.find((k) => k.value === c.kind)?.label}
          {c.code && ` · ID ${c.code}`}
        </span>
        <Link href={`/app/clients/${c.id}`} className="mt-1 self-start rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">
          Открыть карточку
        </Link>
      </div>
      <PreviewRow label="Телефон">{c.phone}</PreviewRow>
      {c.contacts.map((k, i) => (
        <PreviewRow key={k.id} label={i === 0 ? "Контакт" : `Контакт ${i + 1}`}>
          {[contactName(k), i > 0 && k.phone].filter(Boolean).join(", ")}
        </PreviewRow>
      ))}
      <PreviewRow label="Email">{c.email}</PreviewRow>
      <PreviewRow label="ИНН">{c.inn}</PreviewRow>
      <PreviewRow label="Скидки">{discounts}</PreviewRow>
      <PreviewRow label="Нормочас">{c.hourPrice ? formatRub(c.hourPrice) : null}</PreviewRow>
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
        <PreviewRow label="Последний визит">{c.orders[0] ? formatDate(c.orders[0].acceptedAt) : null}</PreviewRow>
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
  const [lists, categories, sources] = await Promise.all([
    dicts(s.companyId, ["CLIENT_SOURCE"]),
    listCategories(s.companyId),
    clientSources(s.companyId),
  ]);
  const list = await searchClients(s.companyId, query);
  const btn = "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50";
  return (
    <div className="flex flex-col gap-4">
      <PageTitle create="#new" createLabel="Новый клиент"
        actions={
          <div className="flex min-w-72 flex-1 flex-wrap items-center gap-2 sm:ml-4">
            <SearchBox
              form={FORM}
              defaultValue={query.q}
              placeholder="Поиск: имя, телефон, ID, госномер, VIN, марка, ИНН, адрес… можно несколько слов"
            />
            <Link href="/app/excel" className={btn}>
              Excel
            </Link>
            <Link href="/app/recommendations" className={btn}>
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
      <PreviewPane
        selected={query.preview}
        panel={
          query.preview ? (
            <Preview companyId={s.companyId} id={query.preview} />
          ) : (
            <p className="text-sm text-slate-500">Нажмите на клиента в списке, чтобы увидеть сведения о нём. Двойной клик откроет карточку.</p>
          )
        }
        list={
          <>
            <form id={FORM} action={PATH} className="mb-3 flex flex-wrap items-center gap-2">
              <input type="hidden" name="sort" value={query.sort} />
              <input type="hidden" name="dir" value={query.dir} />
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
              <Select name="per" defaultValue={String(query.per)} aria-label="Строк на странице">
                {PER_PAGE.map((p) => (
                  <option key={p} value={p}>
                    {p} строк
                  </option>
                ))}
              </Select>
              <button className={btn}>Найти</button>
              <Link href={PATH} className="px-2 py-1.5 text-sm text-blue-600 hover:underline">
                Сбросить
              </Link>
            </form>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <SortTh path={PATH} query={query} sort="code">
                      ID
                    </SortTh>
                    <SortTh path={PATH} query={query} sort="name">
                      Клиент
                    </SortTh>
                    <th className={th}>Тип</th>
                    <th className={th}>Телефон</th>
                    <th className={th}>Автомобили</th>
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map((c) => (
                    <ClientRow key={c.id} id={c.id} previewHref={listHref(PATH, query, { preview: c.id })} selected={query.preview === c.id}>
                      <td className={`${td} text-slate-500 tabular-nums`}>{c.code}</td>
                      <td className={`${td} text-blue-600`}>{c.name}</td>
                      <td className={td}>{KIND_SHORT[c.kind]}</td>
                      <td className={td}>{c.phone}</td>
                      <td className={td}>{c.vehicles.map((v) => [v.make, v.model, v.plate].filter(Boolean).join(" ")).join(", ")}</td>
                    </ClientRow>
                  ))}
                  {list.rows.length === 0 && (
                    <tr>
                      <td className={`${td} text-slate-500`} colSpan={5}>
                        Клиентов не найдено{query.q && ". Попробуйте меньше слов"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-500">Один клик — просмотр справа, двойной клик — карточка в новой вкладке.</p>
            <Pager path={PATH} query={query} total={list.total} page={list.page} pages={list.pages} />
          </>
        }
      />
    </div>
  );
}
