import Link from "next/link";
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
import { getOrder, orderSummary, STAGES, stageLabel } from "@/lib/services/orders";
import { orderPartsRequests, requestStatusLabel } from "@/lib/services/parts-requests";
import { listRecommendations, recStatusLabel } from "@/lib/services/recommendations";
import { canOperate } from "@/lib/roles";
import { Attachments } from "@/components/attachments";
import {
  addItemAction,
  addItemFromCatalogAction,
  addPaymentAction,
  addWorkAction,
  addWorkFromCatalogAction,
  addRecommendationAction,
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

const METHODS = { CASH: "Наличные", CARD: "Карта", BANK_TRANSFER: "Безнал", SBP: "СБП" } as const;

const money = (kop: number) => (kop / 100).toFixed(2).replace(".", ",");

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const o = await getOrder(s.companyId, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [employees, works, products, company, cashboxes, summary, recs, requests] = await Promise.all([
    listEmployees(s.companyId),
    listWorks(s.companyId),
    stockBalances(s.companyId),
    getCompany(s.companyId),
    listCashboxes(s.companyId),
    orderSummary(s.companyId, id),
    listRecommendations(s.companyId, { clientId: o.clientId }),
    orderPartsRequests(s.companyId, id),
  ]);
  // открытые рекомендации клиента и всё, что записано из этого наряда
  const shownRecs = recs.filter((r) => r.status === "OPEN" || r.orderId === o.id || r.doneOrderId === o.id);
  const operator = canOperate(s.role);
  const posted = o.status === "POSTED";
  const t = o.totals;

  return (
    <div className="flex flex-col gap-4">
      <PageTitle
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

      <Card title="Клиент и автомобиль">
        <p className="mb-3 text-sm">
          <Link href={`/app/clients/${o.client.id}`} className="font-medium text-blue-600 hover:underline">
            {o.client.name}
          </Link>{" "}
          {o.client.phone}
        </p>
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
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Причина обращения" className="min-w-64 flex-1">
            <Input name="reason" defaultValue={o.reason ?? ""} disabled={posted} />
          </Field>
          <Field label="Комментарий" className="w-full">
            <Input name="comment" defaultValue={o.comment ?? ""} disabled={posted} />
          </Field>
          {!posted && <Submit variant="ghost">Сохранить</Submit>}
        </ActionForm>
      </Card>

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
                {employees.map((e) => (
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
                {employees.map((e) => (
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
                  {r.status === "NEW" && operator && !posted && (
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
      </Card>

      {operator && (
        <Card title="Сводка">
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

      <Attachments companyId={s.companyId} kind="ORDER" docId={o.id} path={`/app/orders/${o.id}`} />
    </div>
  );
}
