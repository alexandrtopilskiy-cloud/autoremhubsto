import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/form";
import { Badge, Card, Field, Input, PageTitle, Select, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { formatDate, formatQty, orderNo, vehicleTitle } from "@/lib/format";
import { formatRub, lineTotal } from "@/lib/money";
import { listWorks } from "@/lib/services/catalog";
import { listEmployees } from "@/lib/services/employees";
import { getCompany } from "@/lib/services/settings";
import { listCashboxes } from "@/lib/services/cash";
import { stockBalances } from "@/lib/services/stock";
import { clientOrderStats, getOrder, orderSummary, STAGES, stageLabel } from "@/lib/services/orders";
import { orderPartsRequests, requestStatusLabel } from "@/lib/services/parts-requests";
import { listRecommendations, recStatusLabel } from "@/lib/services/recommendations";
import { can } from "@/lib/permissions";
import { Attachments } from "@/components/attachments";
import { ContactLinks } from "@/components/contact-links";
import { dicts } from "@/lib/services/dictionaries";
import { FUEL_LEVELS, getInspection } from "@/lib/services/inspections";
import { InspectionEditor } from "./inspection-editor";
import {
  addItemAction,
  addItemFromCatalogAction,
  addPaymentAction,
  addWorkAction,
  addWorkFromCatalogAction,
  addRecommendationAction,
  saveInspectionAction,
  cancelRequestAction,
  issueRequestAction,
  lineToRecommendationAction,
  postAction,
  recommendationToOrderAction,
  removeRequestLineAction,
  requestPartAction,
  setRecommendationStatusAction,
  removeItemAction,
  removeWorkAction,
  setStageAction,
  unpostAction,
  updateHeaderAction,
} from "../actions";
import { DictList } from "@/components/dict-list";

const METHODS = { CASH: "Наличные", CARD: "Карта", BANK_TRANSFER: "Безнал", SBP: "СБП" } as const;

const money = (kop: number) => (kop / 100).toFixed(2).replace(".", ",");

/** Внутренние вкладки документа; выбранная хранится в адресе (?tab=), чтобы после сохранения форм оставаться на ней. */
const TABS = [
  { key: "info", label: "Информация" },
  { key: "inspection", label: "Акт осмотра" },
  { key: "lines", label: "Работы и запчасти" },
  { key: "payment", label: "Оплата" },
  { key: "client", label: "Свод по клиенту" },
] as const;
type Tab = (typeof TABS)[number]["key"];

function Tile({ label, children, note, tone }: { label: string; children: ReactNode; note?: ReactNode; tone?: "red" | "green" }) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2.5">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`text-xl font-semibold tabular-nums ${tone === "red" ? "text-red-600" : tone === "green" ? "text-green-700" : ""}`}>{children}</div>
      {note && <div className="text-xs text-slate-500">{note}</div>}
    </div>
  );
}

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const s = await requireSession();
  const { id } = await params;
  const sp = await searchParams;
  const tab: Tab = TABS.find((x) => x.key === sp.tab)?.key ?? "info";
  const o = await getOrder(s.companyId, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [managers, executors, works, products, company, cashboxes, summary, recs, requests, stats] = await Promise.all([
    listEmployees(s.companyId, "MANAGER"),
    listEmployees(s.companyId, "EXECUTOR"),
    listWorks(s.companyId),
    stockBalances(s.companyId),
    getCompany(s.companyId),
    listCashboxes(s.companyId),
    orderSummary(s.companyId, id),
    listRecommendations(s.companyId, { clientId: o.clientId }),
    orderPartsRequests(s.companyId, id),
    clientOrderStats(s.companyId, o.clientId),
  ]);
  const [inspection, lists] = await Promise.all([getInspection(s.companyId, id), dicts(s.companyId, ["DAMAGE_TYPE", "KIT_ITEM", "REPAIR_KIND"])]);
  // открытые рекомендации клиента и всё, что записано из этого наряда
  const shownRecs = recs.filter((r) => r.status === "OPEN" || r.orderId === o.id || r.doneOrderId === o.id);
  const issuer = can(s.perms, "stock", "EDIT");
  const cashier = can(s.perms, "cash", "CREATE");
  const car = o.vehicle ? vehicleTitle(o.vehicle) : "автомобиль";
  const message =
    o.stage === "READY"
      ? `Здравствуйте, ${o.client.name}! ${car} готов, можно забирать. К оплате ${formatRub(Math.max(0, o.totals.due))}. ${s.companyName}`
      : `Здравствуйте, ${o.client.name}! Пишем по заказ-наряду ${orderNo(o.number)} (${car}). ${s.companyName}`;
  const posted = o.status === "POSTED";
  const t = o.totals;
  const counts: Partial<Record<Tab, number>> = { inspection: inspection.damages.length, lines: o.works.length + o.items.length };
  const lastVisit = stats.orders.find((x) => x.id !== o.id);

  return (
    <div className="flex flex-col gap-4">
      <PageTitle tab={`${orderNo(o.number)} ${o.client.name}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/app/orders/${o.id}/print`}
              target="_blank"
              className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
            >
              Печать
            </Link>
            {posted ? (
              <ActionForm action={unpostAction.bind(null, o.id)}>
                <Submit variant="ghost">Отменить проведение</Submit>
              </ActionForm>
            ) : (
              <ActionForm action={postAction.bind(null, o.id)}>
                <Submit>Провести и закрыть</Submit>
              </ActionForm>
            )}
          </div>
        }
      >
        {orderNo(o.number)} от {formatDate(o.acceptedAt)}{" "}
        <Badge tone={posted ? "green" : "amber"}>{posted ? "Проведён" : "Черновик"}</Badge>
      </PageTitle>

      <nav className="flex flex-wrap gap-x-6 gap-y-1 border-b border-slate-200">
        {TABS.map((x, i) => (
          <Link
            key={x.key}
            href={`/app/orders/${o.id}?tab=${x.key}`}
            scroll={false}
            className={`-mb-px flex items-center gap-1.5 border-b-2 py-2 text-[15px] ${x.key === tab ? "border-blue-500 font-medium text-blue-600" : "border-transparent text-slate-600 hover:text-blue-600"}`}
          >
            {i + 1}. {x.label}
            {!!counts[x.key] && <span className="rounded-full bg-slate-100 px-1.5 text-xs font-medium text-slate-600">{counts[x.key]}</span>}
            {x.key === "payment" && t.due > 0 && <span className="rounded-full bg-red-600 px-1.5 text-xs font-medium text-white">долг</span>}
          </Link>
        ))}
      </nav>

      <div className="flex flex-wrap gap-1">
        {STAGES.filter((x) => x.value !== "CLOSED").map((x) => (
          <ActionForm key={x.value} action={setStageAction.bind(null, o.id, x.value)}>
            <button
              disabled={posted}
              className={`rounded-full px-3 py-1 text-sm ${
                o.stage === x.value ? "bg-blue-600 text-white" : "border border-slate-300 bg-white disabled:opacity-50"
              }`}
            >
              {x.label}
            </button>
          </ActionForm>
        ))}
        {posted && <span className="rounded-full bg-green-600 px-3 py-1 text-sm text-white">{stageLabel("CLOSED")}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-dashed border-slate-200 pb-3 text-sm text-slate-500">
        <span>
          Клиент:{" "}
          <Link href={`/app/clients/${o.client.id}`} className="font-medium text-slate-800 hover:text-blue-600">
            {o.client.name}
          </Link>
        </span>
        {o.vehicle && (
          <span>
            Автомобиль: <b className="font-medium text-slate-800">{vehicleTitle(o.vehicle)}</b>
          </span>
        )}
        <span className="flex flex-wrap gap-x-4 tabular-nums md:ml-auto">
          <span>
            Итого <b className="text-slate-800">{formatRub(t.total)}</b>
          </span>
          <span>
            Оплачено <b className="text-slate-800">{formatRub(t.paid)}</b>
          </span>
          {t.due > 0 ? (
            <span className="text-red-600">
              К оплате <b>{formatRub(t.due)}</b>
            </span>
          ) : t.due < 0 ? (
            <span className="text-amber-700">
              Переплата <b>{formatRub(-t.due)}</b>
            </span>
          ) : (
            t.total > 0 && <span className="text-green-700">Оплачен полностью</span>
          )}
        </span>
      </div>

      {tab === "info" && (
        <>
          <Card title="Клиент">
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-slate-500">Имя</dt>
              <dd>
                <Link href={`/app/clients/${o.client.id}`} className="font-medium text-blue-600 hover:underline">
                  {o.client.name}
                </Link>
              </dd>
              <dt className="text-slate-500">Телефон</dt>
              <dd>
                {o.client.phone ?? "не указан"}
                <ContactLinks phone={o.client.phone} text={message} />
              </dd>
              {o.client.discount > 0 && (
                <>
                  <dt className="text-slate-500">Скидка</dt>
                  <dd>{o.client.discount}%</dd>
                </>
              )}
              {o.client.source && (
                <>
                  <dt className="text-slate-500">Откуда узнал</dt>
                  <dd>{o.client.source}</dd>
                </>
              )}
              {o.vehicle?.vin && (
                <>
                  <dt className="text-slate-500">VIN</dt>
                  <dd>{o.vehicle.vin}</dd>
                </>
              )}
            </dl>
          </Card>

          <Card title="Автомобиль и обращение">
            <ActionForm action={updateHeaderAction.bind(null, o.id)} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="clientId" value={o.clientId} />
              <input type="hidden" name="organizationId" value={o.organizationId ?? ""} />
              <Field label="Автомобиль">
                <Select name="vehicleId" defaultValue={o.vehicleId ?? ""} disabled={posted}>
                  <option value="">Без автомобиля</option>
                  {o.client.vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {vehicleTitle(v)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Пробег, км">
                <Input name="mileage" type="number" min={0} defaultValue={o.mileage ?? ""} className="w-32" disabled={posted} />
              </Field>
              <Field label="Менеджер">
                <Select name="managerId" defaultValue={o.managerId ?? ""} disabled={posted}>
                  <option value="">Не указан</option>
                  {(o.manager && !managers.some((e) => e.id === o.managerId) ? [o.manager, ...managers] : managers).map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Причина обращения" className="min-w-64 flex-1">
                <Input name="reason" list="repair-kinds" defaultValue={o.reason ?? ""} disabled={posted} />
                <DictList id="repair-kinds" items={lists.REPAIR_KIND} />
              </Field>
              <Field label="Комментарий" className="w-full">
                <Input name="comment" defaultValue={o.comment ?? ""} disabled={posted} />
              </Field>
              {!posted && <Submit variant="ghost">Сохранить</Submit>}
            </ActionForm>
          </Card>
        </>
      )}

      {tab === "inspection" && (
        <>
          <Card
            title="Акт осмотра"
            actions={
              <Link href={`/app/orders/${o.id}/inspection`} target="_blank" className="text-sm text-blue-600 hover:underline">
                Печать акта
              </Link>
            }
          >
            <InspectionEditor orderId={o.id} damages={inspection.damages} types={lists.DAMAGE_TYPE} readOnly={posted} />
            <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4">
                <ActionForm action={saveInspectionAction.bind(null, o.id)} className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-end gap-4">
                    <Field label="Топливо">
                      <Select name="fuel" defaultValue={inspection.fuel ?? ""} disabled={posted}>
                        <option value="">Не указано</option>
                        {FUEL_LEVELS.map((f) => (
                          <option key={f} value={f}>
                            {f === 0 ? "Пустой бак" : f === 100 ? "Полный бак" : `${f / 25}/4 бака`}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <label className="flex items-center gap-1 pb-2 text-sm">
                      <input type="checkbox" name="dirty" defaultChecked={inspection.dirty} disabled={posted} /> Грязный автомобиль
                    </label>
                    <label className="flex items-center gap-1 pb-2 text-sm">
                      <input type="checkbox" name="dark" defaultChecked={inspection.dark} disabled={posted} /> Принят в тёмное время
                    </label>
                  </div>
                  <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    <legend className="mb-1 text-slate-600">Комплектность</legend>
                    {[...lists.KIT_ITEM, ...inspection.items.filter((x) => !lists.KIT_ITEM.includes(x))].map((k) => (
                      <label key={k} className="flex items-center gap-1">
                        <input type="checkbox" name="items" value={k} defaultChecked={inspection.items.includes(k)} disabled={posted} /> {k}
                      </label>
                    ))}
                  </fieldset>
                  <Field label="Примечания">
                    <Input name="notes" defaultValue={inspection.notes ?? ""} disabled={posted} placeholder="Личные вещи в салоне, следы ремонта и т.п." />
                  </Field>
                  {!posted && (
                    <div>
                      <Submit variant="ghost">Сохранить акт</Submit>
                    </div>
                  )}
                </ActionForm>
                <p className="text-xs text-slate-500">Фото автомобиля прикрепите ниже в «Файлы и фото», они попадут в печатный акт.</p>
            </div>
          </Card>

          <Attachments companyId={s.companyId} kind="ORDER" docId={o.id} path={`/app/orders/${o.id}`} />
        </>
      )}

      {tab === "lines" && (
        <>
          <Card title={`Работы · ${formatRub(t.works)}`}>
            <table className="mb-3 w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className={th}>Работа</th>
                  <th className={th}>Исполнитель</th>
                  <th className={`${th} text-right`}>Н/ч</th>
                  <th className={`${th} text-right`}>Цена</th>
                  <th className={`${th} text-right`}>Скидка</th>
                  <th className={`${th} text-right`}>Сумма</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {o.works.map((w) => (
                  <tr key={w.id} className="border-b last:border-0">
                    <td className={td}>{w.name}</td>
                    <td className={td}>{w.executor?.name}</td>
                    <td className={`${td} text-right`}>{formatQty(Number(w.normHours))}</td>
                    <td className={`${td} text-right`}>{formatRub(w.price)}</td>
                    <td className={`${td} text-right`}>{w.discount ? `${w.discount}%` : ""}</td>
                    <td className={`${td} text-right whitespace-nowrap`}>
                      {formatRub(lineTotal({ qty: Number(w.normHours), price: w.price, discount: w.discount }))}
                    </td>
                    <td className={`${td} text-right`}>
                      {!posted && (
                        <div className="flex justify-end gap-3">
                          <ActionForm action={lineToRecommendationAction.bind(null, o.id, "WORK", w.id)}>
                            <button className="text-slate-500 hover:text-blue-600" title="Клиент отказался: перенести в рекомендации">
                              ↷
                            </button>
                          </ActionForm>
                          <ActionForm action={removeWorkAction.bind(null, o.id, w.id)}>
                            <button className="text-red-600 hover:underline" title="Удалить">
                              ✕
                            </button>
                          </ActionForm>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!posted && works.length > 0 && (
              <ActionForm action={addWorkFromCatalogAction.bind(null, o.id)} reset className="mb-3 flex flex-wrap items-end gap-3 rounded-md bg-slate-50 p-3">
                <Field label="Из справочника" className="min-w-64 flex-1">
                  <Select name="refId" defaultValue="">
                    <option value="">Выберите работу</option>
                    {works.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} · {w.price ? formatRub(w.price) : `${formatQty(Number(w.normHours ?? 1))} н/ч`}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Кол-во">
                  <Input name="qty" defaultValue="1" inputMode="decimal" className="w-20" />
                </Field>
                <Field label="Скидка, %">
                  <Input name="discount" type="number" min={0} max={100} defaultValue={o.client.discount} className="w-20" />
                </Field>
                <Field label="Исполнитель">
                  <Select name="executorId" defaultValue="">
                    <option value="">Не указан</option>
                    {executors.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Submit variant="ghost">Добавить</Submit>
              </ActionForm>
            )}
            {!posted && (
              <ActionForm action={addWorkAction.bind(null, o.id)} reset className="flex flex-wrap items-end gap-3">
                <Field label="Работа" className="min-w-64 flex-1">
                  <Input name="name" required />
                </Field>
                <Field label="Нормочасы">
                  <Input name="normHours" defaultValue="1" inputMode="decimal" className="w-24" />
                </Field>
                <Field label="Цена за н/ч, ₽">
                  <Input name="price" defaultValue={company.hourPrice ? money(company.hourPrice) : ""} inputMode="decimal" className="w-28" required />
                </Field>
                <Field label="Скидка, %">
                  <Input name="discount" type="number" min={0} max={100} defaultValue={o.client.discount} className="w-20" />
                </Field>
                <Field label="Исполнитель">
                  <Select name="executorId" defaultValue="">
                    <option value="">Не указан</option>
                    {executors.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Submit variant="ghost">Добавить</Submit>
              </ActionForm>
            )}
          </Card>

          <Card title={`Запчасти и материалы · ${formatRub(t.items)}`}>
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
                {o.items.map((i) => (
                  <tr key={i.id} className="border-b last:border-0">
                    <td className={td}>{i.name}</td>
                    <td className={td}>{i.article}</td>
                    <td className={`${td} text-right`}>{formatQty(Number(i.qty))}</td>
                    <td className={`${td} text-right`}>{formatRub(i.price)}</td>
                    <td className={`${td} text-right`}>{i.discount ? `${i.discount}%` : ""}</td>
                    <td className={`${td} text-right whitespace-nowrap`}>
                      {formatRub(lineTotal({ qty: Number(i.qty), price: i.price, discount: i.discount }))}
                    </td>
                    <td className={`${td} text-right`}>
                      {!posted && (
                        <div className="flex justify-end gap-3">
                          <ActionForm action={lineToRecommendationAction.bind(null, o.id, "ITEM", i.id)}>
                            <button className="text-slate-500 hover:text-blue-600" title="Клиент отказался: перенести в рекомендации">
                              ↷
                            </button>
                          </ActionForm>
                          <ActionForm action={removeItemAction.bind(null, o.id, i.id)}>
                            <button className="text-red-600 hover:underline" title="Удалить">
                              ✕
                            </button>
                          </ActionForm>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!posted && products.length > 0 && (
              <ActionForm action={addItemFromCatalogAction.bind(null, o.id)} reset className="mb-3 flex flex-wrap items-end gap-3 rounded-md bg-slate-50 p-3">
                <Field label="Из номенклатуры" className="min-w-64 flex-1">
                  <Select name="refId" defaultValue="">
                    <option value="">Выберите товар</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {[p.name, p.article, p.brand].filter(Boolean).join(" · ")} · {formatRub(p.price)}/{p.unit} · остаток {formatQty(p.qty)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="или штрихкод">
                  <Input name="barcode" className="w-36" autoComplete="off" />
                </Field>
                <Field label="Кол-во">
                  <Input name="qty" defaultValue="1" inputMode="decimal" className="w-20" />
                </Field>
                <Field label="Скидка, %">
                  <Input name="discount" type="number" min={0} max={100} defaultValue={o.client.discount} className="w-20" />
                </Field>
                <Submit variant="ghost">Добавить</Submit>
              </ActionForm>
            )}
            {!posted && (
              <ActionForm action={addItemAction.bind(null, o.id)} reset className="flex flex-wrap items-end gap-3">
                <Field label="Наименование" className="min-w-64 flex-1">
                  <Input name="name" required />
                </Field>
                <Field label="Артикул">
                  <Input name="article" className="w-32" />
                </Field>
                <Field label="Кол-во">
                  <Input name="qty" defaultValue="1" inputMode="decimal" className="w-20" />
                </Field>
                <Field label="Цена, ₽">
                  <Input name="price" inputMode="decimal" className="w-28" required />
                </Field>
                <Field label="Скидка, %">
                  <Input name="discount" type="number" min={0} max={100} defaultValue={o.client.discount} className="w-20" />
                </Field>
                <Submit variant="ghost">Добавить</Submit>
              </ActionForm>
            )}
          </Card>

          <Card title="Требования на запчасти">
            {requests.length > 0 && (
              <ul className="mb-3 flex flex-col gap-2 text-sm">
                {requests.map((r) => (
                  <li key={r.id} className="rounded-md border border-slate-200 p-2">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <b>ТР-{r.number}</b>
                      <Badge tone={r.status === "NEW" ? "amber" : r.status === "ISSUED" ? "green" : "slate"}>{requestStatusLabel(r.status)}</Badge>
                      <span className="text-slate-500">
                        {formatDate(r.createdAt, true)}
                        {r.requestedBy && `, ${r.requestedBy.name}`}
                      </span>
                      {r.status === "NEW" && issuer && !posted && (
                        <span className="ml-auto flex gap-2">
                          <ActionForm action={issueRequestAction.bind(null, o.id, r.id)}>
                            <Submit variant="ghost">Выдать</Submit>
                          </ActionForm>
                          <ActionForm action={cancelRequestAction.bind(null, o.id, r.id)}>
                            <Submit variant="danger">Отклонить</Submit>
                          </ActionForm>
                        </span>
                      )}
                    </div>
                    <ul>
                      {r.lines.map((l) => (
                        <li key={l.id} className="flex gap-2">
                          {l.product.name} {l.product.article && <span className="text-slate-500">{l.product.article}</span>} ·{" "}
                          {formatQty(Number(l.qty))} {l.product.unit}
                          {r.status === "NEW" && !posted && (
                            <ActionForm action={removeRequestLineAction.bind(null, o.id, r.id, l.id)}>
                              <button className="text-red-600 hover:underline" title="Убрать из требования">
                                ✕
                              </button>
                            </ActionForm>
                          )}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
            {!posted && products.length > 0 && (
              <ActionForm action={requestPartAction.bind(null, o.id)} reset className="flex flex-wrap items-end gap-3">
                <Field label="Запросить со склада" className="min-w-64 flex-1">
                  <Select name="productId" defaultValue="">
                    <option value="">Выберите товар</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {[p.name, p.article, p.brand].filter(Boolean).join(" · ")} · остаток {formatQty(p.qty)} {p.unit}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Кол-во">
                  <Input name="qty" defaultValue="1" inputMode="decimal" className="w-20" />
                </Field>
                <Submit variant="ghost">Запросить</Submit>
              </ActionForm>
            )}
            {requests.length === 0 && posted && <p className="text-sm text-slate-500">Требований не было</p>}
            {!posted && products.length === 0 && (
              <p className="text-sm text-slate-500">
                Запросить товар со склада можно, когда в <Link href="/app/catalog/products" className="text-blue-600 hover:underline">номенклатуре</Link> есть товары.
              </p>
            )}
          </Card>
        </>
      )}

      {tab === "payment" && (
        <>
          <Card title="Оплаты">
            <div className="mb-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <div>
                Итого: <b>{formatRub(t.total)}</b>
              </div>
              <div>
                Оплачено: <b>{formatRub(t.paid)}</b>
              </div>
              <div className={t.due > 0 ? "text-red-600" : t.due < 0 ? "text-amber-700" : "text-green-700"}>
                {t.due > 0 ? "К оплате" : t.due < 0 ? "Переплата" : "Оплачен полностью"}
                {t.due !== 0 && <b>: {formatRub(Math.abs(t.due))}</b>}
              </div>
            </div>
            {o.payments.length > 0 && (
              <ul className="mb-3 flex flex-col gap-1 text-sm">
                {o.payments.map((p) => (
                  <li key={p.id}>
                    {formatDate(p.paidAt, true)} · {METHODS[p.method]}
                    {p.cashbox && ` (${p.cashbox.name})`} ·{" "}
                    <b className={p.amount < 0 ? "text-red-600" : ""}>{formatRub(p.amount)}</b>
                    {p.comment && <span className="text-slate-500"> · {p.comment}</span>}
                  </li>
                ))}
              </ul>
            )}
            {cashier && (
            <ActionForm key={t.due} action={addPaymentAction.bind(null, o.id)} reset className="flex flex-wrap items-end gap-3">
              <Field label="Сумма, ₽">
                <Input name="amount" inputMode="decimal" defaultValue={t.due > 0 ? money(t.due) : ""} className="w-32" required />
              </Field>
              <Field label="Способ">
                <Select name="method" defaultValue="CARD">
                  {Object.entries(METHODS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Касса">
                <Select name="cashboxId" defaultValue="">
                  <option value="">Автоматически</option>
                  {cashboxes.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Комментарий">
                <Input name="comment" />
              </Field>
              <label className="flex items-center gap-1 pb-2 text-sm">
                <input type="checkbox" name="refund" value="1" /> возврат
              </label>
              <Submit variant="ghost">Провести оплату</Submit>
            </ActionForm>
            )}
          </Card>

          {s.perms.flags.costs && (
            <Card title="Экономика наряда">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-slate-500">Себестоимость товаров</dt>
                  <dd className="font-medium">{formatRub(summary.cost)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Исполнителям</dt>
                  <dd className="font-medium">{formatRub(summary.executors)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Менеджеру</dt>
                  <dd className="font-medium">{formatRub(summary.manager)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Прибыль</dt>
                  <dd className={`font-semibold ${summary.profit < 0 ? "text-red-600" : "text-green-700"}`}>{formatRub(summary.profit)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Запчасти к работам</dt>
                  <dd className="font-medium">{summary.itemsToWorks === null ? "—" : summary.itemsToWorks.toLocaleString("ru-RU")}</dd>
                </div>
              </dl>
              {summary.manualItems && (
                <p className="mt-2 text-xs text-slate-500">Товары, введённые вручную, а не из номенклатуры, посчитаны без себестоимости.</p>
              )}
            </Card>
          )}
        </>
      )}

      {tab === "client" && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="Визитов" note={stats.first ? `первый ${formatDate(stats.first)}` : undefined}>
              {stats.visits}
            </Tile>
            <Tile label="Потратил всего" note={stats.visits > 0 && `средний чек ${formatRub(stats.average)}`}>
              {formatRub(stats.total)}
            </Tile>
            <Tile label="Долг по всем нарядам" tone={stats.due > 0 ? "red" : undefined}>
              {stats.due > 0 ? formatRub(stats.due) : "нет"}
            </Tile>
            <Tile label="Прошлый визит" note={lastVisit?.mileage ? `пробег ${lastVisit.mileage.toLocaleString("ru-RU")} км` : undefined}>
              {lastVisit ? formatDate(lastVisit.acceptedAt) : "—"}
            </Tile>
          </div>

          <Card
            title="История обращений"
            actions={
              <Link href={`/app/clients/${o.client.id}`} className="text-sm text-blue-600 hover:underline">
                Карточка клиента
              </Link>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className={th}>Номер</th>
                    <th className={th}>Дата</th>
                    <th className={th}>Автомобиль</th>
                    <th className={th}>Причина</th>
                    <th className={th}>Стадия</th>
                    <th className={`${th} text-right`}>Сумма</th>
                    <th className={`${th} text-right`}>Долг</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.orders.map((x) => (
                    <tr key={x.id} className={`border-b last:border-0 ${x.id === o.id ? "bg-blue-50" : ""}`}>
                      <td className={td}>
                        <Link href={`/app/orders/${x.id}?tab=client`} className="text-blue-600 hover:underline">
                          {orderNo(x.number)}
                        </Link>
                      </td>
                      <td className={td}>{formatDate(x.acceptedAt)}</td>
                      <td className={td}>{x.vehicle ? vehicleTitle(x.vehicle) : ""}</td>
                      <td className={td}>{x.reason}</td>
                      <td className={td}>
                        <Badge tone={x.stage === "CLOSED" ? "green" : x.stage === "READY" ? "blue" : "slate"}>{stageLabel(x.stage)}</Badge>
                      </td>
                      <td className={`${td} text-right whitespace-nowrap`}>{formatRub(x.totals.total)}</td>
                      <td className={`${td} text-right whitespace-nowrap ${x.totals.due > 0 ? "text-red-600" : ""}`}>
                        {x.totals.due > 0 ? formatRub(x.totals.due) : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Рекомендации клиенту">
            {shownRecs.length > 0 && (
              <table className="mb-3 w-full text-sm">
                <tbody>
                  {shownRecs.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className={td}>
                        {r.name}
                        {r.comment && <span className="text-slate-500"> · {r.comment}</span>}
                        <div className="text-xs text-slate-500">
                          {r.kind === "WORK" ? "Работа" : "Товар"} · {formatDate(r.createdAt)}
                          {r.order && r.order.id !== o.id && <> · из {orderNo(r.order.number)}</>}
                        </div>
                      </td>
                      <td className={`${td} text-right whitespace-nowrap`}>
                        {formatQty(Number(r.qty))} × {formatRub(r.price)}
                      </td>
                      <td className={td}>
                        <Badge tone={r.status === "OPEN" ? "amber" : r.status === "DONE" ? "green" : "slate"}>{recStatusLabel(r.status)}</Badge>
                      </td>
                      <td className={`${td} text-right`}>
                        {r.status === "OPEN" ? (
                          <div className="flex justify-end gap-2">
                            {!posted && (
                              <ActionForm action={recommendationToOrderAction.bind(null, o.id, r.id)}>
                                <button className="text-blue-600 hover:underline">В наряд</button>
                              </ActionForm>
                            )}
                            <ActionForm action={setRecommendationStatusAction.bind(null, o.id, r.id, "DECLINED")}>
                              <button className="text-slate-500 hover:underline">Отказ</button>
                            </ActionForm>
                          </div>
                        ) : (
                          <ActionForm action={setRecommendationStatusAction.bind(null, o.id, r.id, "OPEN")}>
                            <button className="text-slate-500 hover:underline">Вернуть</button>
                          </ActionForm>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <ActionForm action={addRecommendationAction.bind(null, o.id)} reset className="flex flex-wrap items-end gap-3">
              <Field label="Что рекомендуем">
                <Select name="kind" defaultValue="WORK">
                  <option value="WORK">Работа</option>
                  <option value="ITEM">Товар</option>
                </Select>
              </Field>
              <Field label="Наименование" className="min-w-64 flex-1">
                <Input name="name" required />
              </Field>
              <Field label="Кол-во">
                <Input name="qty" defaultValue="1" inputMode="decimal" className="w-20" />
              </Field>
              <Field label="Цена, ₽">
                <Input name="price" inputMode="decimal" className="w-28" />
              </Field>
              <Field label="Комментарий" className="min-w-48">
                <Input name="comment" />
              </Field>
              <Submit variant="ghost">Добавить</Submit>
            </ActionForm>
          </Card>
        </>
      )}
    </div>
  );
}
