// Товар в панели просмотра — общий для справочника товаров и остатков склада.
import { PreviewRow, PreviewTitle } from "@/components/list-view";
import { formatDate, formatQty } from "@/lib/format";
import { formatRub } from "@/lib/money";
import { moveKindLabel, productPreview } from "@/lib/services/stock";

export async function ProductPreview({ companyId, id, costs }: { companyId: string; id: string; costs: boolean }) {
  const p = await productPreview(companyId, id);
  if (!p) return <p className="text-sm text-slate-500">Товар не найден.</p>;
  const min = p.minQty === null ? null : Number(p.minQty);
  return (
    <>
      <PreviewTitle title={p.name} sub={[p.article, p.brand].filter(Boolean).join(" · ")} href={`/app/catalog/products/${p.id}`} open="Открыть карточку" />
      <PreviewRow label="Группа">{p.group?.name ?? "без группы"}</PreviewRow>
      <PreviewRow label="Цена продажи">{`${formatRub(p.price)} / ${p.unit}`}</PreviewRow>
      {costs && <PreviewRow label="Закупка (средняя)">{p.cost ? formatRub(p.cost) : null}</PreviewRow>}
      <PreviewRow label="Остаток">
        <span className={p.qty < 0 || (min !== null && p.qty < min) ? "text-red-600" : ""}>
          {formatQty(p.qty)} {p.unit}
        </span>
      </PreviewRow>
      <PreviewRow label="Мин. остаток">{min === null ? null : formatQty(min)}</PreviewRow>
      <PreviewRow label="Штрихкод">{p.barcode}</PreviewRow>
      {p.moves.length > 0 && (
        <div className="mt-3 text-sm">
          <div className="mb-1 text-slate-500">Последние движения</div>
          <ul className="flex flex-col gap-0.5">
            {p.moves.map((m) => (
              <li key={m.id} className="flex justify-between gap-3">
                <span>
                  {formatDate(m.date)} · {moveKindLabel(m.kind)}
                </span>
                <span className={`tabular-nums ${Number(m.qty) < 0 ? "text-red-600" : "text-green-700"}`}>
                  {Number(m.qty) > 0 ? "+" : ""}
                  {formatQty(Number(m.qty))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
