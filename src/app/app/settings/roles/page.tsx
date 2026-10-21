import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { Badge, Card, Field, Input, NewPanel, PageTitle, Select, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { can, FLAGS, LEVELS, parsePermissions, PRESETS, SECTIONS, type Permissions } from "@/lib/permissions";
import { ROLES } from "@/lib/roles";
import { listRoles } from "@/lib/services/staff";
import { createRoleAction, deleteRoleAction, updateRoleAction } from "../../manage-actions";

const levelLabel = (k: string) => LEVELS.find((l) => l.key === k)!.label;

/** Права встроенных ролей — только для справки. */
function PresetTable() {
  const roles = ROLES.filter((r) => r.value !== "OWNER");
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className={th} />
            {roles.map((r) => (
              <th key={r.value} className={th}>
                {r.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SECTIONS.map((x) => (
            <tr key={x.key} className="border-b">
              <td className={td}>{x.label}</td>
              {roles.map((r) => (
                <td key={r.value} className={td}>
                  {levelLabel(PRESETS[r.value].sections[x.key])}
                </td>
              ))}
            </tr>
          ))}
          {FLAGS.map((f) => (
            <tr key={f.key} className="border-b last:border-0">
              <td className={td}>{f.label}</td>
              {roles.map((r) => (
                <td key={r.value} className={td}>
                  {PRESETS[r.value].flags[f.key] ? "да" : "нет"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Матрица прав своей роли: уровень по каждому разделу и отдельные флаги. */
function RoleForm({ id, name, perms, editable }: { id: string; name: string; perms: Permissions; editable: boolean }) {
  return (
    <ActionForm action={updateRoleAction.bind(null, id)} className="flex flex-col gap-3">
      <Field label="Название роли">
        <Input name="name" defaultValue={name} required className="w-72" disabled={!editable} />
      </Field>
      <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {SECTIONS.map((x) => (
          <label key={x.key} className="flex items-center justify-between gap-3 text-sm">
            <span>{x.label}</span>
            <Select name={`s_${x.key}`} defaultValue={perms.sections[x.key]} disabled={!editable} aria-label={x.label}>
              {LEVELS.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.label}
                </option>
              ))}
            </Select>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-4">
        {FLAGS.map((f) => (
          <label key={f.key} className="flex items-center gap-1 text-sm">
            <input type="checkbox" name={`f_${f.key}`} defaultChecked={perms.flags[f.key]} disabled={!editable} /> {f.label}
          </label>
        ))}
      </div>
      {editable && (
        <div>
          <Submit>Сохранить права</Submit>
        </div>
      )}
    </ActionForm>
  );
}

export default async function RolesPage() {
  const s = await requireSession();
  const roles = await listRoles(s.companyId);
  const editable = can(s.perms, "settings", "EDIT");
  return (
    <div className="flex flex-col gap-4">
      <PageTitle create="#new" createLabel="Новая роль"
        actions={
          <Link href="/app/settings" className="text-sm text-blue-600 hover:underline">
            ← Настройки
          </Link>
        }
      >
        Роли и права
      </PageTitle>
      <Card title="Как устроены права">
        <p className="text-sm text-slate-600">
          Права задаются по разделам. Уровни идут по возрастанию, каждый включает предыдущие: «Просмотр» — только смотреть, «Правка» —
          менять существующие документы, «Создание» — заводить новые, «Полный» — ещё удалять, проводить и отменять проведение. Владелец СТО
          имеет все права. Роль назначается пользователю в разделе{" "}
          <Link href="/app/staff" className="text-blue-600 hover:underline">
            Сотрудники → Доступ в систему
          </Link>
          .
        </p>
      </Card>

      {roles.map((r) => (
        <Card
          key={r.id}
          title={r.name}
          actions={
            <span className="flex items-center gap-2">
              <Badge tone="blue">пользователей: {r._count.members}</Badge>
              {can(s.perms, "settings", "FULL") && (
                <ActionForm action={deleteRoleAction.bind(null, r.id)}>
                  <Submit variant="danger">Удалить</Submit>
                </ActionForm>
              )}
            </span>
          }
        >
          {/* key: после сохранения форма пересоздаётся с новыми значениями, иначе React вернёт выпадающие списки к старым */}
          <RoleForm
            key={JSON.stringify([r.name, r.permissions])}
            id={r.id}
            name={r.name}
            perms={parsePermissions(r.permissions)}
            editable={editable}
          />
        </Card>
      ))}

      {can(s.perms, "settings", "CREATE") && (
        <NewPanel>
          <Card title="Новая роль">
            <ActionForm action={createRoleAction} reset className="flex flex-wrap items-end gap-3">
              <Field label="Название" className="min-w-64">
                <Input name="name" required placeholder="например, Кладовщик" />
              </Field>
              <Submit>Создать роль</Submit>
            </ActionForm>
            <p className="mt-2 text-xs text-slate-500">Новая роль получает права механика, дальше их можно расширить или сузить.</p>
          </Card>
        </NewPanel>
      )}

      <Card title="Встроенные роли">
        <PresetTable />
      </Card>
    </div>
  );
}
