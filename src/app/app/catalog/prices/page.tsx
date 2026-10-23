import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { Allowed } from "@/components/manager-only";
import { Card, Field, Input, PageTitle, Select, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatRub } from "@/lib/money";
import { listGroups } from "@/lib/services/catalog";
import { categoryPriceList, listCategories } from "@/lib/services/prices";
import { CatalogTabs } from "../tabs";
import { createCategoryAction, deleteCategoryAction, saveCategoryPricesAction, updateCategoryAction } from "./actions";
import { LiveForm } from "@/components/busy";

const rubInput = (kop: number | null) => (kop === null ? "" : (kop / 100).toFixed(2).replace(".", ","));

export default async function PricesPage({ searchParams }: { searchParams: Promise<{ cat?: string; q?: string; group?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const [categories, groups] = await Promise.all([listCategories(s.companyId), listGroups(s.companyId)]);
  const current = categories.find((c) => c.id === sp.cat) ?? categories[0];
  const list = current ? await categoryPriceList(s.companyId, current.id, sp.q, sp.group || undefined) : null;
  const qs = (cat: string) => `?cat=${cat}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}${sp.group ? `&group=${sp.group}` : ""}`;

  return (
    <div className="flex flex-col gap-4">
      <PageTitle>Справочники</PageTitle>
      <CatalogTabs active="prices" />
      <Allowed perms={s.perms} section="catalog" flag="prices">
        <Card title="Категории цен">
          <p className="mb-3 text-sm text-slate-600">
            Категория назначается клиенту в его карточке. Товары такому клиенту идут по своей цене категории, а если её нет — от базовой
            цены с наценкой или скидкой категории, округлённой до рубля. Работы по нормочасам считаются по цене нормочаса категории, если
            она задана. Скидка клиента применяется поверх.
          </p>
          <div className="mb-3 flex flex-col divide-y">
            {categories.map((c) => (
              <div key={c.id} className="flex flex-wrap items-end gap-3 py-2">
                <ActionForm action={updateCategoryAction.bind(null, c.id)} className="flex flex-1 flex-wrap items-end gap-3">
                  <Field label="Название">
                    <Input name="name" defaultValue={c.name} className="min-w-56" />
                  </Field>
                  <Field label="Наценка (+) / скидка (−), %">
                    <Input name="percent" type="number" min={-99} max={1000} defaultValue={c.percent} className="w-28" />
                  </Field>
                  <Field label="Нормочас, ₽">
                    <Input
                      name="hourPrice"
                      defaultValue={rubInput(c.hourPrice)}
                      inputMode="decimal"
                      placeholder="как у СТО"
                      className="w-32"
                    />
                  </Field>
                  <span className="pb-2 text-sm text-slate-500">
                    клиентов: {c._count.clients}, своих цен: {c._count.prices}
                  </span>
                  <Submit variant="ghost">Сохранить</Submit>
                </ActionForm>
                <ActionForm action={deleteCategoryAction.bind(null, c.id)}>
                  <Submit variant="danger">Удалить</Submit>
                </ActionForm>
              </div>
            ))}
            {categories.length === 0 && (
              <p className="py-2 text-sm text-slate-500">Категорий пока нет: все клиенты покупают по базовым ценам.</p>
            )}
          </div>
          <ActionForm action={createCategoryAction} reset className="flex flex-wrap items-end gap-3">
            <Field label="Новая категория">
              <Input name="name" required placeholder="например, Оптовые клиенты" className="min-w-56" />
            </Field>
            <Field label="Наценка (+) / скидка (−), %">
              <Input name="percent" type="number" min={-99} max={1000} defaultValue={0} className="w-28" />
            </Field>
            <Field label="Нормочас, ₽">
              <Input name="hourPrice" inputMode="decimal" placeholder="как у СТО" className="w-32" />
            </Field>
            <Submit>Добавить категорию</Submit>
          </ActionForm>
        </Card>

        {list && current && (
          <Card title={`Прайс категории «${current.name}»`}>
            <div className="mb-3 flex flex-wrap gap-2">
              {categories.map((c) => (
                <Link
                  key={c.id}
                  href={qs(c.id)}
                  className={`rounded-full px-3 py-1 text-sm ${c.id === current.id ? "bg-blue-600 text-white" : "border border-slate-300 bg-white"}`}
                >
                  {c.name}
                </Link>
              ))}
            </div>
            <LiveForm className="mb-3 flex flex-wrap gap-2">
              <input type="hidden" name="cat" value={current.id} />
              <Input name="q" defaultValue={sp.q} placeholder="Наименование, артикул, бренд или штрихкод" className="min-w-80" />
              <Select name="group" defaultValue={sp.group ?? ""} aria-label="Группа">
                <option value="">Все группы</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
                <option value="none">Без группы</option>
              </Select>
              <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Найти</button>
            </LiveForm>
            {/* key: после сохранения поля пересоздаются с новыми ценами */}
            <ActionForm key={list.rows.map((r) => r.own).join()} action={saveCategoryPricesAction.bind(null, current.id)}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className={th}>Товар</th>
                      <th className={th}>Группа</th>
                      <th className={`${th} text-right`}>Базовая цена</th>
                      <th className={`${th} text-right`}>Своя цена категории, ₽</th>
                      <th className={`${th} text-right`}>Цена для клиента</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.rows.map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className={td}>
                          {r.name}
                          {r.article && <span className="text-slate-500"> · {r.article}</span>}
                        </td>
                        <td className={`${td} text-slate-600`}>{r.group}</td>
                        <td className={`${td} text-right whitespace-nowrap`}>{formatRub(r.base)}</td>
                        <td className={`${td} text-right`}>
                          <Input
                            name={`p_${r.id}`}
                            defaultValue={rubInput(r.own)}
                            inputMode="decimal"
                            placeholder={rubInput(r.price)}
                            className="w-32 text-right"
                            aria-label={`Цена ${r.name}`}
                          />
                        </td>
                        <td className={`${td} text-right font-medium whitespace-nowrap`}>{formatRub(r.price)}</td>
                      </tr>
                    ))}
                    {list.rows.length === 0 && (
                      <tr>
                        <td colSpan={5} className={`${td} text-slate-500`}>
                          Товаров не найдено
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <Submit>Сохранить цены</Submit>
                <span className="text-xs text-slate-500">Пустое поле — цена по проценту категории (подсказка в поле).</span>
              </div>
            </ActionForm>
          </Card>
        )}
      </Allowed>
    </div>
  );
}
