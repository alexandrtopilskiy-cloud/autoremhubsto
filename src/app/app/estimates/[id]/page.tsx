import Link from "next/link";
import { notFound } from "next/navigation";
import { Attachments } from "@/components/attachments";
import { ActionForm, Submit } from "@/components/form";
import { Badge, Card, Field, Input, PageTitle, Select, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { formatDate, formatQty, orderNo, vehicleTitle } from "@/lib/format";
import { formatRub } from "@/lib/money";
import { groupWorks, listProducts, worksForPicker } from "@/lib/services/catalog";
import { ESTIMATE_STATUSES, estimateStatusLabel, estLineTotal, getEstimate } from "@/lib/services/estimates";
import { getCompany } from "@/lib/services/settings";
import {
  addEstimateCatalogAction,
  addEstimateLineAction,
  estimateToOrderAction,
  removeEstimateLineAction,
  setEstimateStatusAction,
  updateEstimateAction,
} from "../actions";
import { TrashButton } from "@/components/trash-button";
import { trashDocAction } from "@/app/app/trash-actions";
import { can } from "@/lib/permissions";

const money = (kop: number) => (kop / 100).toFixed(2).replace(".", ",");

export default async function EstimatePage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const e = await getEstimate(s.companyId, id).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const [works, products, company] = await Promise.all([worksForPicker(s.companyId), listProducts(s.companyId), getCompany(s.companyId)]);
  const locked = !!e.orderId;
  const sections = [
    { kind: "WORK" as const, title: "Работы", total: e.totals.works, unit: "Н/ч", lines: e.lines.filter((l) => l.kind === "WORK") },
    { kind: "ITEM" as const, title: "Запчасти и материалы", total: e.totals.items, unit: "Кол-во", lines: e.lines.filter((l) => l.kind === "ITEM") },
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageTitle tab={`К-${e.number} ${e.client.name}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {!e.order && can(s.perms, "orders", "FULL") && <TrashButton action={trashDocAction.bind(null, "ESTIMATE", e.id, "/app/estimates")} />}
            <Link
              href={`/app/estimates/${e.id}/print`}
              target="_blank"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
            >
              Печать
            </Link>
            {e.order ? (
              <Link href={`/app/orders/${e.order.id}`} className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white">
                Открыть {orderNo(e.order.number)}
              </Link>
            ) : (
              <ActionForm action={estimateToOrderAction.bind(null, e.id)}>
                <Submit>Создать заказ-наряд</Submit>
              </ActionForm>
            )}
          </div>
        }
      >
        Калькуляция К-{e.number} от {formatDate(e.createdAt)}{" "}
        <Badge tone={e.status === "ACCEPTED" ? "green" : e.status === "SENT" ? "blue" : "slate"}>{estimateStatusLabel(e.status)}</Badge>
      </PageTitle>

      {!locked && (
        <div className="flex flex-wrap gap-1">
          {ESTIMATE_STATUSES.filter((x) => x.value !== "ACCEPTED").map((x) => (
            <ActionForm key={x.value} action={setEstimateStatusAction.bind(null, e.id, x.value)}>
              <button
                className={`rounded-full px-3 py-1 text-sm ${e.status === x.value ? "bg-blue-600 text-white" : "border border-slate-300 bg-white"}`}
              >
                {x.label}
              </button>
            </ActionForm>
          ))}
        </div>
      )}

      <Card title="Клиент и автомобиль">
        <p className="mb-3 text-sm">
          <Link href={`/app/clients/${e.client.id}`} className="font-medium text-blue-600 hover:underline">
            {e.client.name}
          </Link>{" "}
          {e.client.phone}
        </p>
        <ActionForm action={updateEstimateAction.bind(null, e.id)} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="clientId" value={e.clientId} />
          <Field label="Автомобиль">
            <Select name="vehicleId" defaultValue={e.vehicleId ?? ""} disabled={locked}>
              <option value="">Без автомобиля</option>
              {e.client.vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {vehicleTitle(v)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Комментарий" className="min-w-64 flex-1">
            <Input name="comment" defaultValue={e.comment ?? ""} disabled={locked} />
          </Field>
          {!locked && <Submit variant="ghost">Сохранить</Submit>}
        </ActionForm>
      </Card>

      {sections.map((sec) => (
        <Card key={sec.kind} title={`${sec.title} · ${formatRub(sec.total)}`}>
          <table className="mb-3 w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className={th}>Наименование</th>
                <th className={`${th} text-right`}>{sec.unit}</th>
                <th className={`${th} text-right`}>Цена</th>
                <th className={`${th} text-right`}>Скидка</th>
                <th className={`${th} text-right`}>Сумма</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {sec.lines.map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className={td}>
                    {l.name} {l.article && <span className="text-slate-500">{l.article}</span>}
                  </td>
                  <td className={`${td} text-right`}>{formatQty(Number(l.qty))}</td>
                  <td className={`${td} text-right`}>{formatRub(l.price)}</td>
                  <td className={`${td} text-right`}>{l.discount ? `${l.discount}%` : ""}</td>
                  <td className={`${td} text-right whitespace-nowrap`}>{formatRub(estLineTotal(l))}</td>
                  <td className={`${td} text-right`}>
                    {!locked && (
                      <ActionForm action={removeEstimateLineAction.bind(null, e.id, l.id)}>
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
          {!locked && (sec.kind === "WORK" ? works.length > 0 : products.length > 0) && (
            <ActionForm action={addEstimateCatalogAction.bind(null, e.id)} reset className="mb-3 flex flex-wrap items-end gap-3 rounded-md bg-slate-50 p-3">
              <input type="hidden" name="kind" value={sec.kind} />
              <Field label={sec.kind === "WORK" ? "Из справочника" : "Из номенклатуры"} className="min-w-64 flex-1">
                <Select name="refId" defaultValue="">
                  <option value="">Выберите</option>
                  {sec.kind === "WORK"
                    ? groupWorks(works).map(([group, list]) => (
                        <optgroup key={group} label={group}>
                          {list.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name} · {w.price ? formatRub(w.price) : `${formatQty(Number(w.normHours ?? 1))} н/ч`}
                            </option>
                          ))}
                        </optgroup>
                      ))
                    : products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {[p.name, p.article, p.brand].filter(Boolean).join(" · ")} · {formatRub(p.price)}/{p.unit}
                        </option>
                      ))}
                </Select>
              </Field>
              <Field label="Кол-во">
                <Input name="qty" defaultValue="1" inputMode="decimal" className="w-20" />
              </Field>
              <Field label="Скидка, %">
                <Input name="discount" type="number" min={0} max={100} defaultValue={e.client.partsDiscount} className="w-20" />
              </Field>
              <Submit variant="ghost">Добавить</Submit>
            </ActionForm>
          )}
          {!locked && (
            <ActionForm action={addEstimateLineAction.bind(null, e.id)} reset className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="kind" value={sec.kind} />
              <Field label="Наименование" className="min-w-64 flex-1">
                <Input name="name" required />
              </Field>
              {sec.kind === "ITEM" && (
                <Field label="Артикул">
                  <Input name="article" className="w-32" />
                </Field>
              )}
              <Field label={sec.kind === "WORK" ? "Нормочасы" : "Кол-во"}>
                <Input name="qty" defaultValue="1" inputMode="decimal" className="w-24" />
              </Field>
              <Field label={sec.kind === "WORK" ? "Цена за н/ч, ₽" : "Цена, ₽"}>
                <Input
                  name="price"
                  inputMode="decimal"
                  className="w-28"
                  defaultValue={sec.kind === "WORK" && (e.client.hourPrice ?? company.hourPrice) ? money(e.client.hourPrice ?? company.hourPrice) : ""}
                  required
                />
              </Field>
              <Field label="Скидка, %">
                <Input name="discount" type="number" min={0} max={100} defaultValue={sec.kind === "WORK" ? e.client.discount : e.client.partsDiscount} className="w-20" />
              </Field>
              <Submit variant="ghost">Добавить</Submit>
            </ActionForm>
          )}
        </Card>
      ))}

      <Card>
        <p className="text-right text-lg">
          Итого: <b>{formatRub(e.totals.total)}</b>
        </p>
      </Card>

      <Attachments companyId={s.companyId} kind="ESTIMATE" docId={e.id} path={`/app/estimates/${e.id}`} />
    </div>
  );
}
