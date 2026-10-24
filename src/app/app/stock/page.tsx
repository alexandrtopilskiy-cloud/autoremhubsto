import Link from "next/link";
import { Card, Input, PageTitle, Select, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { PreviewHint } from "@/components/list-view";
import { ListRow, PreviewPane } from "@/components/preview-pane";
import { previewHref, previewId } from "@/lib/list-query";
import { formatQty } from "@/lib/format";
import { formatRub } from "@/lib/money";
import { can } from "@/lib/permissions";
import { listGroups } from "@/lib/services/catalog";
import { stockBalances } from "@/lib/services/stock";
import { StockTabs } from "./tabs";
import { ProductPreview } from "../catalog/products/preview";
import { previewSession } from "@/lib/preview";
import { LiveForm } from "@/components/busy";

const PATH = "/app/stock";

/** Панель просмотра по клику на строку: загружается отдельно, список не пересчитывается. */
async function loadPreview(id: string) {
  "use server";
  const s = await previewSession("stock");
  return s ? <ProductPreview companyId={s.companyId} id={id} costs={s.perms.flags.costs} /> : null;
}

export default async function StockPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const [q, group, deficit] = [sp.q, sp.group, sp.deficit].map((v) => (typeof v === "string" ? v : undefined));
  const preview = previewId(sp);
  const [rows, groups] = await Promise.all([
    stockBalances(s.companyId, q, { groupId: group || undefined, deficit: !!deficit }),
    listGroups(s.companyId),
  ]);
  const short = rows.filter((r) => r.shortage > 0).length;
  const total = rows.reduce((sum, r) => sum + Math.max(0, r.value), 0);
  const costs = s.perms.flags.costs;
  return (
    <div className="flex flex-col gap-4">
      <PageTitle>Склад</PageTitle>
      <StockTabs active="balances" />
      <PreviewPane
        load={loadPreview}
        selected={preview}
        panel={preview ? <ProductPreview companyId={s.companyId} id={preview} costs={costs} /> : <PreviewHint what="товар" open="карточку товара" />}
        list={
          <Card>
            <LiveForm className="mb-3 flex flex-wrap items-center gap-2">
              <Input name="q" defaultValue={q} placeholder="Наименование, артикул, бренд или штрихкод" className="min-w-80" />
              <Select name="group" defaultValue={group ?? ""} aria-label="Группа">
                <option value="">Все группы</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
                <option value="none">Без группы</option>
              </Select>
              <label className="flex items-center gap-1 text-sm">
                <input type="checkbox" name="deficit" value="1" defaultChecked={!!deficit} /> только ниже минимума
              </label>
              <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Найти</button>
              {costs && (
                <span className="ml-auto text-sm text-slate-600">
                  Товара на складе по закупочным ценам: <b>{formatRub(total)}</b>
                </span>
              )}
            </LiveForm>
            {short > 0 && (
              <p className="mb-3 text-sm text-red-700">
                Ниже минимального остатка: <b>{short}</b>.{" "}
                {costs && can(s.perms, "stock", "CREATE") && (
                  <>
                    Создайте{" "}
                    <Link href="/app/stock/orders" className="text-blue-600 hover:underline">
                      заказ поставщику
                    </Link>{" "}
                    и нажмите в нём «Добавить дефицит».
                  </>
                )}
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className={th}>Наименование</th>
                    <th className={th}>Артикул</th>
                    <th className={th}>Группа</th>
                    <th className={`${th} text-right`}>Остаток</th>
                    <th className={`${th} text-right`}>Мин.</th>
                    <th className={`${th} text-right`}>К заказу</th>
                    {costs && <th className={`${th} text-right`}>Закупка (средняя)</th>}
                    <th className={`${th} text-right`}>Цена продажи</th>
                    {costs && <th className={`${th} text-right`}>Сумма по закупке</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <ListRow key={r.id} previewHref={previewHref(PATH, sp, r.id)} openHref={`/app/catalog/products/${r.id}`} selected={preview === r.id}>
                      <td className={td}>
                        {r.name}
                        {r.brand && <span className="text-slate-500"> · {r.brand}</span>}
                      </td>
                      <td className={td}>{r.article}</td>
                      <td className={`${td} text-slate-600`}>{r.group?.name}</td>
                      <td
                        className={`${td} text-right whitespace-nowrap ${r.qty < 0 || r.shortage > 0 ? "text-red-600" : r.qty === 0 ? "text-slate-400" : ""}`}
                      >
                        {formatQty(r.qty)} {r.unit}
                      </td>
                      <td className={`${td} text-right whitespace-nowrap text-slate-600`}>{r.minQty === null ? "" : formatQty(r.minQty)}</td>
                      <td className={`${td} text-right font-medium whitespace-nowrap text-red-600`}>{r.shortage > 0 ? formatQty(r.shortage) : ""}</td>
                      {costs && <td className={`${td} text-right whitespace-nowrap`}>{r.cost ? formatRub(r.cost) : ""}</td>}
                      <td className={`${td} text-right whitespace-nowrap`}>{formatRub(r.price)}</td>
                      {costs && <td className={`${td} text-right whitespace-nowrap`}>{r.value ? formatRub(r.value) : ""}</td>}
                    </ListRow>
                  ))}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={costs ? 9 : 7} className={`${td} text-slate-500`}>
                        {deficit ? "Товаров ниже минимального остатка нет." : "Товаров нет. Добавьте их в справочнике «Товары и материалы»."}
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
