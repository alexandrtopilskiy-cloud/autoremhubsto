import { notFound } from "next/navigation";
import { CarScheme, HAND_FONT } from "@/components/car-scheme";
import { requireSession } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { formatDate, orderNo, vehicleTitle } from "@/lib/format";
import { listAttachments } from "@/lib/services/attachments";
import { dict } from "@/lib/services/dictionaries";
import { damageCode, damageTag, damageText, SIZES } from "@/lib/car-body";
import { getInspection, zoneLabel } from "@/lib/services/inspections";
import { getOrder } from "@/lib/services/orders";
import { PrintButton } from "../print/print-button";

const PHOTO = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export default async function PrintInspection({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const o = await getOrder(s.companyId, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [ins, files, kitList] = await Promise.all([
    getInspection(s.companyId, id),
    listAttachments(s.companyId, "ORDER", id),
    dict(s.companyId, "KIT_ITEM"),
  ]);
  // расшифровка только тех кодов, что есть в акте
  const codes = [...new Map(ins.damages.map((d) => [damageCode(d.type).code, damageCode(d.type).name])).entries()];
  const kit = [...kitList, ...ins.items.filter((x) => !kitList.includes(x))];
  const photos = files.filter((f) => PHOTO.includes(f.mime));
  const org = o.organization;
  const v = o.vehicle;
  const fuel = ins.fuel === null ? "не указан" : ins.fuel === 0 ? "пустой бак" : ins.fuel === 100 ? "полный бак" : `${ins.fuel / 25}/4 бака`;
  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-sm print:p-0">
      <div className="mb-4 flex justify-between print:hidden">
        <span className="text-slate-500">Предпросмотр печати</span>
        <PrintButton />
      </div>
      <p className="font-semibold">{org?.name ?? s.companyName}</p>
      <p className="text-slate-600">{[org?.inn && `ИНН ${org.inn}`, org?.address, org?.phone].filter(Boolean).join(", ")}</p>
      <h1 className="my-4 text-center text-lg font-bold">
        Акт осмотра автомобиля к заказ-наряду {orderNo(o.number, o.numberPrefix)} от {formatDate(o.acceptedAt)}
      </h1>
      <table className="mb-4 w-full">
        <tbody>
          <tr>
            <td className="w-40 text-slate-600">Владелец</td>
            <td>
              {o.client.name} {o.client.phone}
            </td>
          </tr>
          <tr>
            <td className="text-slate-600">Автомобиль</td>
            <td>
              {v ? vehicleTitle(v) : "—"}
              {v?.vin && `, VIN ${v.vin}`}
              {v?.color && `, цвет ${v.color}`}
            </td>
          </tr>
          <tr>
            <td className="text-slate-600">Пробег</td>
            <td>{o.mileage ? `${o.mileage.toLocaleString("ru-RU")} км` : "—"}</td>
          </tr>
          <tr>
            <td className="text-slate-600">Топливо</td>
            <td>{fuel}</td>
          </tr>
        </tbody>
      </table>

      <div className="mb-4 flex gap-6">
        <div className="w-64 shrink-0">
          <CarScheme damages={ins.damages} className="w-full border border-slate-300" />
          <table className="mt-2 text-[10px] leading-tight text-slate-600">
            <tbody>
              {codes.map(([code, name]) => (
                <tr key={code}>
                  <td className="pr-2 font-bold text-red-600" style={{ fontFamily: HAND_FONT }}>
                    {code}
                  </td>
                  <td>{name}</td>
                </tr>
              ))}
              <tr>
                <td className="pr-2 whitespace-nowrap">1–3</td>
                <td>размер: {Object.entries(SIZES).map(([n, t]) => `${n} — ${t}`).join(", ")}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex-1">
          <h2 className="mb-1 font-semibold">Повреждения</h2>
          {ins.damages.length ? (
            <table className="mb-3">
              <tbody>
                {ins.damages.map((d, i) => (
                  <tr key={i}>
                    <td className="pr-2 align-top font-bold text-red-600" style={{ fontFamily: HAND_FONT }}>
                      {damageTag(d)}
                    </td>
                    <td>
                      {zoneLabel(d.zone)}: {damageText(d).toLowerCase()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mb-3">Видимых повреждений не отмечено.</p>
          )}
          <h2 className="mb-1 font-semibold">Комплектность</h2>
          <ul className="mb-3 grid grid-cols-2 gap-x-4">
            {kit.map((k) => (
              <li key={k}>
                {ins.items.includes(k) ? "☑" : "☐"} {k}
              </li>
            ))}
          </ul>
          {(ins.dirty || ins.dark) && (
            <p className="mb-2 font-medium">
              {[ins.dirty && "Автомобиль принят грязным", ins.dark && "Автомобиль принят в тёмное время суток"].filter(Boolean).join(". ")}
              . Скрытые повреждения могут быть не отмечены.
            </p>
          )}
          {ins.notes && <p>Примечания: {ins.notes}</p>}
        </div>
      </div>

      {photos.length > 0 && (
        <div className="mb-4 grid grid-cols-3 gap-2">
          {photos.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p.id} src={`/app/files/${p.id}`} alt={p.name} className="h-40 w-full break-inside-avoid object-cover" />
          ))}
        </div>
      )}

      <p className="mb-8 text-xs text-slate-600">
        С результатами осмотра согласен. Ценные вещи из автомобиля изъяты, за оставленные вещи сервис ответственности не несёт.
      </p>
      <div className="grid grid-cols-2 gap-8">
        <div className="border-t border-slate-400 pt-1 text-slate-600">Сдал (владелец)</div>
        <div className="border-t border-slate-400 pt-1 text-slate-600">Принял (мастер-приёмщик)</div>
      </div>
    </div>
  );
}
