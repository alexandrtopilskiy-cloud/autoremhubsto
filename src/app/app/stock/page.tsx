import { Card, Input, PageTitle, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatQty } from "@/lib/format";
import { formatRub } from "@/lib/money";
import { stockBalances } from "@/lib/services/stock";
import { StockTabs } from "./tabs";

export default async function StockPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const s = await requireSession();
  const { q } = await searchParams;
  const rows = await stockBalances(s.companyId, q);
  const total = rows.reduce((sum, r) => sum + Math.max(0, r.value), 0);
  const costs = s.perms.flags.costs;
  return (
    <div className="flex flex-col gap-4">
      <PageTitle>Склад</PageTitle>
      <StockTabs active="balances" />
      <Card>
        <form className="mb-3 flex flex-wrap items-center gap-2">
          <Input name="q" defaultValue={q} placeholder="Наименование, артикул или бренд" className="min-w-72" />
          <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Найти</button>
          {costs && (
            <span className="ml-auto text-sm text-slate-600">
              Товара на складе по закупочным ценам: <b>{formatRub(total)}</b>
            </span>
          )}
        </form>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className={th}>Наименование</th>
                <th className={th}>Артикул</th>
                <th className={`${th} text-right`}>Остаток</th>
                {costs && <th className={`${th} text-right`}>Закупка (средняя)</th>}
                <th className={`${th} text-right`}>Цена продажи</th>
                {costs && <th className={`${th} text-right`}>Сумма по закупке</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className={td}>
                    {r.name}
                    {r.brand && <span className="text-slate-500"> · {r.brand}</span>}
                  </td>
                  <td className={td}>{r.article}</td>
                  <td className={`${td} text-right whitespace-nowrap ${r.qty < 0 ? "text-red-600" : r.qty === 0 ? "text-slate-400" : ""}`}>
                    {formatQty(r.qty)} {r.unit}
                  </td>
                  {costs && <td className={`${td} text-right whitespace-nowrap`}>{r.cost ? formatRub(r.cost) : ""}</td>}
                  <td className={`${td} text-right whitespace-nowrap`}>{formatRub(r.price)}</td>
                  {costs && <td className={`${td} text-right whitespace-nowrap`}>{r.value ? formatRub(r.value) : ""}</td>}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={costs ? 6 : 4} className={`${td} text-slate-500`}>
                    Товаров нет. Добавьте их в справочнике «Товары и материалы».
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
