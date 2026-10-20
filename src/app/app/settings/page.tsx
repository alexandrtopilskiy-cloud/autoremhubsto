import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { Allowed } from "@/components/manager-only";
import { Card, Field, Input, PageTitle, Select } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { listOrganizations } from "@/lib/services/employees";
import { getCompany } from "@/lib/services/settings";
import { listWorkplaces } from "@/lib/services/appointments";
import { minutesToTime, UTC_OFFSETS } from "@/lib/time";
import { createWorkplaceAction, updateWorkplaceAction } from "../schedule/actions";
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
  const [company, orgs, workplaces] = await Promise.all([
    getCompany(s.companyId),
    listOrganizations(s.companyId),
    listWorkplaces(s.companyId, { all: true }),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <PageTitle
        actions={
          <Link href="/app/settings/roles" className="text-sm text-blue-600 hover:underline">
            Роли и права
          </Link>
        }
      >
        Настройки СТО
      </PageTitle>
      <Allowed perms={s.perms} section="settings">
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
            <Field label="Часовой пояс">
              <Select name="utcOffset" defaultValue={company.utcOffset}>
                {UTC_OFFSETS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Рабочий день с">
              <Input type="time" name="dayStart" step={1800} defaultValue={minutesToTime(company.dayStart)} />
            </Field>
            <Field label="до">
              <Input type="time" name="dayEnd" step={1800} defaultValue={minutesToTime(company.dayEnd % 1440)} />
            </Field>
            <Submit>Сохранить</Submit>
          </ActionForm>
        </Card>
        <Card title="Посты (рабочие места)">
          <p className="mb-3 text-sm text-slate-600">По постам ведётся запись на сервис и считается их загрузка.</p>
          <div className="flex flex-col divide-y">
            {workplaces.map((w) => (
              <ActionForm key={w.id} action={updateWorkplaceAction.bind(null, w.id)} className="flex flex-wrap items-end gap-3 py-2">
                <Input name="name" defaultValue={w.name} className="min-w-56 flex-1" aria-label="Название поста" />
                <label className="flex items-center gap-1 pb-2 text-sm">
                  <input type="checkbox" name="active" defaultChecked={w.active} /> работает
                </label>
                <Submit variant="ghost">Сохранить</Submit>
              </ActionForm>
            ))}
          </div>
          <ActionForm action={createWorkplaceAction} reset className="mt-2 flex flex-wrap items-end gap-3">
            <Field label="Новый пост" className="min-w-56 flex-1">
              <Input name="name" placeholder="например, Развал-схождение" required />
            </Field>
            <Submit>Добавить пост</Submit>
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
      </Allowed>
    </div>
  );
}
