import { ActionForm, Submit } from "@/components/form";
import { Allowed } from "@/components/manager-only";
import { Card, Field, Input, PageTitle } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { listProducts } from "@/lib/services/catalog";
import { createProductAction, deleteProductAction, updateProductAction } from "../../manage-actions";
import { CatalogTabs } from "../tabs";

const rubInput = (kop: number) => (kop / 100).toFixed(2).replace(".", ",");

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const s = await requireSession();
  const { q } = await searchParams;
  const products = await listProducts(s.companyId, q);
  return (
    <div className="flex flex-col gap-4">
      <PageTitle>Справочники</PageTitle>
      <CatalogTabs active="products" />
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
              <Input name="brand" className="w-32" />
            </Field>
            <Field label="Ед.">
              <Input name="unit" defaultValue="шт" className="w-16" />
            </Field>
            <Field label="Цена, ₽">
              <Input name="price" inputMode="decimal" className="w-28" required />
            </Field>
            <Submit>Добавить</Submit>
          </ActionForm>
        </Card>
      </Allowed>
      <Card>
        <form className="mb-3 flex gap-2">
          <Input name="q" defaultValue={q} placeholder="Наименование, артикул или бренд" className="min-w-72" />
          <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Найти</button>
        </form>
        <div className="flex flex-col divide-y">
          {products.map((p) => (
            <div key={p.id} className="flex flex-wrap items-end gap-3 py-2">
              <ActionForm action={updateProductAction.bind(null, p.id)} className="flex flex-1 flex-wrap items-end gap-3">
                <Input name="name" defaultValue={p.name} className="min-w-64 flex-1" aria-label="Наименование" />
                <Input name="article" defaultValue={p.article ?? ""} placeholder="артикул" className="w-32" aria-label="Артикул" />
                <Input name="brand" defaultValue={p.brand ?? ""} placeholder="бренд" className="w-32" aria-label="Бренд" />
                <Input name="unit" defaultValue={p.unit} className="w-16" aria-label="Ед." />
                <Input name="price" defaultValue={rubInput(p.price)} inputMode="decimal" className="w-28" aria-label="Цена" />
                <Submit variant="ghost">Сохранить</Submit>
              </ActionForm>
              <ActionForm action={deleteProductAction.bind(null, p.id)}>
                <Submit variant="danger">Удалить</Submit>
              </ActionForm>
            </div>
          ))}
          {products.length === 0 && <p className="py-2 text-sm text-slate-500">Товаров пока нет</p>}
        </div>
      </Card>
    </div>
  );
}
