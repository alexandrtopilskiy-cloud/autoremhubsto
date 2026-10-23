import { Attachments } from "@/components/attachments";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/form";
import { Allowed } from "@/components/manager-only";
import { Badge, Card, Field, Input, PageTitle, Select, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { formatDate, formatQty, receiptNo } from "@/lib/format";
import { formatRub } from "@/lib/money";
import { listProducts } from "@/lib/services/catalog";
import { getReceipt, listSuppliers, receiptLineSum } from "@/lib/services/stock";
import {
  addReceiptLineAction,
  postReceiptAction,
  removeReceiptLineAction,
  unpostReceiptAction,
  updateReceiptAction,
} from "../../actions";
import { ProductSelect } from "../../product-select";
import { StockTabs } from "../../tabs";
import { TrashButton } from "@/components/trash-button";
import { DocToolbar } from "@/components/doc-toolbar";
import { trashDocAction } from "@/app/app/trash-actions";
import { can } from "@/lib/permissions";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const r = await getReceipt(s.companyId, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [suppliers, products] = await Promise.all([listSuppliers(s.companyId), listProducts(s.companyId)]);
  const posted = r.status === "POSTED";
  return (
    <div className="flex flex-col gap-4">
      <StockTabs active="receipts" />
      <Allowed perms={s.perms} section="stock" flag="costs">
        <PageTitle tab={`${receiptNo(r.number, r.numberPrefix)}`}
          actions={
            <DocToolbar
              exitHref="/app/stock/receipts"
              editable={!posted}
              post={postReceiptAction.bind(null, r.id)}
              postLabel="Провести: оприходовать товар"
              unpost={unpostReceiptAction.bind(null, r.id)}
              trash={!posted && can(s.perms, "stock", "FULL") && <TrashButton icon action={trashDocAction.bind(null, "RECEIPT", r.id, "/app/stock/receipts")} />}
            />
          }
        >
          Приход {receiptNo(r.number, r.numberPrefix)} от {formatDate(r.date)}{" "}
          <Badge tone={posted ? "green" : "amber"}>{posted ? "Проведён" : "Черновик"}</Badge>
        </PageTitle>
        <Card>
          <ActionForm doc action={updateReceiptAction.bind(null, r.id)} className="flex flex-wrap items-end gap-3">
            <Field label="Поставщик">
              <Select name="supplierId" defaultValue={r.supplierId ?? ""} disabled={posted}>
                <option value="">Не указан</option>
                {suppliers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Документ поставщика">
              <Input name="supplierDoc" defaultValue={r.supplierDoc ?? ""} disabled={posted} />
            </Field>
            <Field label="Комментарий" className="min-w-64 flex-1">
              <Input name="comment" defaultValue={r.comment ?? ""} disabled={posted} />
            </Field>
          </ActionForm>
        </Card>
        <Card title={`Товары · ${formatRub(r.total)}`}>
          <table className="mb-3 w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className={th}>Наименование</th>
                <th className={th}>Артикул</th>
                <th className={`${th} text-right`}>Кол-во</th>
                <th className={`${th} text-right`}>Закупочная цена</th>
                <th className={`${th} text-right`}>Сумма</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {r.lines.map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className={td}>{l.product.name}</td>
                  <td className={td}>{l.product.article}</td>
                  <td className={`${td} text-right`}>
                    {formatQty(Number(l.qty))} {l.product.unit}
                  </td>
                  <td className={`${td} text-right whitespace-nowrap`}>{formatRub(l.cost)}</td>
                  <td className={`${td} text-right whitespace-nowrap`}>{formatRub(receiptLineSum(l))}</td>
                  <td className={`${td} text-right`}>
                    {!posted && (
                      <ActionForm action={removeReceiptLineAction.bind(null, r.id, l.id)}>
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
            <ActionForm action={addReceiptLineAction.bind(null, r.id)} reset className="flex flex-wrap items-end gap-3">
              <Field label="Товар" className="min-w-64 flex-1">
                <ProductSelect products={products} />
              </Field>
              <Field label="Кол-во">
                <Input name="qty" defaultValue="1" inputMode="decimal" className="w-24" />
              </Field>
              <Field label="Закупочная цена, ₽">
                <Input name="cost" inputMode="decimal" className="w-32" required />
              </Field>
              <Submit variant="ghost">Добавить</Submit>
            </ActionForm>
          )}
        </Card>
        {r.payments.length > 0 && (
          <Card title={`Оплаты поставщику · оплачено ${formatRub(r.paid)}${r.due > 0 ? `, долг ${formatRub(r.due)}` : ""}`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className={th}>Дата</th>
                  <th className={th}>Касса / счёт</th>
                  <th className={th}>Комментарий</th>
                  <th className={`${th} text-right`}>Сумма</th>
                </tr>
              </thead>
              <tbody>
                {r.payments.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className={td}>{formatDate(p.date)}</td>
                    <td className={td}>{p.cashbox.name}</td>
                    <td className={td}>{p.comment}</td>
                    <td className={`${td} text-right whitespace-nowrap`}>{formatRub(-p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
        <Attachments companyId={s.companyId} kind="RECEIPT" docId={r.id} path={`/app/stock/receipts/${r.id}`} />
      </Allowed>
    </div>
  );
}
