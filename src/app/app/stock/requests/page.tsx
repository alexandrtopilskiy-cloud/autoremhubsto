import Link from "next/link";
import type { PartsRequestStatus } from "@prisma/client";
import { ActionForm, Submit } from "@/components/form";
import { OperatorOnly } from "@/components/manager-only";
import { Badge, Card, PageTitle, Select } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatDate, formatQty, orderNo, vehicleTitle } from "@/lib/format";
import { listPartsRequests, REQUEST_STATUSES, requestStatusLabel } from "@/lib/services/parts-requests";
import { stockBalances } from "@/lib/services/stock";
import { StockTabs } from "../tabs";
import { cancelRequestAction, issueRequestAction } from "../actions";

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const status = sp.status === "ALL" ? undefined : REQUEST_STATUSES.some((x) => x.value === sp.status) ? (sp.status as PartsRequestStatus) : "NEW";
  const [list, balances] = await Promise.all([listPartsRequests(s.companyId, status), stockBalances(s.companyId)]);
  const stock = new Map(balances.map((b) => [b.id, b.qty]));
  return (
    <div className="flex flex-col gap-4">
      <PageTitle>Склад</PageTitle>
      <StockTabs active="requests" />
      <OperatorOnly role={s.role}>
        <Card>
          <form className="mb-3 flex flex-wrap items-center gap-2">
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
              Мастер запрашивает товар в заказ-наряде. При выдаче товары добавляются в наряд, списание со склада — при его проведении.
            </span>
          </form>
          <ul className="flex flex-col gap-3">
            {list.map((r) => (
              <li key={r.id} className="rounded-md border border-slate-200 p-3 text-sm">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <b>ТР-{r.number}</b>
                  <Badge tone={r.status === "NEW" ? "amber" : r.status === "ISSUED" ? "green" : "slate"}>{requestStatusLabel(r.status)}</Badge>
                  <Link href={`/app/orders/${r.order.id}`} className="text-blue-600 hover:underline">
                    {orderNo(r.order.number)}
                  </Link>
                  <span>
                    {r.order.client.name}
                    {r.order.vehicle && `, ${vehicleTitle(r.order.vehicle)}`}
                  </span>
                  <span className="text-slate-500">
                    {formatDate(r.createdAt, true)}
                    {r.requestedBy && `, ${r.requestedBy.name}`}
                  </span>
                  {r.status === "NEW" && (
                    <span className="ml-auto flex gap-2">
                      <ActionForm action={issueRequestAction.bind(null, r.id)}>
                        <Submit>Выдать</Submit>
                      </ActionForm>
                      <ActionForm action={cancelRequestAction.bind(null, r.id)}>
                        <Submit variant="danger">Отклонить</Submit>
                      </ActionForm>
                    </span>
                  )}
                </div>
                <table className="w-full">
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
              </li>
            ))}
            {list.length === 0 && <li className="text-sm text-slate-500">Требований нет</li>}
          </ul>
        </Card>
      </OperatorOnly>
    </div>
  );
}
