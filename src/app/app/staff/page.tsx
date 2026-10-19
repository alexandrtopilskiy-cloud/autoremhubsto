import { ActionForm, Submit } from "@/components/form";
import { ManagerOnly } from "@/components/manager-only";
import { Badge, Card, Field, Input, PageTitle, Select } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { ROLES, roleLabel } from "@/lib/roles";
import { listAllEmployees, listMembers } from "@/lib/services/staff";
import {
  addMemberAction,
  createEmployeeAction,
  removeMemberAction,
  setMemberRoleAction,
  updateEmployeeAction,
} from "../manage-actions";

const assignable = ROLES.filter((r) => r.value !== "OWNER");

export default async function StaffPage() {
  const s = await requireSession();
  const [employees, members] = await Promise.all([listAllEmployees(s.companyId), listMembers(s.companyId)]);
  return (
    <div className="flex flex-col gap-4">
      <PageTitle>Сотрудники</PageTitle>
      <ManagerOnly role={s.role}>
        <Card title="Сотрудники и исполнители">
          <p className="mb-3 text-sm text-slate-600">
            Мастера и менеджеры, которых можно указать в заказ-наряде. Процент от работ пригодится для расчёта зарплаты.
          </p>
          <div className="mb-4 flex flex-col divide-y">
            {employees.map((e) => (
              <ActionForm key={e.id} action={updateEmployeeAction.bind(null, e.id)} className="flex flex-wrap items-end gap-3 py-2">
                <Input name="name" defaultValue={e.name} className="min-w-56 flex-1" aria-label="Имя" />
                <Input name="position" defaultValue={e.position ?? ""} placeholder="должность" className="w-40" aria-label="Должность" />
                <label className="flex items-center gap-1 text-sm">
                  <Input name="workPercent" type="number" min={0} max={100} defaultValue={e.workPercent} className="w-20" aria-label="Процент" />%
                </label>
                <label className="flex items-center gap-1 pb-2 text-sm">
                  <input type="checkbox" name="active" defaultChecked={e.active} /> работает
                </label>
                <Submit variant="ghost">Сохранить</Submit>
              </ActionForm>
            ))}
          </div>
          <ActionForm action={createEmployeeAction} reset className="flex flex-wrap items-end gap-3">
            <Field label="Имя" className="min-w-56 flex-1">
              <Input name="name" required />
            </Field>
            <Field label="Должность">
              <Input name="position" className="w-40" />
            </Field>
            <Field label="% от работ">
              <Input name="workPercent" type="number" min={0} max={100} defaultValue={0} className="w-20" />
            </Field>
            <Submit>Добавить сотрудника</Submit>
          </ActionForm>
        </Card>

        <Card title="Доступ в систему">
          <div className="mb-4 flex flex-col divide-y">
            {members.map((m) => {
              const locked = m.role === "OWNER" || m.userId === s.userId;
              return (
                <div key={m.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                  <span className="min-w-56 flex-1">
                    <b>{m.user.name}</b> <span className="text-slate-500">{m.user.email}</span>
                  </span>
                  {locked ? (
                    <Badge tone="blue">{roleLabel(m.role)}</Badge>
                  ) : (
                    <>
                      <ActionForm action={setMemberRoleAction.bind(null, m.id)} className="flex items-center gap-2">
                        <Select name="role" defaultValue={m.role}>
                          {assignable.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </Select>
                        <Submit variant="ghost">Сменить роль</Submit>
                      </ActionForm>
                      <ActionForm action={removeMemberAction.bind(null, m.id)}>
                        <Submit variant="danger">Закрыть доступ</Submit>
                      </ActionForm>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <ActionForm action={addMemberAction} reset className="flex flex-wrap items-end gap-3">
            <Field label="Имя">
              <Input name="name" required />
            </Field>
            <Field label="Email">
              <Input name="email" type="email" required />
            </Field>
            <Field label="Пароль для входа">
              <Input name="password" type="password" minLength={8} autoComplete="new-password" placeholder="не короче 8 символов" />
            </Field>
            <Field label="Роль">
              <Select name="role" defaultValue="MANAGER">
                {assignable.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Submit>Дать доступ</Submit>
          </ActionForm>
          <p className="mt-2 text-xs text-slate-500">
            Если человек уже работает в системе в другой СТО, пароль не нужен: он войдёт со своим.
          </p>
        </Card>
      </ManagerOnly>
    </div>
  );
}
