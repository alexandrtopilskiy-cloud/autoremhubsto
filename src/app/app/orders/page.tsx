import Link from "next/link";
import { FilterSelect, ListFilters, Pager, PreviewHead, PreviewLink, PreviewRow, SortTh, WithPreview } from "@/components/list-view";
import { Badge, PageTitle, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatDate, orderNo, vehicleTitle } from "@/lib/format";
import { listHref, parseListQuery } from "@/lib/list-query";
import { formatRub } from "@/lib/money";
import { listEmployees, listOrganizations } from "@/lib/services/employees";
import { ORDER_FILTERS, ORDER_SORTS, searchOrders, type OrderQuery } from "@/lib/services/lists";
import { getOrder, STAGES, stageLabel } from "@/lib/services/orders";
import { getCompany } from "@/lib/services/settings";
import { can } from "@/lib/permissions";
import { TrashButton } from "@/components/trash-button";
import { trashDocAction } from "@/app/app/trash-actions";

const PATH = "/app/orders";

async function Preview({ companyId, id, query }: { companyId: string; id: string; query: OrderQuery }) {
  const o = await getOrder(companyId, id).catch(() => null);
  if (!o) return null;
  return (
    <>
      <PreviewHead title={`${orderNo(o.number)} от ${formatDate(o.acceptedAt)}`} href={`/app/orders/${o.id}`} close={listHref(PATH, query, { preview: "" })} />
      <PreviewRow label="Стадия">{stageLabel(o.stage)}</PreviewRow>
      <PreviewRow label="Статус">{o.status === "POSTED" ? "Проведён" : "Черновик"}</PreviewRow>
      <PreviewRow label="Клиент">
        <Link href={`/app/clients/${o.clientId}`} className="text-blue-600 hover:underline">
          {o.client.name}
        </Link>
      </PreviewRow>
      <PreviewRow label="Телефон">{o.client.phone}</PreviewRow>
      <PreviewRow label="Автомобиль">{o.vehicle ? vehicleTitle(o.vehicle) : null}</PreviewRow>
      <PreviewRow label="Пробег">{o.mileage ? `${o.mileage.toLocaleString("ru-RU")} км` : null}</PreviewRow>
      <PreviewRow label="Менеджер">{o.manager?.name}</PreviewRow>
      <PreviewRow label="Предприятие">{o.organization?.name}</PreviewRow>
      <PreviewRow label="Причина обращения">{o.reason}</PreviewRow>
      {o.works.length > 0 && (
        <div className="mt-3 text-sm">
          <div className="mb-1 text-slate-500">Работы ({o.works.length})</div>
          <ul className="list-inside list-disc">
            {o.works.slice(0, 8).map((w) => (
              <li key={w.id}>{w.name}</li>
            ))}
            {o.works.length > 8 && <li className="list-none text-slate-500">и ещё {o.works.length - 8}</li>}
          </ul>
        </div>
      )}
      {o.items.length > 0 && <PreviewRow label="Товары и материалы">{o.items.length} поз.</PreviewRow>}
      <div className="mt-3">
        <PreviewRow label="Работы">{formatRub(o.totals.works)}</PreviewRow>
        <PreviewRow label="Товары">{formatRub(o.totals.items)}</PreviewRow>
        <PreviewRow label="Итого">
          <b>{formatRub(o.totals.total)}</b>
        </PreviewRow>
        <PreviewRow label="Оплачено">{formatRub(o.totals.paid)}</PreviewRow>
        <PreviewRow label="Долг">{o.totals.due !== 0 ? <span className={o.totals.due > 0 ? "text-red-600" : ""}>{formatRub(o.totals.due)}</span> : "нет"}</PreviewRow>
      </div>
    </>
  );
}

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireSession();
  const query = parseListQuery(await searchParams, { sorts: ORDER_SORTS, sort: "number", filters: ORDER_FILTERS });
  const [company, orgs, employees] = await Promise.all([getCompany(s.companyId), listOrganizations(s.companyId), listEmployees(s.companyId, "MANAGER")]);
  const list = await searchOrders(s.companyId, query, company.utcOffset);
  const { f } = query;
  const remover = can(s.perms, "orders", "FULL");
  return (
    <div className="flex flex-col gap-4">
      <PageTitle create="/app/orders/new" createLabel="Новый заказ-наряд">
        Заказ-наряды
      </PageTitle>
      <WithPreview panel={query.preview ? <Preview companyId={s.companyId} id={query.preview} query={query} /> : undefined}>
        <div>
          <ListFilters path={PATH} query={query} placeholder="Номер, клиент, телефон, госномер, VIN или причина">
            <FilterSelect name="stage" label="Стадия" value={f.stage} options={STAGES} />
            <FilterSelect
              name="status"
              label="Статус"
              value={f.status}
              options={[
                { value: "DRAFT", label: "Черновик" },
                { value: "POSTED", label: "Проведён" },
              ]}
            />
            {orgs.length > 1 && (
              <FilterSelect
                name="org"
                label="Предприятие"
                value={f.org}
                options={[...orgs.map((o) => ({ value: o.id, label: o.name })), { value: "none", label: "Не указано" }]}
              />
            )}
            <FilterSelect
              name="manager"
              label="Ответственный"
              value={f.manager}
              options={[...employees.map((e) => ({ value: e.id, label: e.name })), { value: "none", label: "Не указан" }]}
            />
            <FilterSelect name="debt" label="Долг" value={f.debt} options={[{ value: "1", label: "Только с долгом" }]} />
          </ListFilters>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className={th} />
                  <SortTh path={PATH} query={query} sort="number">
                    Номер
                  </SortTh>
                  <SortTh path={PATH} query={query} sort="date">
                    Дата
                  </SortTh>
                  <SortTh path={PATH} query={query} sort="client">
                    Клиент
                  </SortTh>
                  <th className={th}>Автомобиль</th>
                  <th className={th}>Стадия</th>
                  <SortTh path={PATH} query={query} sort="total" right>
                    Сумма
                  </SortTh>
                  <SortTh path={PATH} query={query} sort="due" right>
                    Долг
                  </SortTh>
                  <th className={`${th} text-right`}>Действия</th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((o) => (
                  <tr key={o.id} className={`border-b last:border-0 hover:bg-slate-50 ${query.preview === o.id ? "bg-blue-100" : ""}`}>
                    <td className={`${td} w-6`}>
                      <PreviewLink path={PATH} query={query} id={o.id} label={orderNo(o.number)} />
                    </td>
                    <td className={td}>
                      <Link className="text-blue-600 hover:underline" href={`/app/orders/${o.id}`}>
                        {orderNo(o.number)}
                      </Link>
                    </td>
                    <td className={td}>{formatDate(o.acceptedAt)}</td>
                    <td className={td}>{o.client.name}</td>
                    <td className={td}>{o.vehicle ? vehicleTitle(o.vehicle) : ""}</td>
                    <td className={td}>
                      <Badge tone={o.stage === "CLOSED" ? "green" : o.stage === "READY" ? "blue" : "slate"}>{stageLabel(o.stage)}</Badge>
                    </td>
                    <td className={`${td} text-right whitespace-nowrap`}>{formatRub(o.totals.total)}</td>
                    <td className={`${td} text-right whitespace-nowrap ${o.totals.due > 0 ? "text-red-600" : ""}`}>
                      {o.totals.due !== 0 ? formatRub(o.totals.due) : ""}
                    </td>
                    <td className={`${td} py-1.5`}>
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          href={`/app/orders/${o.id}/print`}
                          target="_blank"
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm hover:bg-slate-50"
                          title="Печатная форма заказ-наряда"
                        >
                          Печать
                        </Link>
                        {remover && (
                          <TrashButton
                            small
                            action={trashDocAction.bind(null, "ORDER", o.id, PATH)}
                            disabled={o.status === "POSTED"}
                            title={o.status === "POSTED" ? "Проведённый наряд: сначала отмените проведение" : "Удалить в корзину"}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {list.rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className={`${td} text-slate-500`}>
                      Заказ-нарядов не найдено
                    </td>
                  </tr>
                )}
              </tbody>
              {list.total > 0 && (
                <tfoot>
                  <tr className="border-t font-medium">
                    <td className={td} colSpan={6}>
                      Итого по отбору
                    </td>
                    <td className={`${td} text-right whitespace-nowrap`}>{formatRub(list.sums.total)}</td>
                    <td className={`${td} text-right whitespace-nowrap`}>{list.sums.due !== 0 ? formatRub(list.sums.due) : ""}</td>
                    <td className={td} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <Pager path={PATH} query={query} total={list.total} page={list.page} pages={list.pages} />
        </div>
      </WithPreview>
    </div>
  );
}
