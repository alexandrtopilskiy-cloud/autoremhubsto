import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/form";
import { Allowed } from "@/components/manager-only";
import { Badge, Card, Field, Input, PageTitle, Select, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { formatDate, formatQty } from "@/lib/format";
import { formatRub, lineTotal } from "@/lib/money";
import { listCashboxes } from "@/lib/services/cash";
import { listProducts } from "@/lib/services/catalog";
import { listClients } from "@/lib/services/clients";
import { getSale } from "@/lib/services/warehouse";
import { docStatus, ProductSelect } from "../../product-select";
import { StockTabs } from "../../tabs";
import {
  addSaleLineAction,
  addSalePaymentAction,
  postSaleAction,
  removeSaleLineAction,
  unpostSaleAction,
  updateSaleAction,
} from "../../warehouse-actions";
import { TrashButton } from "@/components/trash-button";
import { DocToolbar } from "@/components/doc-toolbar";
import { trashDocAction } from "@/app/app/trash-actions";
import { can } from "@/lib/permissions";

const money = (kop: number) => (kop / 100).toFixed(2).replace(".", ",");

export default async function SalePage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const sale = await getSale(s.companyId, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [clients, products, cashboxes] = await Promise.all([
    listClients(s.companyId),
    listProducts(s.companyId),
    listCashboxes(s.companyId),
  ]);
  const posted = sale.status === "POSTED";
  const t = sale.totals;
  return (
    <div className="flex flex-col gap-4">
      <StockTabs active="sales" />
      <Allowed perms={s.perms} section="stock">
        <PageTitle tab={`РТ-${sale.number}`}
          actions={
            <DocToolbar
              exitHref="/app/stock/sales"
              editable={!posted}
              post={postSaleAction.bind(null, sale.id)}
              postLabel="Провести: списать товар"
              unpost={unpostSaleAction.bind(null, sale.id)}
              trash={!posted && can(s.perms, "stock", "FULL") && <TrashButton icon action={trashDocAction.bind(null, "SALE", sale.id, "/app/stock/sales")} />}
            />
          }
        >
          Продажа РТ-{sale.number} от {formatDate(sale.date)} <Badge tone={posted ? "green" : "amber"}>{docStatus(posted)}</Badge>
        </PageTitle>
        <Card>
          <ActionForm doc action={updateSaleAction.bind(null, sale.id)} className="flex flex-wrap items-end gap-3">
            <Field label="Покупатель">
              <Select name="clientId" defaultValue={sale.clientId ?? ""} disabled={posted}>
                <option value="">Розничный покупатель</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.discount ? ` (скидка ${c.discount}%)` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Комментарий" className="min-w-64 flex-1">
              <Input name="comment" defaultValue={sale.comment ?? ""} disabled={posted} />
            </Field>
          </ActionForm>
        </Card>
        <Card title={`Товары · ${formatRub(t.total)}`}>
          <table className="mb-3 w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className={th}>Наименование</th>
                <th className={th}>Артикул</th>
                <th className={`${th} text-right`}>Кол-во</th>
                <th className={`${th} text-right`}>Цена</th>
                <th className={`${th} text-right`}>Скидка</th>
                <th className={`${th} text-right`}>Сумма</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {sale.lines.map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className={td}>{l.product.name}</td>
                  <td className={td}>{l.product.article}</td>
                  <td className={`${td} text-right`}>
                    {formatQty(Number(l.qty))} {l.product.unit}
                  </td>
                  <td className={`${td} text-right whitespace-nowrap`}>{formatRub(l.price)}</td>
                  <td className={`${td} text-right`}>{l.discount ? `${l.discount}%` : ""}</td>
                  <td className={`${td} text-right whitespace-nowrap`}>
                    {formatRub(
                      lineTotal({
                        qty: Number(l.qty),
                        price: l.price,
                        discount: l.discount,
                      }),
                    )}
                  </td>
                  <td className={`${td} text-right`}>
                    {!posted && (
                      <ActionForm action={removeSaleLineAction.bind(null, sale.id, l.id)}>
                        <button className="text-red-600 hover:underline" title="Удалить">
                          ✕
                        </button>
                      </ActionForm>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!posted && (
            <ActionForm action={addSaleLineAction.bind(null, sale.id)} reset className="flex flex-wrap items-end gap-3">
              <Field label="Товар" className="min-w-64 flex-1">
                <ProductSelect products={products} />
              </Field>
              <Field label="Кол-во">
                <Input name="qty" defaultValue="1" inputMode="decimal" className="w-24" />
              </Field>
              <Field label="Цена, ₽">
                <Input name="price" inputMode="decimal" className="w-32" placeholder="из справочника" />
              </Field>
              <Field label="Скидка, %">
                <Input name="discount" inputMode="numeric" className="w-24" placeholder="клиента" />
              </Field>
              <Submit variant="ghost">Добавить</Submit>
            </ActionForm>
          )}
        </Card>
        <Card title="Оплата">
          <div className="mb-3 flex flex-wrap gap-6 text-sm">
            <div>
              Итого: <b>{formatRub(t.total)}</b>
            </div>
            <div>
              Оплачено: <b>{formatRub(t.paid)}</b>
            </div>
            <div className={t.due > 0 ? "text-red-600" : t.due < 0 ? "text-amber-700" : "text-green-700"}>
              {t.due > 0 ? "К оплате" : t.due < 0 ? "Переплата" : "Оплачено полностью"}
              {t.due !== 0 && <b>: {formatRub(Math.abs(t.due))}</b>}
            </div>
          </div>
          {sale.payments.length > 0 && (
            <ul className="mb-3 flex flex-col gap-1 text-sm">
              {sale.payments.map((p) => (
                <li key={p.id}>
                  {formatDate(p.date, true)} · {p.cashbox.name} ·{" "}
                  <b className={p.amount < 0 ? "text-red-600" : ""}>{formatRub(p.amount)}</b>
                </li>
              ))}
            </ul>
          )}
          <ActionForm key={t.due} action={addSalePaymentAction.bind(null, sale.id)} reset className="flex flex-wrap items-end gap-3">
            <Field label="Сумма, ₽">
              <Input name="amount" inputMode="decimal" defaultValue={t.due > 0 ? money(t.due) : ""} className="w-32" required />
            </Field>
            <Field label="Касса">
              <Select name="cashboxId" defaultValue={cashboxes[0]?.id ?? ""}>
                {cashboxes.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <label className="flex items-center gap-1 pb-2 text-sm">
              <input type="checkbox" name="refund" value="1" /> возврат
            </label>
            <Submit variant="ghost">Принять оплату</Submit>
          </ActionForm>
        </Card>
      </Allowed>
    </div>
  );
}
