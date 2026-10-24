import type { PartsRequestStatus } from "@prisma/client";
import { ActionForm, Submit } from "@/components/form";
import { Allowed } from "@/components/manager-only";
import { PreviewHint, PreviewRow, PreviewTitle } from "@/components/list-view";
import { ListRow, PreviewPane } from "@/components/preview-pane";
import { Badge, Card, PageTitle, Select, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatDate, formatQty, orderNo, vehicleTitle } from "@/lib/format";
import { previewHref, previewId } from "@/lib/list-query";
import { listPartsRequests, REQUEST_STATUSES, requestStatusLabel } from "@/lib/services/parts-requests";
import { stockBalances } from "@/lib/services/stock";
import { StockTabs } from "../tabs";
import { cancelRequestAction, issueRequestAction } from "../actions";
import { LiveForm } from "@/components/busy";

const PATH = "/app/stock/requests";
const tone = (st: PartsRequestStatus) => (st === "NEW" ? "amber" : st === "ISSUED" ? "green" : "slate");

export default async function RequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const preview = previewId(sp);
  const status = sp.status === "ALL" ? undefined : REQUEST_STATUSES.some((x) => x.value === sp.status) ? (sp.status as PartsRequestStatus) : "NEW";
  const [list, balances] = await Promise.all([listPartsRequests(s.companyId, status), stockBalances(s.companyId)]);
  const stock = new Map(balances.map((b) => [b.id, b.qty]));
  const r = list.find((x) => x.id === preview);
  return (
    <div className="flex flex-col gap-4">
      <PageTitle>Склад</PageTitle>
      <StockTabs active="requests" />
      <Allowed perms={s.perms} section="stock">
        <PreviewPane
          selected={preview}
          panel={
            r ? (
              <>
                <PreviewTitle title={`ТР-${r.number}`} sub={formatDate(r.createdAt, true)} href={`/app/orders/${r.order.id}`} open="Открыть заказ-наряд" />
                <PreviewRow label="Статус">{requestStatusLabel(r.status)}</PreviewRow>
                <PreviewRow label="Заказ-наряд">{orderNo(r.order.number, r.order.numberPrefix)}</PreviewRow>
                <PreviewRow label="Клиент">{r.order.client.name}</PreviewRow>
                <PreviewRow label="Автомобиль">{r.order.vehicle ? vehicleTitle(r.order.vehicle) : null}</PreviewRow>
                <PreviewRow label="Запросил">{r.requestedBy?.name}</PreviewRow>
                <table className="mt-3 w-full text-sm">
                  <tbody>
                    {r.lines.map((l) => {
                      const left = stock.get(l.productId) ?? 0;
                      return (
                        <tr key={l.id}>
                          <td className="py-0.5">
                            {l.product.name} {l.product.article && <span className="text-slate-500">{l.product.article}</span>}
                          </td>
                          <td className="py-0.5 text-right whitespace-nowrap">
                            {formatQty(Number(l.qty))} {l.product.unit}
                          </td>
                          <td className={`py-0.5 pl-4 text-right whitespace-nowrap ${left < Number(l.qty) ? "text-red-600" : "text-slate-500"}`}>
                            на складе {formatQty(left)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {r.status === "NEW" && (
                  <div className="mt-3 flex gap-2">
                    <ActionForm action={issueRequestAction.bind(null, r.id)}>
                      <Submit>Выдать</Submit>
                    </ActionForm>
                    <ActionForm action={cancelRequestAction.bind(null, r.id)}>
                      <Submit variant="danger">Отклонить</Submit>
                    </ActionForm>
                  </div>
                )}
              </>
            ) : (
              <PreviewHint what="требование" open="заказ-наряд" />
            )
          }
          list={
            <Card>
              <LiveForm className="mb-3 flex flex-wrap items-center gap-2">
                <Select name="status" defaultValue={status ?? "ALL"}>
                  {REQUEST_STATUSES.map((x) => (
                    <option key={x.value} value={x.value}>
                      {x.label}
                    </option>
                  ))}
                  <option value="ALL">Все</option>
                </Select>
                <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Показать</button>
                <span className="text-sm text-slate-600">
                  Мастер запрашивает товар в заказ-наряде. Выдать или отклонить требование можно в просмотре справа; при выдаче товары добавляются в наряд,
                  списание со склада — при проведении наряда.
                </span>
              </LiveForm>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className={th}>Номер</th>
                      <th className={th}>Дата</th>
                      <th className={th}>Заказ-наряд</th>
                      <th className={th}>Клиент</th>
                      <th className={th}>Запросил</th>
                      <th className={`${th} text-right`}>Позиций</th>
                      <th className={th}>Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((x) => (
                      <ListRow key={x.id} previewHref={previewHref(PATH, sp, x.id)} openHref={`/app/orders/${x.order.id}`} selected={preview === x.id}>
                        <td className={td}>ТР-{x.number}</td>
                        <td className={`${td} whitespace-nowrap`}>{formatDate(x.createdAt, true)}</td>
                        <td className={td}>
                          <span className="text-blue-600">
                            {orderNo(x.order.number, x.order.numberPrefix)}
                          </span>
                        </td>
                        <td className={td}>
                          {x.order.client.name}
                          {x.order.vehicle && <span className="text-slate-500">, {vehicleTitle(x.order.vehicle)}</span>}
                        </td>
                        <td className={td}>{x.requestedBy?.name}</td>
                        <td className={`${td} text-right`}>{x.lines.length}</td>
                        <td className={td}>
                          <Badge tone={tone(x.status)}>{requestStatusLabel(x.status)}</Badge>
                        </td>
                      </ListRow>
                    ))}
                    {list.length === 0 && (
                      <tr>
                        <td colSpan={7} className={`${td} text-slate-500`}>
                          Требований нет
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          }
        />
      </Allowed>
    </div>
  );
}
