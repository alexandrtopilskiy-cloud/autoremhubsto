import Link from "next/link";
import { notFound } from "next/navigation";
import { DictList } from "@/components/dict-list";
import { ActionForm, Submit } from "@/components/form";
import { Card, Field, Input, PageTitle, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatDate, formatQty } from "@/lib/format";
import { formatRub } from "@/lib/money";
import { can } from "@/lib/permissions";
import { listGroups } from "@/lib/services/catalog";
import { dicts } from "@/lib/services/dictionaries";
import { moveKindLabel, productPreview } from "@/lib/services/stock";
import { deleteProductAction, updateProductCardAction } from "../../../manage-actions";
import { GroupSelect } from "../group-select";

const rubInput = (kop: number) => (kop / 100).toFixed(2).replace(".", ",");
const qtyInput = (q: unknown) => (q === null || q === undefined ? "" : String(Number(q)).replace(".", ","));

/** Карточка товара: правка, остаток на складе и последние движения. */
export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const p = await productPreview(s.companyId, id);
  if (!p) notFound();
  const [groups, lists] = await Promise.all([listGroups(s.companyId), dicts(s.companyId, ["UNIT", "BRAND"])]);
  const edit = can(s.perms, "catalog", "EDIT");
  const costs = s.perms.flags.costs;
  return (
    <div className="flex flex-col gap-4">
      <PageTitle tab={`Товар: ${p.name}`}>{p.name}</PageTitle>
      <p className="-mt-2 text-sm text-slate-500">
        {[p.article, p.brand, p.group?.name].filter(Boolean).join(" · ")}
        {[p.article, p.brand, p.group?.name].some(Boolean) && " · "}
        на складе{" "}
        <b className={p.qty < 0 ? "text-red-600" : "text-slate-700"}>
          {formatQty(p.qty)} {p.unit}
        </b>
        {costs && p.cost > 0 && <> · закупка в среднем {formatRub(p.cost)}</>}
      </p>
      <DictList id="units" items={lists.UNIT} />
      <DictList id="brands" items={lists.BRAND} />
      <Card title="Основное">
        <ActionForm action={updateProductCardAction.bind(null, p.id)} className="flex max-w-4xl flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Наименование" className="min-w-64 flex-1">
              <Input name="name" defaultValue={p.name} required disabled={!edit} />
            </Field>
            <Field label="Группа">
              <GroupSelect groups={groups} value={p.groupId} disabled={!edit} />
            </Field>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Артикул">
              <Input name="article" defaultValue={p.article ?? ""} className="w-36" disabled={!edit} />
            </Field>
            <Field label="Бренд">
              <Input name="brand" list="brands" defaultValue={p.brand ?? ""} className="w-36" disabled={!edit} />
            </Field>
            <Field label="Ед.">
              <Input name="unit" list="units" defaultValue={p.unit} className="w-16" disabled={!edit} />
            </Field>
            <Field label="Цена продажи, ₽">
              <Input name="price" defaultValue={rubInput(p.price)} inputMode="decimal" className="w-28" required disabled={!edit} />
            </Field>
            <Field label="Штрихкод">
              <Input name="barcode" defaultValue={p.barcode ?? ""} className="w-40" autoComplete="off" disabled={!edit} />
            </Field>
            <Field label="Мин. остаток">
              <Input name="minQty" defaultValue={qtyInput(p.minQty)} inputMode="decimal" className="w-24" disabled={!edit} />
            </Field>
          </div>
          {edit && (
            <div>
              <Submit>Сохранить</Submit>
            </div>
          )}
        </ActionForm>
        {can(s.perms, "catalog", "FULL") && (
          <ActionForm action={deleteProductAction.bind(null, p.id)} className="mt-4 border-t border-slate-100 pt-3">
            <Submit variant="danger">Удалить товар</Submit>
            <p className="mt-1 text-xs text-slate-500">Товар из складских документов удалить нельзя.</p>
          </ActionForm>
        )}
      </Card>
      <Card title="Движения по складу">
        {p.moves.length === 0 ? (
          <p className="text-sm text-slate-500">
            Движений ещё не было. Товар приходит на склад{" "}
            <Link href="/app/stock/receipts" className="text-blue-600 hover:underline">
              приходной накладной
            </Link>
            .
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className={th}>Дата</th>
                  <th className={th}>Документ</th>
                  <th className={`${th} text-right`}>Количество</th>
                  {costs && <th className={`${th} text-right`}>Себестоимость</th>}
                </tr>
              </thead>
              <tbody>
                {p.moves.map((m) => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className={td}>{formatDate(m.date)}</td>
                    <td className={td}>{moveKindLabel(m.kind)}</td>
                    <td className={`${td} text-right tabular-nums ${Number(m.qty) < 0 ? "text-red-600" : ""}`}>
                      {formatQty(Number(m.qty))} {p.unit}
                    </td>
                    {costs && <td className={`${td} text-right tabular-nums`}>{m.cost ? formatRub(m.cost) : ""}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-500">Последние 10 движений.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
