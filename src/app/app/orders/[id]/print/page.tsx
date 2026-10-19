import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { formatDate, formatQty, orderNo, vehicleTitle } from "@/lib/format";
import { formatRub, lineTotal } from "@/lib/money";
import { getOrder } from "@/lib/services/orders";
import { PrintButton } from "./print-button";

export default async function PrintOrder({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const o = await getOrder(s.companyId, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const org = o.organization;
  const cell = "border border-slate-400 px-2 py-1";
  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-sm print:p-0">
      <div className="mb-4 flex justify-between print:hidden">
        <span className="text-slate-500">Предпросмотр печати</span>
        <PrintButton />
      </div>
      <p className="font-semibold">{org?.name ?? s.companyName}</p>
      <p className="text-slate-600">
        {[org?.inn && `ИНН ${org.inn}`, org?.address, org?.phone].filter(Boolean).join(", ")}
      </p>
      <h1 className="my-4 text-center text-lg font-bold">
        Заказ-наряд {orderNo(o.number)} от {formatDate(o.acceptedAt)}
      </h1>
      <table className="mb-4 w-full">
        <tbody>
          <tr>
            <td className="w-40 text-slate-600">Заказчик</td>
            <td>
              {o.client.name} {o.client.phone}
            </td>
          </tr>
          <tr>
            <td className="text-slate-600">Автомобиль</td>
            <td>
              {o.vehicle ? vehicleTitle(o.vehicle) : "—"}
              {o.vehicle?.vin && `, VIN ${o.vehicle.vin}`}
            </td>
          </tr>
          <tr>
            <td className="text-slate-600">Пробег</td>
            <td>{o.mileage ? `${o.mileage.toLocaleString("ru-RU")} км` : "—"}</td>
          </tr>
          {o.reason && (
            <tr>
              <td className="text-slate-600">Причина обращения</td>
              <td>{o.reason}</td>
            </tr>
          )}
        </tbody>
      </table>

      {[
        {
          title: "Работы",
          rows: o.works.map((w) => ({ id: w.id, name: w.name, qty: Number(w.normHours), price: w.price, discount: w.discount })),
          unit: "н/ч",
        },
        {
          title: "Запчасти и материалы",
          rows: o.items.map((i) => ({ id: i.id, name: i.name, qty: Number(i.qty), price: i.price, discount: i.discount })),
          unit: "кол-во",
        },
      ]
        .filter((b) => b.rows.length > 0)
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
                {b.rows.map((r, i) => (
                  <tr key={r.id}>
                    <td className={`${cell} text-center`}>{i + 1}</td>
                    <td className={cell}>{r.name}</td>
                    <td className={`${cell} text-right`}>{formatQty(r.qty)}</td>
                    <td className={`${cell} text-right whitespace-nowrap`}>{formatRub(r.price)}</td>
                    <td className={`${cell} text-right`}>{r.discount ? `${r.discount}%` : ""}</td>
                    <td className={`${cell} text-right whitespace-nowrap`}>{formatRub(lineTotal(r))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      <div className="ml-auto w-72">
        <div className="flex justify-between">
          <span>Итого</span>
          <b>{formatRub(o.totals.total)}</b>
        </div>
        <div className="flex justify-between">
          <span>Оплачено</span>
          <span>{formatRub(o.totals.paid)}</span>
        </div>
        <div className="flex justify-between">
          <span>К оплате</span>
          <b>{formatRub(Math.max(0, o.totals.due))}</b>
        </div>
      </div>

      <div className="mt-12 grid grid-cols-2 gap-8">
        <div className="border-t border-slate-400 pt-1 text-slate-600">Исполнитель</div>
        <div className="border-t border-slate-400 pt-1 text-slate-600">Заказчик</div>
      </div>
    </div>
  );
}
