import { ActionForm, Submit } from "@/components/form";
import { Allowed } from "@/components/manager-only";
import { Card, Field, Input, PageTitle, Select, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { PreviewHint, PreviewRow, PreviewTitle } from "@/components/list-view";
import { ListRow, PreviewPane } from "@/components/preview-pane";
import { previewHref, previewId } from "@/lib/list-query";
import { formatDate } from "@/lib/format";
import { formatRub } from "@/lib/money";
import { can } from "@/lib/permissions";
import { cashJournal, listCashboxes } from "@/lib/services/cash";
import { listCategories } from "@/lib/services/cash-categories";
import { getCompany } from "@/lib/services/settings";
import { listSuppliers } from "@/lib/services/stock";
import { addDays, isDateStr, localToUtc, todayLocal } from "@/lib/time";
import { addOperationAction, createCashboxAction, deleteOperationAction, transferAction } from "./actions";

const PATH = "/app/cash";

export default async function CashPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; box?: string; preview?: string }>;
}) {
  const s = await requireSession();
  const sp = await searchParams;
  const company = await getCompany(s.companyId);
  const tz = company.utcOffset;
  const to = isDateStr(sp.to) ? sp.to : todayLocal(tz);
  const from = isDateStr(sp.from) ? sp.from : `${to.slice(0, 8)}01`;

  const [boxes, suppliers, categories] = await Promise.all([listCashboxes(s.companyId), listSuppliers(s.companyId), listCategories(s.companyId)]);
  const active = boxes.filter((b) => !b.hidden);
  const box = boxes.find((b) => b.id === sp.box)?.id;
  const journal = await cashJournal(s.companyId, localToUtc(from, "00:00", tz), localToUtc(addDays(to, 1), "00:00", tz), box);
  const income = journal.filter((r) => r.amount > 0).reduce((a, r) => a + r.amount, 0);
  const expense = journal.filter((r) => r.amount < 0).reduce((a, r) => a + r.amount, 0);
  const preview = previewId(sp);
  const sel = journal.find((r) => r.id === preview);

  return (
    <div className="flex flex-col gap-4">
      <PageTitle>Касса</PageTitle>
      <Allowed perms={s.perms} section="cash">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {active.map((b) => (
            <Card key={b.id}>
              <p className="text-sm text-slate-600">{b.name}</p>
              <p className={`text-xl font-semibold ${b.balance < 0 ? "text-red-600" : ""}`}>{formatRub(b.balance)}</p>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Приход или расход">
            <ActionForm action={addOperationAction} reset className="flex flex-wrap items-end gap-3">
              <Field label="Операция">
                <Select name="direction" defaultValue="OUT">
                  <option value="OUT">Расход</option>
                  <option value="IN">Приход</option>
                </Select>
              </Field>
              <Field label="Касса">
                <Select name="cashboxId">
                  {active.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Сумма, ₽">
                <Input name="amount" inputMode="decimal" className="w-32" required />
              </Field>
              <Field label="Статья">
                <Select name="category" defaultValue="">
                  <option value="">Выберите</option>
                  <optgroup label="Расход">
                    {categories
                      .filter((c) => !c.income)
                      .map((c) => (
                        <option key={c.id}>{c.name}</option>
                      ))}
                  </optgroup>
                  <optgroup label="Приход">
                    {categories
                      .filter((c) => c.income)
                      .map((c) => (
                        <option key={c.id}>{c.name}</option>
                      ))}
                  </optgroup>
                </Select>
              </Field>
              <Field label="Поставщик">
                <Select name="supplierId" defaultValue="">
                  <option value="">Нет</option>
                  {suppliers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Комментарий" className="min-w-48 flex-1">
                <Input name="comment" />
              </Field>
              <Submit>Провести</Submit>
            </ActionForm>
          </Card>
          <Card title="Перемещение денег">
            <ActionForm action={transferAction} reset className="flex flex-wrap items-end gap-3">
              <Field label="Откуда">
                <Select name="fromId" defaultValue={active[0]?.id}>
                  {active.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Куда">
                <Select name="toId" defaultValue={active[1]?.id}>
                  {active.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Сумма, ₽">
                <Input name="amount" inputMode="decimal" className="w-32" required />
              </Field>
              <Submit variant="ghost">Переместить</Submit>
            </ActionForm>
            {can(s.perms, "cash", "FULL") && (
              <>
                <h3 className="mt-4 mb-2 text-sm font-semibold">Новая касса или счёт</h3>
                <ActionForm action={createCashboxAction} reset className="flex flex-wrap items-end gap-3">
                  <Field label="Название">
                    <Input name="name" required />
                  </Field>
                  <Field label="Тип">
                    <Select name="kind" defaultValue="CASH">
                      <option value="CASH">Наличные</option>
                      <option value="BANK">Безналичный счёт</option>
                    </Select>
                  </Field>
                  <Submit variant="ghost">Добавить</Submit>
                </ActionForm>
              </>
            )}
          </Card>
        </div>

        <PreviewPane
          selected={preview}
          panel={
            sel ? (
              <>
                <PreviewTitle
                  title={<span className={sel.amount < 0 ? "text-red-600" : "text-green-700"}>{formatRub(sel.amount)}</span>}
                  sub={formatDate(sel.date, true)}
                  href={sel.orderId ? `/app/orders/${sel.orderId}` : undefined}
                  open="Открыть заказ-наряд"
                />
                <PreviewRow label="Операция">{sel.title}</PreviewRow>
                <PreviewRow label="Касса">{sel.cashbox}</PreviewRow>
                <PreviewRow label="Комментарий">{sel.comment}</PreviewRow>
                {sel.operationId && can(s.perms, "cash", "FULL") && (
                  <ActionForm action={deleteOperationAction.bind(null, sel.operationId)} className="mt-3">
                    <Submit variant="danger">Удалить операцию</Submit>
                  </ActionForm>
                )}
                {sel.orderId && <p className="mt-3 text-xs text-slate-500">Оплату заказ-наряда меняют и удаляют в самом наряде, на вкладке «Оплата».</p>}
              </>
            ) : (
              <PreviewHint what="операцию" open="заказ-наряд, если это его оплата" />
            )
          }
          list={
            <Card title="Движение денег">
              <form className="mb-3 flex flex-wrap items-end gap-2">
                <Field label="С">
                  <Input type="date" name="from" defaultValue={from} />
                </Field>
                <Field label="По">
                  <Input type="date" name="to" defaultValue={to} />
                </Field>
                <Field label="Касса">
                  <Select name="box" defaultValue={box ?? ""}>
                    <option value="">Все</option>
                    {boxes.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Показать</button>
                <span className="ml-auto text-sm">
                  Приход <b className="text-green-700">{formatRub(income)}</b> · Расход <b className="text-red-600">{formatRub(-expense)}</b>
                </span>
              </form>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className={th}>Дата</th>
                      <th className={th}>Касса</th>
                      <th className={th}>Операция</th>
                      <th className={th}>Комментарий</th>
                      <th className={`${th} text-right`}>Сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    {journal.map((r) => (
                      <ListRow key={r.id} previewHref={previewHref(PATH, sp, r.id)} openHref={r.orderId ? `/app/orders/${r.orderId}` : undefined} selected={preview === r.id}>
                        <td className={`${td} whitespace-nowrap`}>{formatDate(r.date, true)}</td>
                        <td className={td}>{r.cashbox}</td>
                        <td className={td}>
                          {r.orderId ? (
                            <span className="text-blue-600">
                              {r.title}
                            </span>
                          ) : (
                            r.title
                          )}
                        </td>
                        <td className={`${td} text-slate-600`}>{r.comment}</td>
                        <td className={`${td} text-right whitespace-nowrap font-medium ${r.amount < 0 ? "text-red-600" : "text-green-700"}`}>
                          {formatRub(r.amount)}
                        </td>
                      </ListRow>
                    ))}
                    {journal.length === 0 && (
                      <tr>
                        <td colSpan={5} className={`${td} text-slate-500`}>
                          За период движений нет
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          }
        />
      </Allowed>
    </div>
  );
}
