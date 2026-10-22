import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { PreviewHint, PreviewRow, PreviewTitle } from "@/components/list-view";
import { ListRow, PreviewPane } from "@/components/preview-pane";
import { Badge, Card, Field, Input, PageTitle, Select, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { previewHref, previewId } from "@/lib/list-query";
import { ROLES, roleLabel } from "@/lib/roles";
import { listAllEmployees, listMembers, listRoles } from "@/lib/services/staff";
import { addMemberAction, linkMemberEmployeeAction, removeMemberAction, setMemberRoleAction } from "../../manage-actions";

const builtIn = ROLES.filter((r) => r.value !== "OWNER");

/** Пользователи программы: логины, роли и связь с менеджером из справочника «Сотрудники». */
const PATH = "/app/settings/users";

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const preview = previewId(sp);
  const [members, roles, managers] = await Promise.all([listMembers(s.companyId), listRoles(s.companyId), listAllEmployees(s.companyId, "MANAGER")]);
  const assignable = [...builtIn, ...roles.map((r) => ({ value: `custom:${r.id}`, label: r.name }))];
  const roleOf = (m: (typeof members)[number]) => (m.customRole ? `custom:${m.customRole.id}` : m.role);
  const linked = (userId: string) => managers.find((e) => e.userId === userId);
  return (
    <div className="flex flex-col gap-4">
      <PageTitle>Пользователи и доступ</PageTitle>
      <Card title="Доступ в систему">
        <PreviewPane
          selected={preview}
          panel={(() => {
            const m = members.find((x) => x.id === preview);
            if (!m) return <PreviewHint what="пользователя" />;
            const locked = m.role === "OWNER" || m.userId === s.userId;
            const emp = linked(m.userId);
            return (
              <>
                <PreviewTitle title={m.user.name} sub={m.user.email} href={emp ? `/app/staff/${emp.id}` : undefined} open="Открыть карточку сотрудника" />
                <PreviewRow label="Роль">{m.customRole?.name ?? roleLabel(m.role)}</PreviewRow>
                <PreviewRow label="Сотрудник">{emp?.name ?? "не указан"}</PreviewRow>
                <div className="mt-3 flex flex-col gap-3">
                  <ActionForm key={emp?.id ?? ""} action={linkMemberEmployeeAction.bind(null, m.id)} className="flex flex-wrap items-center gap-2">
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
                    <p className="text-xs text-slate-500">Роль владельца и свою роль поменять нельзя.</p>
                  ) : (
                    <>
                      <ActionForm key={roleOf(m)} action={setMemberRoleAction.bind(null, m.id)} className="flex flex-wrap items-center gap-2">
                        <Select name="role" defaultValue={roleOf(m)} aria-label="Роль">
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
              </>
            );
          })()}
          list={
            <table className="mb-4 w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className={th}>Имя</th>
                  <th className={th}>Email</th>
                  <th className={th}>Роль</th>
                  <th className={th}>Сотрудник</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <ListRow key={m.id} previewHref={previewHref(PATH, sp, m.id)} selected={preview === m.id}>
                    <td className={`${td} font-medium`}>{m.user.name}</td>
                    <td className={`${td} text-slate-600`}>{m.user.email}</td>
                    <td className={td}>
                      <Badge tone={m.role === "OWNER" ? "blue" : "slate"}>{m.customRole?.name ?? roleLabel(m.role)}</Badge>
                    </td>
                    <td className={td}>{linked(m.userId)?.name}</td>
                  </ListRow>
                ))}
              </tbody>
            </table>
          }
        />
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
          Роль, связь с сотрудником и закрытие доступа — в просмотре справа: нажмите на пользователя в списке.{" "}
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
