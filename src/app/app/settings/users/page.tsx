import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { Badge, Card, Field, Input, PageTitle, Select } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { ROLES, roleLabel } from "@/lib/roles";
import { listAllEmployees, listMembers, listRoles } from "@/lib/services/staff";
import { addMemberAction, linkMemberEmployeeAction, removeMemberAction, setMemberRoleAction } from "../../manage-actions";

const builtIn = ROLES.filter((r) => r.value !== "OWNER");

/** Пользователи программы: логины, роли и связь с менеджером из справочника «Сотрудники». */
export default async function UsersPage() {
  const s = await requireSession();
  const [members, roles, managers] = await Promise.all([listMembers(s.companyId), listRoles(s.companyId), listAllEmployees(s.companyId, "MANAGER")]);
  const assignable = [...builtIn, ...roles.map((r) => ({ value: `custom:${r.id}`, label: r.name }))];
  const roleOf = (m: (typeof members)[number]) => (m.customRole ? `custom:${m.customRole.id}` : m.role);
  const linked = (userId: string) => managers.find((e) => e.userId === userId);
  return (
    <div className="flex flex-col gap-4">
      <PageTitle>Пользователи и доступ</PageTitle>
      <Card title="Доступ в систему">
        <div className="mb-4 flex flex-col divide-y">
          {members.map((m) => {
            const locked = m.role === "OWNER" || m.userId === s.userId;
            const emp = linked(m.userId);
            return (
              <div key={m.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="min-w-56 flex-1">
                  <b>{m.user.name}</b> <span className="text-slate-500">{m.user.email}</span>
                </span>
                <ActionForm key={emp?.id ?? ""} action={linkMemberEmployeeAction.bind(null, m.id)} className="flex items-center gap-2">
                  <Select name="employeeId" defaultValue={emp?.id ?? ""} aria-label="Сотрудник" className="w-56">
                    <option value="">Сотрудник не указан</option>
                    {managers.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </Select>
                  <Submit variant="ghost">Связать</Submit>
                </ActionForm>
                {locked ? (
                  <Badge tone="blue">{m.customRole?.name ?? roleLabel(m.role)}</Badge>
                ) : (
                  <>
                    <ActionForm key={roleOf(m)} action={setMemberRoleAction.bind(null, m.id)} className="flex items-center gap-2">
                      <Select name="role" defaultValue={roleOf(m)}>
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
          Если человек уже работает в системе в другой СТО, пароль не нужен: он войдёт со своим. Сотрудника можно связать только с менеджером из{" "}
          <Link href="/app/staff?kind=MANAGER" className="text-blue-600 hover:underline">
            справочника «Сотрудники»
          </Link>
          . Свои роли с набором прав настраиваются в{" "}
          <Link href="/app/settings/roles" className="text-blue-600 hover:underline">
            Управление → Роли и права
          </Link>
          .
        </p>
      </Card>
    </div>
  );
}
