import { ActionForm, Submit } from "@/components/form";
import { ManagerOnly } from "@/components/manager-only";
import { Card, Field, Input, PageTitle } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { listOrganizations } from "@/lib/services/employees";
import { getCompany } from "@/lib/services/settings";
import { createOrganizationAction, updateCompanyAction, updateOrganizationAction } from "../manage-actions";

type Org = { name?: string; inn?: string | null; kpp?: string | null; ogrn?: string | null; address?: string | null; phone?: string | null };

function OrgFields({ o = {} }: { o?: Org }) {
  return (
    <>
      <Field label="Название" className="min-w-64 flex-1">
        <Input name="name" defaultValue={o.name} required />
      </Field>
      <Field label="ИНН">
        <Input name="inn" defaultValue={o.inn ?? ""} className="w-36" />
      </Field>
      <Field label="КПП">
        <Input name="kpp" defaultValue={o.kpp ?? ""} className="w-28" />
      </Field>
      <Field label="ОГРН">
        <Input name="ogrn" defaultValue={o.ogrn ?? ""} className="w-40" />
      </Field>
      <Field label="Адрес" className="min-w-64 flex-1">
        <Input name="address" defaultValue={o.address ?? ""} />
      </Field>
      <Field label="Телефон">
        <Input name="phone" defaultValue={o.phone ?? ""} />
      </Field>
    </>
  );
}

export default async function SettingsPage() {
  const s = await requireSession();
  const [company, orgs] = await Promise.all([getCompany(s.companyId), listOrganizations(s.companyId)]);
  return (
    <div className="flex flex-col gap-4">
      <PageTitle>Настройки СТО</PageTitle>
      <ManagerOnly role={s.role}>
        <Card title="Компания">
          <ActionForm action={updateCompanyAction} className="flex flex-wrap items-end gap-3">
            <Field label="Название СТО" className="min-w-64 flex-1">
              <Input name="name" defaultValue={company.name} required />
            </Field>
            <Field label="Город">
              <Input name="city" defaultValue={company.city ?? ""} />
            </Field>
            <Field label="Цена нормочаса, ₽">
              <Input name="hourPrice" defaultValue={(company.hourPrice / 100).toFixed(2).replace(".", ",")} inputMode="decimal" className="w-32" />
            </Field>
            <Submit>Сохранить</Submit>
          </ActionForm>
        </Card>
        <Card title="Организации (юрлица и ИП)">
          <p className="mb-3 text-sm text-slate-600">От имени организации оформляются заказ-наряды. Реквизиты попадают в печатную форму.</p>
          <div className="flex flex-col divide-y">
            {orgs.map((o) => (
              <ActionForm key={o.id} action={updateOrganizationAction.bind(null, o.id)} className="flex flex-wrap items-end gap-3 py-3">
                <OrgFields o={o} />
                <Submit variant="ghost">Сохранить</Submit>
              </ActionForm>
            ))}
          </div>
          <h3 className="mt-4 mb-2 text-sm font-semibold">Добавить организацию</h3>
          <ActionForm action={createOrganizationAction} reset className="flex flex-wrap items-end gap-3">
            <OrgFields />
            <Submit>Добавить</Submit>
          </ActionForm>
        </Card>
      </ManagerOnly>
    </div>
  );
}
