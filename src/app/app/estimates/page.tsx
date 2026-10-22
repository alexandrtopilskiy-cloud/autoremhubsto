import Link from "next/link";
import { IconLink } from "@/components/icon-button";
import { FilterSelect, ListFilters, Pager, PreviewHead, PreviewRow, SortTh } from "@/components/list-view";
import { Badge, PageTitle, td, th } from "@/components/ui";
import { ListRow, PreviewPane } from "@/components/preview-pane";
import { requireSession } from "@/lib/auth";
import { formatDate, orderNo, vehicleTitle } from "@/lib/format";
import { listHref, parseListQuery } from "@/lib/list-query";
import { formatRub } from "@/lib/money";
import { ESTIMATE_STATUSES, estimateStatusLabel, getEstimate } from "@/lib/services/estimates";
import { ESTIMATE_FILTERS, ESTIMATE_SORTS, searchEstimates, type EstimateQuery } from "@/lib/services/lists";
import { getCompany } from "@/lib/services/settings";

const PATH = "/app/estimates";

async function Preview({ companyId, id, query }: { companyId: string; id: string; query: EstimateQuery }) {
  const e = await getEstimate(companyId, id).catch(() => null);
  if (!e) return null;
  return (
    <>
      <PreviewHead title={`К-${e.number} от ${formatDate(e.createdAt)}`} href={`/app/estimates/${e.id}`} close={listHref(PATH, query, { preview: "" })} />
      <PreviewRow label="Статус">{estimateStatusLabel(e.status)}</PreviewRow>
      <PreviewRow label="Заказ-наряд">
        {e.order ? (
          <Link href={`/app/orders/${e.order.id}`} className="text-blue-600 hover:underline">
            {orderNo(e.order.number)}
          </Link>
        ) : null}
      </PreviewRow>
      <PreviewRow label="Клиент">
        <Link href={`/app/clients/${e.clientId}`} className="text-blue-600 hover:underline">
          {e.client.name}
        </Link>
      </PreviewRow>
      <PreviewRow label="Телефон">{e.client.phone}</PreviewRow>
      <PreviewRow label="Автомобиль">{e.vehicle ? vehicleTitle(e.vehicle) : null}</PreviewRow>
      <PreviewRow label="Комментарий">{e.comment}</PreviewRow>
      {e.lines.length > 0 && (
        <div className="mt-3 text-sm">
          <div className="mb-1 text-slate-500">Строки ({e.lines.length})</div>
          <ul className="list-inside list-disc">
            {e.lines.slice(0, 8).map((l) => (
              <li key={l.id}>{l.name}</li>
            ))}
            {e.lines.length > 8 && <li className="list-none text-slate-500">и ещё {e.lines.length - 8}</li>}
          </ul>
        </div>
      )}
      <div className="mt-3">
        <PreviewRow label="Работы">{formatRub(e.totals.works)}</PreviewRow>
        <PreviewRow label="Товары">{formatRub(e.totals.items)}</PreviewRow>
        <PreviewRow label="Итого">
          <b>{formatRub(e.totals.total)}</b>
        </PreviewRow>
      </div>
    </>
  );
}

export default async function EstimatesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireSession();
  const query = parseListQuery(await searchParams, { sorts: ESTIMATE_SORTS, sort: "number", filters: ESTIMATE_FILTERS });
  const company = await getCompany(s.companyId);
  const list = await searchEstimates(s.companyId, query, company.utcOffset);
  return (
    <div className="flex flex-col gap-4">
      <PageTitle create="/app/estimates/new" createLabel="Новая калькуляция">
        Калькуляции
      </PageTitle>
      <PreviewPane
        selected={query.preview}
        panel={
          query.preview ? (
            <Preview companyId={s.companyId} id={query.preview} query={query} />
          ) : (
            <p className="text-sm text-slate-500">Нажмите на калькуляцию в списке, чтобы увидеть её кратко. Двойной клик откроет калькуляцию.</p>
          )
        }
        list={
          <>
            <p className="mb-3 text-sm text-slate-600">
              Предварительный расчёт ремонта для клиента. Когда клиент согласен, калькуляция одним нажатием превращается в заказ-наряд.
            </p>
            <ListFilters path={PATH} query={query} placeholder="Номер, клиент, телефон, госномер или комментарий">
              <FilterSelect name="status" label="Статус" value={query.f.status} options={ESTIMATE_STATUSES} />
              <FilterSelect
                name="converted"
                label="Заказ-наряд"
                value={query.f.converted}
                options={[
                  { value: "1", label: "Создан" },
                  { value: "0", label: "Не создан" },
                ]}
              />
            </ListFilters>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
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
                    <th className={th}>Статус</th>
                    <SortTh path={PATH} query={query} sort="total" right>
                      Сумма
                    </SortTh>
                    <th className={th} />
                  </tr>
                </thead>
                <tbody>
                  {list.rows.map((e) => (
                    <ListRow key={e.id} previewHref={listHref(PATH, query, { preview: e.id })} openHref={`/app/estimates/${e.id}`} selected={query.preview === e.id}>
                      <td className={td}>
                        <span className="text-blue-600">
                          К-{e.number}
                        </span>
                      </td>
                      <td className={td}>{formatDate(e.createdAt)}</td>
                      <td className={td}>{e.client.name}</td>
                      <td className={td}>{e.vehicle ? vehicleTitle(e.vehicle) : ""}</td>
                      <td className={td}>
                        <Badge tone={e.status === "ACCEPTED" ? "green" : e.status === "SENT" ? "blue" : "slate"}>{estimateStatusLabel(e.status)}</Badge>
                        {e.order && <span className="ml-2 text-slate-500">{orderNo(e.order.number)}</span>}
                      </td>
                      <td className={`${td} text-right whitespace-nowrap`}>{formatRub(e.totals.total)}</td>
                      <td className={`${td} py-1.5`}>
                        <div className="flex justify-end">
                          <IconLink small newTab icon="print" label="Печать" href={`/app/estimates/${e.id}/print`} />
                        </div>
                      </td>
                    </ListRow>
                  ))}
                  {list.rows.length === 0 && (
                    <tr>
                      <td colSpan={7} className={`${td} text-slate-500`}>
                        Калькуляций не найдено
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pager path={PATH} query={query} total={list.total} page={list.page} pages={list.pages} />
          </>
        }
      />
    </div>
  );
}
