import { notFound } from "next/navigation";
import { PrintButton } from "@/app/app/orders/[id]/print/print-button";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { formatDate, formatQty } from "@/lib/format";
import { formatRub } from "@/lib/money";
import { getSupplierOrder } from "@/lib/services/supplier-orders";

/** Бланк заказа для отправки поставщику. */
export default async function PrintSupplierOrder({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const o = await getSupplierOrder(s.companyId, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const org = await prisma.organization.findFirst({
    where: { companyId: s.companyId },
    orderBy: { createdAt: "asc" },
  });
  const cell = "border border-slate-400 px-2 py-1";
  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-sm print:p-0">
      <div className="mb-4 flex justify-between print:hidden">
        <span className="text-slate-500">Предпросмотр печати</span>
        <PrintButton />
      </div>
      <p>
        Поставщик: <b>{o.supplier.name}</b>
        {o.supplier.inn && `, ИНН ${o.supplier.inn}`}
      </p>
      <p>
        Покупатель: <b>{org?.name ?? s.companyName}</b>
        {org?.inn && `, ИНН ${org.inn}`}
        {org?.phone && `, ${org.phone}`}
      </p>
      <h1 className="my-4 text-center text-lg font-bold">
        Заказ № {o.number} от {formatDate(o.createdAt)}
      </h1>
      <table className="mb-4 w-full border-collapse">
        <thead>
          <tr>
            <th className={cell}>№</th>
            <th className={`${cell} text-left`}>Наименование</th>
            <th className={cell}>Артикул</th>
            <th className={cell}>Бренд</th>
            <th className={cell}>Кол-во</th>
            <th className={cell}>Цена</th>
            <th className={cell}>Сумма</th>
          </tr>
        </thead>
        <tbody>
          {o.lines.map((l, i) => (
            <tr key={l.id}>
              <td className={`${cell} text-center`}>{i + 1}</td>
              <td className={cell}>{l.product.name}</td>
              <td className={cell}>{l.product.article}</td>
              <td className={cell}>{l.product.brand}</td>
              <td className={`${cell} text-right whitespace-nowrap`}>
                {formatQty(Number(l.qty))} {l.product.unit}
              </td>
              <td className={`${cell} text-right whitespace-nowrap`}>{formatRub(l.cost)}</td>
              <td className={`${cell} text-right whitespace-nowrap`}>{formatRub(Math.round(Number(l.qty) * l.cost))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-right">
        Итого: <b>{formatRub(o.total)}</b>
      </p>
      {o.comment && <p className="mt-2">Комментарий: {o.comment}</p>}
    </div>
  );
}
