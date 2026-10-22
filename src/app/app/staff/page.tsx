import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { Badge, Field, Input, NewPanel, PageTitle, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import { EMPLOYEE_KINDS, isWorking, listAllEmployees } from "@/lib/services/staff";
import { createEmployeeAction } from "../manage-actions";
import { StaffTabs } from "./tabs";

type Kind = (typeof EMPLOYEE_KINDS)[number]["value"];

const NOTE: Record<Kind, string> = {
  MANAGER:
    "Мастера-приёмщики и менеджеры, которые работают в программе. Их выбирают менеджером в заказ-наряде, им начисляется % менеджера. Логин и роль для входа задаются в «Управление → Пользователи и доступ».",
  EXECUTOR: "Мастера, которые выполняют работы. В программу не входят. Их выбирают исполнителем работы в заказ-наряде, им начисляется % исполнителя.",
};

/** Справочник «Сотрудники»: вкладки Менеджеры и Исполнители. */
export default async function StaffPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const s = await requireSession();
  const kind: Kind = (await searchParams).kind === "EXECUTOR" ? "EXECUTOR" : "MANAGER";
  const all = await listAllEmployees(s.companyId);
  const list = all.filter((e) => e.kind === kind);
  const manager = kind === "MANAGER";
  const one = EMPLOYEE_KINDS.find((k) => k.value === kind)!.one;
  return (
    <div className="flex flex-col gap-4">
      <PageTitle create={can(s.perms, "staff", "CREATE") ? "#new" : undefined} createLabel={`Новый ${one}`}>
        Сотрудники
      </PageTitle>
      <StaffTabs
        active={kind}
        tabs={EMPLOYEE_KINDS.map((k) => ({
          key: k.value,
          href: `/app/staff?kind=${k.value}`,
          label: `${k.label} · ${all.filter((e) => e.kind === k.value).length}`,
        }))}
      />
      <NewPanel>
        <ActionForm action={createEmployeeAction} reset className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 p-4">
          <input type="hidden" name="kind" value={kind} />
          <Field label="ФИО" className="min-w-64 flex-1">
            <Input name="name" required />
          </Field>
          <Field label="Должность">
            <Input name="position" className="w-48" defaultValue={manager ? "Мастер-приёмщик" : ""} />
          </Field>
          <Field label="Телефон">
            <Input name="phone" type="tel" className="w-44" />
          </Field>
          <Field label="Дата приёма">
            <Input name="hiredAt" type="date" />
          </Field>
          <Field label={manager ? "% менеджера" : "% исполнителя"}>
            <Input name={manager ? "salesPercent" : "workPercent"} type="number" min={0} max={100} defaultValue={0} className="w-24" />
          </Field>
          <Submit>Добавить</Submit>
          <p className="w-full text-xs text-slate-500">Адрес, паспорт, документы и подробный расчёт зарплаты заполняются в карточке сотрудника.</p>
        </ActionForm>
      </NewPanel>
      <p className="text-sm text-slate-600">{NOTE[kind]}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className={th}>ФИО</th>
              <th className={th}>Должность</th>
              <th className={th}>Телефон</th>
              {manager && <th className={th}>Логин</th>}
              <th className={th}>Принят</th>
              <th className={th}>Уволен</th>
              <th className={th}>{manager ? "% менеджера" : "% исполнителя"}</th>
              <th className={th}>Статус</th>
            </tr>
          </thead>
          <tbody>
            {list.map((e) => (
              <tr key={e.id} className="border-b last:border-0 hover:bg-slate-50">
                <td className={td}>
                  <Link href={`/app/staff/${e.id}`} className="text-blue-600 hover:underline">
                    {e.name}
                  </Link>
                </td>
                <td className={td}>{e.position}</td>
                <td className={td}>{e.phone}</td>
                {manager && <td className={td}>{e.user?.email}</td>}
                <td className={td}>{formatDate(e.hiredAt)}</td>
                <td className={td}>{formatDate(e.firedAt)}</td>
                <td className={td}>
                  {manager ? `${e.salesPercent}%${e.itemsPercent !== null ? `, товары ${e.itemsPercent}%` : ""}` : `${e.workPercent}%`}
                </td>
                <td className={td}>{isWorking(e) ? <Badge tone="green">работает</Badge> : <Badge>уволен</Badge>}</td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td className={`${td} text-slate-500`} colSpan={8}>
                  Пока никого нет. Добавьте сотрудника кнопкой «+».
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
