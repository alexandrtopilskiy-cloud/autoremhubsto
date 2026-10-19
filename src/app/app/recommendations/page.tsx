import Link from "next/link";
import type { RecommendationStatus } from "@prisma/client";
import { ActionForm } from "@/components/form";
import { Badge, Card, Input, PageTitle, Select, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatDate, formatQty, orderNo, vehicleTitle } from "@/lib/format";
import { formatRub } from "@/lib/money";
import { listRecommendations, REC_STATUSES, recStatusLabel } from "@/lib/services/recommendations";
import { setRecStatusAction } from "./actions";

export default async function RecommendationsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const status = sp.status === "ALL" ? undefined : REC_STATUSES.some((x) => x.value === sp.status) ? (sp.status as RecommendationStatus) : "OPEN";
  const list = await listRecommendations(s.companyId, { q: sp.q, status });
  return (
    <div className="flex flex-col gap-4">
      <PageTitle>Рекомендации клиентам</PageTitle>
      <Card>
        <p className="mb-3 text-sm text-slate-600">
          Работы и товары, которые предложили клиенту, но он не стал делать. Перенести рекомендацию в наряд можно из заказ-наряда этого клиента.
        </p>
        <form className="mb-3 flex flex-wrap items-center gap-2">
          <Input name="q" defaultValue={sp.q} placeholder="Работа, товар, клиент, телефон или госномер" className="min-w-80" />
          <Select name="status" defaultValue={status ?? "ALL"}>
            {REC_STATUSES.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
            <option value="ALL">Все</option>
          </Select>
          <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Найти</button>
          <Link href="/app/recommendations/print" target="_blank" className="ml-auto text-sm text-blue-600 hover:underline">
            Печать открытых
          </Link>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className={th}>Дата</th>
                <th className={th}>Клиент</th>
                <th className={th}>Автомобиль</th>
                <th className={th}>Рекомендация</th>
                <th className={`${th} text-right`}>Сумма</th>
                <th className={th}>Статус</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className={`${td} whitespace-nowrap`}>{formatDate(r.createdAt)}</td>
                  <td className={td}>
                    <Link href={`/app/clients/${r.clientId}`} className="text-blue-600 hover:underline">
                      {r.client.name}
                    </Link>
                    <div className="text-xs text-slate-500">{r.client.phone}</div>
                  </td>
                  <td className={td}>{r.vehicle ? vehicleTitle(r.vehicle) : ""}</td>
                  <td className={td}>
                    {r.name}
                    {Number(r.qty) !== 1 && ` × ${formatQty(Number(r.qty))}`}
                    {r.comment && <div className="text-xs text-slate-500">{r.comment}</div>}
                    {r.order && (
                      <Link href={`/app/orders/${r.order.id}`} className="text-xs text-blue-600 hover:underline">
                        из {orderNo(r.order.number)}
                      </Link>
                    )}
                  </td>
                  <td className={`${td} text-right whitespace-nowrap`}>{r.price ? formatRub(Math.round(Number(r.qty) * r.price)) : ""}</td>
                  <td className={td}>
                    <Badge tone={r.status === "OPEN" ? "amber" : r.status === "DONE" ? "green" : "slate"}>{recStatusLabel(r.status)}</Badge>
                  </td>
                  <td className={`${td} text-right`}>
                    <ActionForm action={setRecStatusAction.bind(null, r.id, r.status === "OPEN" ? "DECLINED" : "OPEN")}>
                      <button className="text-slate-500 hover:underline">{r.status === "OPEN" ? "Отказ" : "Вернуть"}</button>
                    </ActionForm>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={7} className={`${td} text-slate-500`}>
                    Ничего не найдено
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
