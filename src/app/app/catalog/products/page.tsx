import { ActionForm, Submit } from "@/components/form";
import { PreviewHint } from "@/components/list-view";
import { Allowed } from "@/components/manager-only";
import { ListRow, PreviewPane } from "@/components/preview-pane";
import { Card, Field, Input, NewPanel, PageTitle, Select, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { previewHref, previewId } from "@/lib/list-query";
import { formatRub } from "@/lib/money";
import { listGroups, listProducts } from "@/lib/services/catalog";
import { createGroupAction, createProductAction, deleteGroupAction, renameGroupAction } from "../../manage-actions";
import { CatalogTabs } from "../tabs";
import { dicts } from "@/lib/services/dictionaries";
import { DictList } from "@/components/dict-list";
import { GroupSelect } from "./group-select";
import { ProductPreview } from "./preview";

const PATH = "/app/catalog/products";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : undefined;
  const group = typeof sp.group === "string" ? sp.group : undefined;
  const preview = previewId(sp);
  const lists = await dicts(s.companyId, ["UNIT", "BRAND"]);
  const [products, groups] = await Promise.all([listProducts(s.companyId, q, group), listGroups(s.companyId)]);
  return (
    <div className="flex flex-col gap-4">
      <PageTitle create="#new" createLabel="Новый товар">Справочники</PageTitle>
      <CatalogTabs active="products" />
      <DictList id="units" items={lists.UNIT} />
      <DictList id="brands" items={lists.BRAND} />
      <Allowed perms={s.perms} section="catalog" level="CREATE" quiet>
        <NewPanel>
          <Card title="Новый товар">
            <ActionForm action={createProductAction} reset className="flex flex-wrap items-end gap-3">
              <Field label="Наименование" className="min-w-64 flex-1">
                <Input name="name" required />
              </Field>
              <Field label="Артикул">
                <Input name="article" className="w-32" />
              </Field>
              <Field label="Бренд">
                <Input name="brand" list="brands" className="w-32" />
              </Field>
              <Field label="Ед.">
                <Input name="unit" list="units" defaultValue="шт" className="w-16" />
              </Field>
              <Field label="Цена, ₽">
                <Input name="price" inputMode="decimal" className="w-28" required />
              </Field>
              <Field label="Группа">
                <GroupSelect groups={groups} value={group && group !== "none" ? group : ""} />
              </Field>
              <Field label="Штрихкод">
                <Input name="barcode" className="w-36" autoComplete="off" />
              </Field>
              <Field label="Мин. остаток">
                <Input name="minQty" inputMode="decimal" className="w-24" />
              </Field>
              <Submit>Добавить</Submit>
            </ActionForm>
          </Card>
        </NewPanel>
      </Allowed>
      <PreviewPane
        selected={preview}
        panel={preview ? <ProductPreview companyId={s.companyId} id={preview} costs={s.perms.flags.costs} /> : <PreviewHint what="товар" open="карточку товара" />}
        list={
          <Card>
            <form className="mb-3 flex flex-wrap gap-2">
              <Input name="q" defaultValue={q} placeholder="Наименование, артикул, бренд или штрихкод" className="min-w-80" />
              <Select name="group" defaultValue={group ?? ""} aria-label="Группа">
                <option value="">Все группы</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
                <option value="none">Без группы</option>
              </Select>
              <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Найти</button>
            </form>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className={th}>Наименование</th>
                    <th className={th}>Артикул</th>
                    <th className={th}>Бренд</th>
                    <th className={th}>Группа</th>
                    <th className={`${th} text-right`}>Цена</th>
                    <th className={th}>Штрихкод</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <ListRow key={p.id} previewHref={previewHref(PATH, sp, p.id)} openHref={`${PATH}/${p.id}`} selected={preview === p.id}>
                      <td className={td}>{p.name}</td>
                      <td className={td}>{p.article}</td>
                      <td className={td}>{p.brand}</td>
                      <td className={`${td} text-slate-600`}>{p.group?.name}</td>
                      <td className={`${td} text-right whitespace-nowrap`}>
                        {formatRub(p.price)}
                        <span className="text-slate-500">/{p.unit}</span>
                      </td>
                      <td className={`${td} text-slate-600`}>{p.barcode}</td>
                    </ListRow>
                  ))}
                  {products.length === 0 && (
                    <tr>
                      <td colSpan={6} className={`${td} text-slate-500`}>
                        Товаров не найдено
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-500">Один клик — просмотр справа, двойной клик — карточка товара в новой вкладке.</p>
          </Card>
        }
      />
      <Card title="Группы товаров">
        <div className="mb-3 flex flex-col divide-y">
          {groups.map((g) => (
            <div key={g.id} className="flex flex-wrap items-center gap-3 py-2">
              <ActionForm action={renameGroupAction.bind(null, g.id)} className="flex flex-1 items-center gap-3">
                <Input name="name" defaultValue={g.name} className="min-w-64" aria-label="Название группы" />
                <span className="text-sm text-slate-500">товаров: {g._count.products}</span>
                <Submit variant="ghost">Сохранить</Submit>
              </ActionForm>
              <ActionForm action={deleteGroupAction.bind(null, g.id)}>
                <Submit variant="danger">Удалить</Submit>
              </ActionForm>
            </div>
          ))}
          {groups.length === 0 && <p className="py-2 text-sm text-slate-500">Групп пока нет</p>}
        </div>
        <Allowed perms={s.perms} section="catalog" level="CREATE" quiet>
          <ActionForm action={createGroupAction} reset className="flex flex-wrap items-end gap-3">
            <Field label="Новая группа">
              <Input name="name" required placeholder="например, Масла и жидкости" className="min-w-64" />
            </Field>
            <Submit>Добавить группу</Submit>
          </ActionForm>
          <p className="mt-2 text-xs text-slate-500">При удалении группы её товары остаются в справочнике без группы.</p>
        </Allowed>
      </Card>
    </div>
  );
}
