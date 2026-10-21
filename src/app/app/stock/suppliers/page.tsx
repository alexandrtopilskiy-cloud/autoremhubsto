import { ActionForm, Submit } from "@/components/form";
import { Allowed } from "@/components/manager-only";
import { Card, Field, Input, NewPanel, PageTitle } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { listSuppliers } from "@/lib/services/stock";
import { createSupplierAction, updateSupplierAction } from "../actions";
import { StockTabs } from "../tabs";

export default async function SuppliersPage() {
  const s = await requireSession();
  const suppliers = await listSuppliers(s.companyId);
  return (
    <div className="flex flex-col gap-4">
      <PageTitle create="#new" createLabel="Новый поставщик">Склад</PageTitle>
      <StockTabs active="suppliers" />
      <Allowed perms={s.perms} section="stock">
        <NewPanel>
          <Card title="Новый поставщик">
            <ActionForm action={createSupplierAction} reset className="flex flex-wrap items-end gap-3">
              <Field label="Название" className="min-w-64 flex-1">
                <Input name="name" required />
              </Field>
              <Field label="ИНН">
                <Input name="inn" className="w-36" />
              </Field>
              <Field label="Телефон">
                <Input name="phone" />
              </Field>
              <Field label="Комментарий">
                <Input name="comment" />
              </Field>
              <Submit>Добавить</Submit>
            </ActionForm>
          </Card>
        </NewPanel>
        <Card>
          <div className="flex flex-col divide-y">
            {suppliers.map((p) => (
              <ActionForm key={p.id} action={updateSupplierAction.bind(null, p.id)} className="flex flex-wrap items-end gap-3 py-2">
                <Input name="name" defaultValue={p.name} className="min-w-64 flex-1" aria-label="Название" />
                <Input name="inn" defaultValue={p.inn ?? ""} placeholder="ИНН" className="w-36" aria-label="ИНН" />
                <Input name="phone" defaultValue={p.phone ?? ""} placeholder="телефон" aria-label="Телефон" />
                <Input name="comment" defaultValue={p.comment ?? ""} placeholder="комментарий" aria-label="Комментарий" />
                <Submit variant="ghost">Сохранить</Submit>
              </ActionForm>
            ))}
            {suppliers.length === 0 && <p className="py-2 text-sm text-slate-500">Поставщиков пока нет</p>}
          </div>
        </Card>
      </Allowed>
    </div>
  );
}
