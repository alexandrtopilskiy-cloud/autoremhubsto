import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/form";
import { OperatorOnly } from "@/components/manager-only";
import { Badge, Card, Field, Input, PageTitle, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { formatDate, formatQty } from "@/lib/format";
import { formatRub } from "@/lib/money";
import { listProducts } from "@/lib/services/catalog";
import { getInventory } from "@/lib/services/warehouse";
import { docStatus, ProductSelect } from "../../product-select";
import { StockTabs } from "../../tabs";
import {
  addInventoryLineAction,
  postInventoryAction,
  removeInventoryLineAction,
  saveInventoryCountsAction,
  unpostInventoryAction,
  updateInventoryCommentAction,
} from "../../warehouse-actions";

export default async function InventoryPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const inv = await getInventory(s.companyId, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const posted = inv.status === "POSTED";
  const inDoc = new Set(inv.lines.map((l) => l.productId));
  const products = posted ? [] : (await listProducts(s.companyId)).filter((p) => !inDoc.has(p.id));
  return (
    <div className="flex flex-col gap-4">
      <StockTabs active="inventory" />
      <OperatorOnly role={s.role}>
        <PageTitle
          actions={
            posted ? (
              <ActionForm action={unpostInventoryAction.bind(null, inv.id)}>
                <Submit variant="ghost">Отменить проведение</Submit>
              </ActionForm>
            ) : (
              <ActionForm action={postInventoryAction.bind(null, inv.id)}>
                <Submit>Провести: выровнять склад по факту</Submit>
              </ActionForm>
            )
          }
        >
          Инвентаризация ИН-{inv.number} от {formatDate(inv.date)} <Badge tone={posted ? "green" : "amber"}>{docStatus(posted)}</Badge>
        </PageTitle>
        <Card>
          <ActionForm action={updateInventoryCommentAction.bind(null, inv.id)} className="flex flex-wrap items-end gap-3">
            <Field label="Комментарий" className="min-w-64 flex-1">
              <Input name="comment" defaultValue={inv.comment ?? ""} disabled={posted} />
            </Field>
            {!posted && <Submit variant="ghost">Сохранить</Submit>}
          </ActionForm>
        </Card>
        <Card title={`Товары · излишек ${formatRub(inv.surplus)} · недостача ${formatRub(inv.shortage)}`}>
          {!posted && (
            <p className="mb-3 text-sm text-slate-600">
              Учётный остаток пересчитается при проведении, если после начала инвентаризации были продажи или приходы.
            </p>
          )}
          <ActionForm action={saveInventoryCountsAction.bind(null, inv.id)}>
            <table className="mb-3 w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className={th}>Наименование</th>
                  <th className={th}>Артикул</th>
                  <th className={`${th} text-right`}>По учёту</th>
                  <th className={`${th} text-right`}>Фактически</th>
                  <th className={`${th} text-right`}>Разница</th>
                  <th className={`${th} text-right`}>Сумма</th>
                  {!posted && <th className={th} />}
                </tr>
              </thead>
              <tbody>
                {inv.lines.map((l) => (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className={td}>{l.product.name}</td>
                    <td className={td}>{l.product.article}</td>
                    <td className={`${td} text-right`}>
                      {formatQty(Number(l.bookQty))} {l.product.unit}
                    </td>
                    <td className={`${td} text-right`}>
                      {posted ? (
                        formatQty(Number(l.actualQty))
                      ) : (
                        <Input
                          name={`q_${l.id}`}
                          defaultValue={String(Number(l.actualQty)).replace(".", ",")}
                          inputMode="decimal"
                          className="w-24 text-right"
                          aria-label={`Фактически: ${l.product.name}`}
                        />
                      )}
                    </td>
                    <td className={`${td} text-right ${l.diff < 0 ? "text-red-600" : l.diff > 0 ? "text-green-700" : ""}`}>
                      {l.diff !== 0 && (l.diff > 0 ? "+" : "") + formatQty(Math.round(l.diff * 1000) / 1000)}
                    </td>
                    <td className={`${td} text-right whitespace-nowrap`}>{l.diff !== 0 && formatRub(l.diffSum)}</td>
                    {!posted && (
                      <td className={`${td} text-right`}>
                        <button
                          formAction={removeInventoryLineAction.bind(null, inv.id, l.id)}
                          className="text-red-600 hover:underline"
                          title="Убрать из инвентаризации"
                        >
                          ✕
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {inv.lines.length === 0 && (
                  <tr>
                    <td colSpan={7} className={`${td} text-slate-500`}>
                      На складе нет остатков. Добавьте найденные товары ниже.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {!posted && inv.lines.length > 0 && <Submit variant="ghost">Сохранить подсчёт</Submit>}
          </ActionForm>
          {!posted && (
            <ActionForm
              action={addInventoryLineAction.bind(null, inv.id)}
              reset
              className="mt-4 flex flex-wrap items-end gap-3 border-t pt-4"
            >
              <Field label="Товар без остатка, найденный на складе" className="min-w-64 flex-1">
                <ProductSelect products={products} />
              </Field>
              <Field label="Фактически">
                <Input name="actualQty" defaultValue="1" inputMode="decimal" className="w-24" />
              </Field>
              <Submit variant="ghost">Добавить</Submit>
            </ActionForm>
          )}
        </Card>
      </OperatorOnly>
    </div>
  );
}
