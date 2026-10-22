import { ActionForm, Submit } from "@/components/form";
import { Badge, Field, Input, NewPanel, PageTitle, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { PreviewHint, PreviewRow, PreviewTitle } from "@/components/list-view";
import { ListRow, PreviewPane } from "@/components/preview-pane";
import { previewHref, previewId } from "@/lib/list-query";
import { formatDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import { EMPLOYEE_KINDS, isWorking, listAllEmployees } from "@/lib/services/staff";
import { createEmployeeAction } from "../manage-actions";
import { StaffTabs } from "./tabs";

const PATH = "/app/staff";

type Kind = (typeof EMPLOYEE_KINDS)[number]["value"];

const NOTE: Record<Kind, string> = {
  MANAGER:
    "Мастера-приёмщики и менеджеры, которые работают в программе. Их выбирают менеджером в заказ-наряде, им начисляется % менеджера. Логин и роль для входа задаются в «Управление → Пользователи и доступ».",
  EXECUTOR: "Мастера, которые выполняют работы. В программу не входят. Их выбирают исполнителем работы в заказ-наряде, им начисляется % исполнителя.",
};

/** Справочник «Сотрудники»: вкладки Менеджеры и Исполнители. */
export default async function StaffPage({ searchParams }: { searchParams: Promise<{ kind?: string; preview?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const kind: Kind = sp.kind === "EXECUTOR" ? "EXECUTOR" : "MANAGER";
  const preview = previewId(sp);
  const all = await listAllEmployees(s.companyId);
  const list = all.filter((e) => e.kind === kind);
  const manager = kind === "MANAGER";
  const one = EMPLOYEE_KINDS.find((k) => k.value === kind)!.one;
  const percent = (e: (typeof list)[number]) =>
    manager ? `${e.salesPercent}%${e.itemsPercent !== null ? `, товары ${e.itemsPercent}%` : ""}` : `${e.workPercent}%`;
  const sel = list.find((e) => e.id === preview);
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
      <PreviewPane
        selected={preview}
        panel={
          sel ? (
            <>
              <PreviewTitle title={sel.name} sub={sel.position} href={`${PATH}/${sel.id}`} open="Открыть карточку" />
              <PreviewRow label="Статус">{isWorking(sel) ? "работает" : "уволен"}</PreviewRow>
              <PreviewRow label="Телефон">{sel.phone}</PreviewRow>
              {manager && <PreviewRow label="Логин">{sel.user?.email ?? "нет входа в программу"}</PreviewRow>}
              <PreviewRow label="Принят">{formatDate(sel.hiredAt)}</PreviewRow>
              <PreviewRow label="Уволен">{sel.firedAt ? formatDate(sel.firedAt) : null}</PreviewRow>
              <PreviewRow label={manager ? "% менеджера" : "% исполнителя"}>{percent(sel)}</PreviewRow>
            </>
          ) : (
            <PreviewHint what="сотрудника" open="его карточку" />
          )
        }
        list={
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
                  <ListRow key={e.id} previewHref={previewHref(PATH, sp, e.id)} openHref={`${PATH}/${e.id}`} selected={preview === e.id}>
                    <td className={td}>
                      <span className="text-blue-600">
                        {e.name}
                      </span>
                    </td>
                    <td className={td}>{e.position}</td>
                    <td className={td}>{e.phone}</td>
                    {manager && <td className={td}>{e.user?.email}</td>}
                    <td className={td}>{formatDate(e.hiredAt)}</td>
                    <td className={td}>{formatDate(e.firedAt)}</td>
                    <td className={td}>{percent(e)}</td>
                    <td className={td}>{isWorking(e) ? <Badge tone="green">работает</Badge> : <Badge>уволен</Badge>}</td>
                  </ListRow>
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
        }
      />
    </div>
  );
}
