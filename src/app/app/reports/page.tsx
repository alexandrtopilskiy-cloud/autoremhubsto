import Link from "next/link";
import { Card, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatRub } from "@/lib/money";
import { monitor, type DayFigures } from "@/lib/services/reports";
import { getCompany } from "@/lib/services/settings";
import { dateLabel, todayLocal } from "@/lib/time";

const FIGURES: { key: keyof DayFigures; label: string; money: boolean }[] = [
  { key: "income", label: "Поступило денег", money: true },
  { key: "expense", label: "Расход денег", money: true },
  { key: "revenue", label: "Выручка по проведённым заказ-нарядам", money: true },
  { key: "cogs", label: "Себестоимость списанных товаров", money: true },
  { key: "margin", label: "Маржа", money: true },
  { key: "orders", label: "Проведено заказ-нарядов", money: false },
];

function Bar({ value, max, tone = "bg-blue-500" }: { value: number; max: number; tone?: string }) {
  return (
    <div className="h-2 flex-1 rounded bg-slate-100">
      <div className={`h-2 rounded ${tone}`} style={{ width: `${max && value ? Math.max(2, (value / max) * 100) : 0}%` }} />
    </div>
  );
}

export default async function MonitorPage() {
  const s = await requireSession();
  const company = await getCompany(s.companyId);
  const today = todayLocal(company.utcOffset);
  const m = await monitor(s.companyId, today, company.utcOffset);
  const total = m.cashboxes.reduce((a, b) => a + b.balance, 0);
  const maxDay = Math.max(...m.ordersByDay.map((d) => d.count));
  const maxMake = Math.max(0, ...m.topMakes.map((x) => x.count));
  const maxStage = Math.max(0, ...m.funnel.map((x) => x.count));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {m.cashboxes.map((b) => (
          <Card key={b.id}>
            <p className="text-sm text-slate-600">{b.name}</p>
            <p className={`text-xl font-semibold ${b.balance < 0 ? "text-red-600" : ""}`}>{formatRub(b.balance)}</p>
          </Card>
        ))}
        <Card>
          <p className="text-sm text-slate-600">Всего денег</p>
          <p className="text-xl font-semibold">{formatRub(total)}</p>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Сегодня, ${dateLabel(today)}`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className={th} />
                <th className={`${th} text-right`}>Сегодня</th>
                <th className={`${th} text-right`}>Вчера</th>
              </tr>
            </thead>
            <tbody>
              {FIGURES.map((f) => (
                <tr key={f.key} className="border-b last:border-0">
                  <td className={td}>{f.label}</td>
                  <td className={`${td} text-right font-medium whitespace-nowrap`}>{f.money ? formatRub(m.today[f.key]) : m.today[f.key]}</td>
                  <td className={`${td} text-right whitespace-nowrap text-slate-600`}>
                    {f.money ? formatRub(m.yesterday[f.key]) : m.yesterday[f.key]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Заказ-наряды в работе">
          <div className="flex flex-col gap-2 text-sm">
            {m.funnel.map((f) => (
              <div key={f.stage} className="flex items-center gap-3">
                <span className="w-28">{f.stage}</span>
                <Bar value={f.count} max={maxStage} tone="bg-amber-500" />
                <span className="w-8 text-right font-medium">{f.count}</span>
                <span className="w-32 text-right text-slate-600">{formatRub(f.sum)}</span>
              </div>
            ))}
          </div>
          <Link href="/app/orders" className="mt-3 inline-block text-sm text-blue-600 hover:underline">
            Все заказ-наряды
          </Link>
        </Card>

        <Card title="Принято заказ-нарядов за неделю">
          <div className="flex h-32 items-end gap-2">
            {m.ordersByDay.map((d) => (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-1 text-xs">
                <span className="font-medium">{d.count || ""}</span>
                <div
                  className={`w-full rounded-t ${d.date === today ? "bg-blue-600" : "bg-blue-300"}`}
                  style={{ height: `${maxDay ? Math.max(2, (d.count / maxDay) * 80) : 2}px` }}
                />
                <span className="text-slate-600">{dateLabel(d.date).slice(0, 9)}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm">
            Клиенты за неделю: новых <b>{m.clients.new}</b>, вернулись <b>{m.clients.returning}</b>
          </p>
        </Card>

        <Card title="Топ-10 марок автомобилей">
          <div className="flex flex-col gap-2 text-sm">
            {m.topMakes.map((x) => (
              <div key={x.make} className="flex items-center gap-3">
                <span className="w-28 truncate">{x.make}</span>
                <Bar value={x.count} max={maxMake} />
                <span className="w-8 text-right font-medium">{x.count}</span>
              </div>
            ))}
            {m.topMakes.length === 0 && <p className="text-slate-500">Автомобилей пока нет</p>}
          </div>
        </Card>
      </div>
    </div>
  );
}
