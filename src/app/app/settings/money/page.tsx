import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { Badge, Card, Field, Input, PageTitle, Select } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatRub } from "@/lib/money";
import { can } from "@/lib/permissions";
import { listCashboxes } from "@/lib/services/cash";
import { CASHBOX_KINDS, listCategories, SYSTEM_HINTS, type SystemKey } from "@/lib/services/cash-categories";
import {
  createAccountAction,
  createCategoryAction,
  deleteCategoryAction,
  hideAccountAction,
  moveCategoryAction,
  updateAccountAction,
  updateCategoryAction,
} from "./actions";

const arrow = "rounded px-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30";

export default async function MoneySettingsPage() {
  const s = await requireSession();
  const [categories, boxes] = await Promise.all([listCategories(s.companyId), listCashboxes(s.companyId)]);
  const edit = can(s.perms, "settings", "EDIT");
  const full = can(s.perms, "settings", "FULL");
  const groups = [...new Set(categories.map((c) => c.group).filter((g): g is string => !!g))];

  return (
    <div className="flex flex-col gap-4">
      <PageTitle
        actions={
          <Link href="/app/cash/flow" className="text-sm text-blue-600 hover:underline">
            Отчёт ДДС
          </Link>
        }
      >
        Статьи и счета
      </PageTitle>
      <p className="text-sm text-slate-600">
        Статьи доходов и расходов и счета, по которым строится отчёт «Движение денег (ДДС)». Статьи с меткой «авто» программа
        ставит сама: их можно переименовать и перенести в другую группу, но не удалить.
      </p>
      <datalist id="cash-groups">
        {groups.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>

      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <Card title="Статьи доходов и расходов">
          {edit && (
            <ActionForm action={createCategoryAction} reset className="mb-4 flex flex-wrap items-end gap-3">
              <Field label="Новая статья" className="min-w-48 flex-1">
                <Input name="name" placeholder="Например, Страхование" required />
              </Field>
              <Field label="Вид">
                <Select name="income" defaultValue="0">
                  <option value="1">Поступление</option>
                  <option value="0">Выплата</option>
                </Select>
              </Field>
              <Field label="Группа">
                <Input name="group" list="cash-groups" placeholder="Без группы" className="w-48" />
              </Field>
              <Submit>Добавить</Submit>
            </ActionForm>
          )}
          {[true, false].map((income) => {
            const list = categories.filter((c) => c.income === income);
            return (
              <div key={String(income)} className="mb-4">
                <h3 className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">{income ? "Поступления" : "Выплаты"}</h3>
                <div className="flex flex-col divide-y">
                  {list.map((c, i) => (
                    <div key={c.id} className="flex flex-wrap items-center gap-2 py-1">
                      {edit ? (
                        <>
                          <form className="flex flex-col leading-none">
                            <button formAction={moveCategoryAction.bind(null, c.id, -1)} disabled={i === 0} className={arrow} aria-label="Выше">
                              ▲
                            </button>
                            <button formAction={moveCategoryAction.bind(null, c.id, 1)} disabled={i === list.length - 1} className={arrow} aria-label="Ниже">
                              ▼
                            </button>
                          </form>
                          <ActionForm action={updateCategoryAction.bind(null, c.id)} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                            <input type="hidden" name="income" value={c.income ? "1" : "0"} />
                            <Input name="name" defaultValue={c.name} className="min-w-56 flex-[3]" aria-label="Название статьи" />
                            <Input name="group" defaultValue={c.group ?? ""} list="cash-groups" placeholder="Без группы" className="min-w-40 flex-[2]" aria-label="Группа" />
                            <Submit variant="ghost">Сохранить</Submit>
                          </ActionForm>
                        </>
                      ) : (
                        <span className="flex-1 text-sm">
                          {c.name} {c.group && <span className="text-slate-500">· {c.group}</span>}
                        </span>
                      )}
                      <span className="flex w-12 justify-center">
                        {c.system ? (
                          <span title={SYSTEM_HINTS[c.system as SystemKey]}>
                            <Badge>авто</Badge>
                          </span>
                        ) : (
                          full && (
                            <ActionForm action={deleteCategoryAction.bind(null, c.id)}>
                              <button className="px-2 text-red-600 hover:underline" aria-label={`Удалить ${c.name}`}>
                                ✕
                              </button>
                            </ActionForm>
                          )
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </Card>

        <Card title="Счета учёта">
          {edit && (
            <ActionForm action={createAccountAction} reset className="mb-4 flex flex-wrap items-end gap-3">
              <Field label="Новый счёт" className="min-w-48 flex-1">
                <Input name="name" placeholder="Например, Сейф" required />
              </Field>
              <Field label="Тип">
                <Select name="kind" defaultValue="CASH">
                  {Object.entries(CASHBOX_KINDS).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </Select>
              </Field>
              <Submit>Добавить</Submit>
            </ActionForm>
          )}
          <div className="flex flex-col divide-y">
            {boxes.map((b) => (
              <div key={b.id} className={`flex flex-col gap-1 py-2 ${b.hidden ? "opacity-60" : ""}`}>
                {edit ? (
                  <ActionForm action={updateAccountAction.bind(null, b.id)} className="flex min-w-0 items-center gap-2">
                    <Input name="name" defaultValue={b.name} className="min-w-0 flex-1" aria-label="Название счёта" />
                    <Select name="kind" defaultValue={b.kind} aria-label="Тип счёта" className="w-40">
                      {Object.entries(CASHBOX_KINDS).map(([k, l]) => (
                        <option key={k} value={k}>
                          {l}
                        </option>
                      ))}
                    </Select>
                    <Submit variant="ghost">Сохранить</Submit>
                  </ActionForm>
                ) : (
                  <span className="text-sm">
                    {b.name} <span className="text-slate-500">· {CASHBOX_KINDS[b.kind]}</span>
                  </span>
                )}
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-slate-500">Остаток</span>
                  <span className={`tabular-nums ${b.balance < 0 ? "text-red-600" : ""}`}>{formatRub(b.balance)}</span>
                  {b.hidden && <Badge>скрыт</Badge>}
                  {edit && (
                    <ActionForm action={hideAccountAction.bind(null, b.id, !b.hidden)}>
                      <button className="text-blue-600 hover:underline">{b.hidden ? "Показать в формах" : "Скрыть из форм"}</button>
                    </ActionForm>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Остаток считается сам по операциям. Скрытый счёт не предлагается в формах оплаты, но остаётся в отчётах и истории.
          </p>
        </Card>
      </div>
    </div>
  );
}
