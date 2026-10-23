import { notFound } from "next/navigation";
import { PrintButton } from "@/app/app/orders/[id]/print/print-button";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NotFoundError } from "@/lib/errors";
import { formatDate, formatQty } from "@/lib/format";
import { formatRub, lineTotal, discountLabel } from "@/lib/money";
import { getSale } from "@/lib/services/warehouse";

/** 5.6 Товарный чек к продаже без ремонта. */
export default async function SaleReceipt({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const sale = await getSale(s.companyId, id).catch((e) => {
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
      <p className="font-semibold">{org?.name ?? s.companyName}</p>
      <p className="text-slate-600">{[org?.inn && `ИНН ${org.inn}`, org?.address, org?.phone].filter(Boolean).join(", ")}</p>
      <h1 className="my-4 text-center text-lg font-bold">
        Товарный чек № {sale.number} от {formatDate(sale.date)}
      </h1>
      {sale.client && <p className="mb-2">Покупатель: {sale.client.name}</p>}
      <table className="mb-4 w-full border-collapse">
        <thead>
          <tr>
            <th className={cell}>№</th>
            <th className={`${cell} text-left`}>Наименование</th>
            <th className={cell}>Ед.</th>
            <th className={cell}>Кол-во</th>
            <th className={cell}>Цена</th>
            <th className={cell}>Скидка</th>
            <th className={cell}>Сумма</th>
          </tr>
        </thead>
        <tbody>
          {sale.lines.map((l, i) => (
            <tr key={l.id}>
              <td className={`${cell} text-center`}>{i + 1}</td>
              <td className={cell}>
                {l.product.name}
                {l.product.article && <span className="text-slate-500"> ({l.product.article})</span>}
              </td>
              <td className={`${cell} text-center`}>{l.product.unit}</td>
              <td className={`${cell} text-right`}>{formatQty(Number(l.qty))}</td>
              <td className={`${cell} text-right whitespace-nowrap`}>{formatRub(l.price)}</td>
              <td className={`${cell} text-right`}>{discountLabel(l)}</td>
              <td className={`${cell} text-right whitespace-nowrap`}>
                {formatRub(
                  lineTotal({
                    qty: Number(l.qty),
                    price: l.price,
                    discount: l.discount,
                    discountSum: l.discountSum,
                  }),
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ml-auto w-72">
        <div className="flex justify-between">
          <span>Итого</span>
          <b>{formatRub(sale.totals.total)}</b>
        </div>
        <div className="flex justify-between">
          <span>Оплачено</span>
          <span>{formatRub(sale.totals.paid)}</span>
        </div>
      </div>
      <p className="mt-4">
        Всего наименований {sale.lines.length}, на сумму {formatRub(sale.totals.total)}
      </p>
      <div className="mt-12 grid grid-cols-2 gap-8">
        <div className="border-t border-slate-400 pt-1 text-slate-600">Продавец</div>
        <div className="border-t border-slate-400 pt-1 text-slate-600">Покупатель</div>
      </div>
    </div>
  );
}
