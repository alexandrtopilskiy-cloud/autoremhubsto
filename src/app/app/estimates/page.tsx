import Link from "next/link";
import { Badge, Card, PageTitle, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatDate, orderNo, vehicleTitle } from "@/lib/format";
import { formatRub } from "@/lib/money";
import { estimateStatusLabel, listEstimates } from "@/lib/services/estimates";

export default async function EstimatesPage() {
  const s = await requireSession();
  const list = await listEstimates(s.companyId);
  return (
    <div className="flex flex-col gap-4">
      <PageTitle
        actions={
          <Link href="/app/estimates/new" className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Новая калькуляция
          </Link>
        }
      >
        Калькуляции
      </PageTitle>
      <Card>
        <p className="mb-3 text-sm text-slate-600">
          Предварительный расчёт ремонта для клиента. Когда клиент согласен, калькуляция одним нажатием превращается в заказ-наряд.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className={th}>Номер</th>
                <th className={th}>Дата</th>
                <th className={th}>Клиент</th>
                <th className={th}>Автомобиль</th>
                <th className={th}>Статус</th>
                <th className={`${th} text-right`}>Сумма</th>
              </tr>
            </thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className={td}>
                    <Link className="text-blue-600 hover:underline" href={`/app/estimates/${e.id}`}>
                      К-{e.number}
                    </Link>
                  </td>
                  <td className={td}>{formatDate(e.createdAt)}</td>
                  <td className={td}>{e.client.name}</td>
                  <td className={td}>{e.vehicle ? vehicleTitle(e.vehicle) : ""}</td>
                  <td className={td}>
                    <Badge tone={e.status === "ACCEPTED" ? "green" : e.status === "SENT" ? "blue" : "slate"}>{estimateStatusLabel(e.status)}</Badge>
                    {e.order && <span className="ml-2 text-slate-500">{orderNo(e.order.number)}</span>}
                  </td>
                  <td className={`${td} text-right whitespace-nowrap`}>{formatRub(e.totals.total)}</td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={6} className={`${td} text-slate-500`}>
                    Калькуляций пока нет
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
