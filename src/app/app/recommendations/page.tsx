import Link from "next/link";
import type { RecommendationStatus } from "@prisma/client";
import { ActionForm, Submit } from "@/components/form";
import { Badge, Card, Input, PageTitle, Select, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { PreviewHint, PreviewRow, PreviewTitle } from "@/components/list-view";
import { ListRow, PreviewPane } from "@/components/preview-pane";
import { previewHref, previewId } from "@/lib/list-query";
import { formatDate, formatQty, orderNo, vehicleTitle } from "@/lib/format";
import { formatRub } from "@/lib/money";
import { listRecommendations, REC_STATUSES, recStatusLabel } from "@/lib/services/recommendations";
import { setRecStatusAction } from "./actions";

const PATH = "/app/recommendations";

export default async function RecommendationsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; preview?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const status = sp.status === "ALL" ? undefined : REC_STATUSES.some((x) => x.value === sp.status) ? (sp.status as RecommendationStatus) : "OPEN";
  const list = await listRecommendations(s.companyId, { q: sp.q, status });
  const preview = previewId(sp);
  const sel = list.find((r) => r.id === preview);
  return (
    <div className="flex flex-col gap-4">
      <PageTitle>Рекомендации клиентам</PageTitle>
      <PreviewPane
        selected={preview}
        panel={
          sel ? (
            <>
              <PreviewTitle
                title={sel.name}
                sub={`${formatDate(sel.createdAt)} · ${recStatusLabel(sel.status)}`}
                href={sel.order ? `/app/orders/${sel.order.id}` : `/app/clients/${sel.clientId}`}
                open={sel.order ? `Открыть ${orderNo(sel.order.number)}` : "Открыть клиента"}
              />
              <PreviewRow label="Клиент">
                <Link href={`/app/clients/${sel.clientId}`} className="text-blue-600 hover:underline">
                  {sel.client.name}
                </Link>
              </PreviewRow>
              <PreviewRow label="Телефон">{sel.client.phone}</PreviewRow>
              <PreviewRow label="Автомобиль">{sel.vehicle ? vehicleTitle(sel.vehicle) : null}</PreviewRow>
              <PreviewRow label="Количество">{formatQty(Number(sel.qty))}</PreviewRow>
              <PreviewRow label="Сумма">{sel.price ? formatRub(Math.round(Number(sel.qty) * sel.price)) : null}</PreviewRow>
              <PreviewRow label="Комментарий">{sel.comment}</PreviewRow>
              <ActionForm action={setRecStatusAction.bind(null, sel.id, sel.status === "OPEN" ? "DECLINED" : "OPEN")} className="mt-3">
                <Submit variant="ghost">{sel.status === "OPEN" ? "Клиент отказался" : "Вернуть в открытые"}</Submit>
              </ActionForm>
            </>
          ) : (
            <PreviewHint what="рекомендацию" open="заказ-наряд, из которого она пришла" />
          )
        }
        list={
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
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <ListRow key={r.id} previewHref={previewHref(PATH, sp, r.id)} openHref={r.order ? `/app/orders/${r.order.id}` : `/app/clients/${r.clientId}`} selected={preview === r.id}>
                      <td className={`${td} whitespace-nowrap`}>{formatDate(r.createdAt)}</td>
                      <td className={td}>
                        <span className="text-blue-600">
                          {r.client.name}
                        </span>
                        <div className="text-xs text-slate-500">{r.client.phone}</div>
                      </td>
                      <td className={td}>{r.vehicle ? vehicleTitle(r.vehicle) : ""}</td>
                      <td className={td}>
                        {r.name}
                        {Number(r.qty) !== 1 && ` × ${formatQty(Number(r.qty))}`}
                        {r.comment && <div className="text-xs text-slate-500">{r.comment}</div>}
                        {r.order && (
                          <span className="text-xs text-blue-600">
                            из {orderNo(r.order.number)}
                          </span>
                        )}
                      </td>
                      <td className={`${td} text-right whitespace-nowrap`}>{r.price ? formatRub(Math.round(Number(r.qty) * r.price)) : ""}</td>
                      <td className={td}>
                        <Badge tone={r.status === "OPEN" ? "amber" : r.status === "DONE" ? "green" : "slate"}>{recStatusLabel(r.status)}</Badge>
                      </td>
                    </ListRow>
                  ))}
                  {list.length === 0 && (
                    <tr>
                      <td colSpan={6} className={`${td} text-slate-500`}>
                        Ничего не найдено
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        }
      />
    </div>
  );
}
