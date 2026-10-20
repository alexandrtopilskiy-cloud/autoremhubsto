import { ActionForm, Submit } from "@/components/form";
import { Allowed } from "@/components/manager-only";
import { Card, Field, Input, PageTitle, Select } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { listGroups, listProducts } from "@/lib/services/catalog";
import {
  createGroupAction,
  createProductAction,
  deleteGroupAction,
  deleteProductAction,
  renameGroupAction,
  updateProductAction,
} from "../../manage-actions";
import { CatalogTabs } from "../tabs";
import { dicts } from "@/lib/services/dictionaries";
import { DictList } from "@/components/dict-list";

const rubInput = (kop: number) => (kop / 100).toFixed(2).replace(".", ",");
const qtyInput = (q: unknown) => (q === null || q === undefined ? "" : String(Number(q)).replace(".", ","));

function GroupSelect({ groups, value }: { groups: { id: string; name: string }[]; value?: string | null }) {
  return (
    <Select name="groupId" defaultValue={value ?? ""} aria-label="Группа" className="w-40">
      <option value="">Без группы</option>
      {groups.map((g) => (
        <option key={g.id} value={g.id}>
          {g.name}
        </option>
      ))}
    </Select>
  );
}

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; group?: string }> }) {
  const s = await requireSession();
  const lists = await dicts(s.companyId, ["UNIT", "BRAND"]);
  const { q, group } = await searchParams;
  const [products, groups] = await Promise.all([listProducts(s.companyId, q, group), listGroups(s.companyId)]);
  return (
    <div className="flex flex-col gap-4">
      <PageTitle>Справочники</PageTitle>
      <CatalogTabs active="products" />
      <DictList id="units" items={lists.UNIT} />
      <DictList id="brands" items={lists.BRAND} />
      <Allowed perms={s.perms} section="catalog" level="CREATE" quiet>
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
      </Allowed>
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
        <div className="flex flex-col divide-y">
          {products.map((p) => (
            <div key={p.id} className="flex flex-wrap items-end gap-3 py-2">
              <ActionForm action={updateProductAction.bind(null, p.id)} className="flex flex-1 flex-wrap items-end gap-3">
                <Input name="name" defaultValue={p.name} className="min-w-64 flex-1" aria-label="Наименование" />
                <Input name="article" defaultValue={p.article ?? ""} placeholder="артикул" className="w-32" aria-label="Артикул" />
                <Input name="brand" list="brands" defaultValue={p.brand ?? ""} placeholder="бренд" className="w-32" aria-label="Бренд" />
                <Input name="unit" list="units" defaultValue={p.unit} className="w-16" aria-label="Ед." />
                <Input name="price" defaultValue={rubInput(p.price)} inputMode="decimal" className="w-28" aria-label="Цена" />
                <GroupSelect groups={groups} value={p.groupId} />
                <Input
                  name="barcode"
                  defaultValue={p.barcode ?? ""}
                  placeholder="штрихкод"
                  className="w-36"
                  aria-label="Штрихкод"
                  autoComplete="off"
                />
                <Input
                  name="minQty"
                  defaultValue={qtyInput(p.minQty)}
                  placeholder="мин."
                  inputMode="decimal"
                  className="w-20"
                  aria-label="Минимальный остаток"
                  title="Минимальный остаток"
                />
                <Submit variant="ghost">Сохранить</Submit>
              </ActionForm>
              <ActionForm action={deleteProductAction.bind(null, p.id)}>
                <Submit variant="danger">Удалить</Submit>
              </ActionForm>
            </div>
          ))}
          {products.length === 0 && <p className="py-2 text-sm text-slate-500">Товаров не найдено</p>}
        </div>
      </Card>
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
