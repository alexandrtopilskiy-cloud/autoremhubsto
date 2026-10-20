import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/form";
import { Allowed } from "@/components/manager-only";
import { Badge, Card, Field, Input, PageTitle, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { formatDate, formatQty } from "@/lib/format";
import { formatRub } from "@/lib/money";
import { listProducts } from "@/lib/services/catalog";
import { getWriteOff, WRITE_OFF_REASONS } from "@/lib/services/warehouse";
import { docStatus, ProductSelect } from "../../product-select";
import { StockTabs } from "../../tabs";
import {
  addWriteOffLineAction,
  postWriteOffAction,
  removeWriteOffLineAction,
  unpostWriteOffAction,
  updateWriteOffAction,
} from "../../warehouse-actions";

export default async function WriteOffPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const w = await getWriteOff(s.companyId, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const products = await listProducts(s.companyId);
  const posted = w.status === "POSTED";
  return (
    <div className="flex flex-col gap-4">
      <StockTabs active="writeoffs" />
      <Allowed perms={s.perms} section="stock">
        <PageTitle
          actions={
            posted ? (
              <ActionForm action={unpostWriteOffAction.bind(null, w.id)}>
                <Submit variant="ghost">Отменить проведение</Submit>
              </ActionForm>
            ) : (
              <ActionForm action={postWriteOffAction.bind(null, w.id)}>
                <Submit>Провести: списать со склада</Submit>
              </ActionForm>
            )
          }
        >
          Списание СП-{w.number} от {formatDate(w.date)} <Badge tone={posted ? "green" : "amber"}>{docStatus(posted)}</Badge>
        </PageTitle>
        <Card>
          <ActionForm action={updateWriteOffAction.bind(null, w.id)} className="flex flex-wrap items-end gap-3">
            <Field label="Причина" className="min-w-64 flex-1">
              <Input name="reason" list="writeoff-reasons" defaultValue={w.reason ?? ""} disabled={posted} />
            </Field>
            <datalist id="writeoff-reasons">
              {WRITE_OFF_REASONS.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
            {!posted && <Submit variant="ghost">Сохранить</Submit>}
          </ActionForm>
        </Card>
        <Card title={`Товары · себестоимость ${formatRub(w.cost)}`}>
          <table className="mb-3 w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className={th}>Наименование</th>
                <th className={th}>Артикул</th>
                {!posted && <th className={`${th} text-right`}>На складе</th>}
                <th className={`${th} text-right`}>Списать</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {w.lines.map((l) => {
                const have = w.stock.get(l.productId) ?? 0;
                return (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className={td}>{l.product.name}</td>
                    <td className={td}>{l.product.article}</td>
                    {!posted && (
                      <td className={`${td} text-right ${have < Number(l.qty) ? "text-red-600" : ""}`}>
                        {formatQty(have)} {l.product.unit}
                      </td>
                    )}
                    <td className={`${td} text-right`}>
                      {formatQty(Number(l.qty))} {l.product.unit}
                    </td>
                    <td className={`${td} text-right`}>
                      {!posted && (
                        <ActionForm action={removeWriteOffLineAction.bind(null, w.id, l.id)}>
                          <button className="text-red-600 hover:underline" title="Удалить">
                            ✕
                          </button>
                        </ActionForm>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!posted && (
            <ActionForm action={addWriteOffLineAction.bind(null, w.id)} reset className="flex flex-wrap items-end gap-3">
              <Field label="Товар" className="min-w-64 flex-1">
                <ProductSelect products={products} />
              </Field>
              <Field label="Кол-во">
                <Input name="qty" defaultValue="1" inputMode="decimal" className="w-24" />
              </Field>
              <Submit variant="ghost">Добавить</Submit>
            </ActionForm>
          )}
        </Card>
      </Allowed>
    </div>
  );
}
