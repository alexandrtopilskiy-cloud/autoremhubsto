import Link from "next/link";
import type { OrderStage } from "@prisma/client";
import { Badge, Card, Input, PageTitle, Select, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatDate, orderNo, vehicleTitle } from "@/lib/format";
import { formatRub } from "@/lib/money";
import { listOrders, STAGES, stageLabel } from "@/lib/services/orders";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ q?: string; stage?: string }> }) {
  const s = await requireSession();
  const { q, stage } = await searchParams;
  const st = STAGES.some((x) => x.value === stage) ? (stage as OrderStage) : undefined;
  const orders = await listOrders(s.companyId, { q, stage: st });
  return (
    <div className="flex flex-col gap-4">
      <PageTitle
        actions={
          <Link href="/app/orders/new" className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Новый заказ-наряд
          </Link>
        }
      >
        Заказ-наряды
      </PageTitle>
      <Card>
        <form className="mb-3 flex flex-wrap items-center gap-2">
          <Input name="q" defaultValue={q} placeholder="Номер, клиент, телефон или госномер" className="min-w-72" />
          <Select name="stage" defaultValue={st ?? ""}>
            <option value="">Все стадии</option>
            {STAGES.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </Select>
          <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Найти</button>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className={th}>Номер</th>
                <th className={th}>Дата</th>
                <th className={th}>Клиент</th>
                <th className={th}>Автомобиль</th>
                <th className={th}>Стадия</th>
                <th className={`${th} text-right`}>Сумма</th>
                <th className={`${th} text-right`}>Долг</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b last:border-0 hover:bg-slate-50">
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
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={7} className={`${td} text-slate-500`}>
                    Заказ-нарядов не найдено
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
