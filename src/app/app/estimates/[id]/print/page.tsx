import { notFound } from "next/navigation";
import { PrintButton } from "@/app/app/orders/[id]/print/print-button";
import { requireSession } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { formatDate, formatQty, vehicleTitle } from "@/lib/format";
import { formatRub } from "@/lib/money";
import { listOrganizations } from "@/lib/services/employees";
import { estLineTotal, getEstimate } from "@/lib/services/estimates";

export default async function PrintEstimate({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const e = await getEstimate(s.companyId, id).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const org = (await listOrganizations(s.companyId))[0];
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
        Предварительная калькуляция К-{e.number} от {formatDate(e.createdAt)}
      </h1>
      <p className="mb-1">
        <span className="text-slate-600">Клиент:</span> {e.client.name} {e.client.phone}
      </p>
      <p className="mb-4">
        <span className="text-slate-600">Автомобиль:</span> {e.vehicle ? vehicleTitle(e.vehicle) : "—"}
      </p>
      {[
        { title: "Работы", unit: "н/ч", lines: e.lines.filter((l) => l.kind === "WORK") },
        { title: "Запчасти и материалы", unit: "кол-во", lines: e.lines.filter((l) => l.kind === "ITEM") },
      ]
        .filter((b) => b.lines.length > 0)
        .map((b) => (
          <div key={b.title} className="mb-4">
            <h2 className="mb-1 font-semibold">{b.title}</h2>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={cell}>№</th>
                  <th className={`${cell} text-left`}>Наименование</th>
                  <th className={cell}>{b.unit}</th>
                  <th className={cell}>Цена</th>
                  <th className={cell}>Скидка</th>
                  <th className={cell}>Сумма</th>
                </tr>
              </thead>
              <tbody>
                {b.lines.map((l, i) => (
                  <tr key={l.id}>
                    <td className={`${cell} text-center`}>{i + 1}</td>
                    <td className={cell}>{l.name}</td>
                    <td className={`${cell} text-right`}>{formatQty(Number(l.qty))}</td>
                    <td className={`${cell} text-right whitespace-nowrap`}>{formatRub(l.price)}</td>
                    <td className={`${cell} text-right`}>{l.discount ? `${l.discount}%` : ""}</td>
                    <td className={`${cell} text-right whitespace-nowrap`}>{formatRub(estLineTotal(l))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      <p className="text-right text-base">
        Итого: <b>{formatRub(e.totals.total)}</b>
      </p>
      {e.comment && <p className="mt-4">{e.comment}</p>}
      <p className="mt-6 text-xs text-slate-600">
        Калькуляция предварительная. Окончательная стоимость определяется после диагностики и согласования с клиентом.
      </p>
    </div>
  );
}
