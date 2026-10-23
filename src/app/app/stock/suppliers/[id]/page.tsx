import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/form";
import { Allowed } from "@/components/manager-only";
import { Card, Field, Input, PageTitle } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatDate, receiptNo } from "@/lib/format";
import { formatRub } from "@/lib/money";
import { can } from "@/lib/permissions";
import { supplierPreview } from "@/lib/services/stock";
import { supplierOrderStatusLabel } from "@/lib/services/supplier-orders";
import { updateSupplierAction } from "../../actions";

/** Карточка поставщика: реквизиты и последние приходы и заказы. */
export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const p = await supplierPreview(s.companyId, id);
  if (!p) notFound();
  const edit = can(s.perms, "stock", "EDIT");
  return (
    <Allowed perms={s.perms} section="stock">
      <div className="flex flex-col gap-4">
        <PageTitle tab={`Поставщик: ${p.name}`}>{p.name}</PageTitle>
        <Card title="Основное">
          <ActionForm action={updateSupplierAction.bind(null, p.id)} className="flex max-w-4xl flex-wrap items-end gap-3">
            <Field label="Название" className="min-w-64 flex-1">
              <Input name="name" defaultValue={p.name} required disabled={!edit} />
            </Field>
            <Field label="ИНН">
              <Input name="inn" defaultValue={p.inn ?? ""} className="w-36" disabled={!edit} />
            </Field>
            <Field label="Телефон">
              <Input name="phone" defaultValue={p.phone ?? ""} disabled={!edit} />
            </Field>
            <Field label="Комментарий" className="min-w-64 flex-1">
              <Input name="comment" defaultValue={p.comment ?? ""} disabled={!edit} />
            </Field>
            {edit && <Submit>Сохранить</Submit>}
          </ActionForm>
        </Card>
        {s.perms.flags.costs && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Приходы">
              {p.receipts.length === 0 && <p className="text-sm text-slate-500">Приходов от поставщика ещё не было.</p>}
              <ul className="flex flex-col gap-1 text-sm">
                {p.receipts.map((r) => (
                  <li key={r.id} className="flex justify-between gap-2">
                    <Link href={`/app/stock/receipts/${r.id}`} className="text-blue-600 hover:underline">
                      {receiptNo(r.number, r.numberPrefix)} от {formatDate(r.date)}
                    </Link>
                    <span className="tabular-nums">{formatRub(r.total)}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="Заказы поставщику">
              {p.orders.length === 0 && <p className="text-sm text-slate-500">Заказов ещё не было.</p>}
              <ul className="flex flex-col gap-1 text-sm">
                {p.orders.map((o) => (
                  <li key={o.id} className="flex justify-between gap-2">
                    <Link href={`/app/stock/orders/${o.id}`} className="text-blue-600 hover:underline">
                      ЗП-{o.number} от {formatDate(o.createdAt)}
                    </Link>
                    <span className="text-slate-500">{supplierOrderStatusLabel(o.status)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}
      </div>
    </Allowed>
  );
}
