import Link from "next/link";
import { notFound } from "next/navigation";
import { Attachments } from "@/components/attachments";
import { ActionForm, Submit } from "@/components/form";
import { Badge, Card, Field, Input, PageTitle, Select } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { PAY_BASES } from "@/lib/pay-scheme";
import { can } from "@/lib/permissions";
import { EMPLOYEE_MIME } from "@/lib/services/attachments";
import { EMPLOYEE_KINDS, isWorking } from "@/lib/services/staff";
import { updateEmployeeAction } from "../../manage-actions";
import { updatePaySchemeAction } from "../payroll-actions";
import { StaffTabs } from "../tabs";

const TABS = [
  { key: "main", label: "Основное" },
  { key: "pay", label: "Расчёт зарплаты" },
  { key: "docs", label: "Документы" },
] as const;

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

/** Карточка сотрудника: справочные данные, проценты (8.2 схема зарплаты) и личные документы. */
export default async function EmployeePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab)?.key ?? "main";
  const e = await prisma.employee.findFirst({
    where: { id, companyId: s.companyId },
    include: { user: { select: { email: true } } },
  });
  if (!e) notFound();
  const files = await prisma.attachment.count({ where: { companyId: s.companyId, docKind: "EMPLOYEE", docId: e.id } });
  const manager = e.kind === "MANAGER";
  const edit = can(s.perms, "staff", "EDIT");
  const path = `/app/staff/${e.id}`;
  return (
    <div className="flex flex-col gap-4">
      <PageTitle tab={e.name.split(" ").slice(0, 2).join(" ")}>
        {e.name}{" "}
        {isWorking(e) ? <Badge tone="green">работает</Badge> : <Badge>уволен{e.firedAt && ` ${formatDate(e.firedAt)}`}</Badge>}
      </PageTitle>
      <p className="-mt-2 text-sm text-slate-500">
        <Link href={`/app/staff?kind=${e.kind}`} className="text-blue-600 hover:underline">
          {EMPLOYEE_KINDS.find((k) => k.value === e.kind)!.label}
        </Link>
        {e.position && ` · ${e.position}`}
      </p>
      <StaffTabs
        active={tab}
        tabs={TABS.map((t) => ({ key: t.key, href: `${path}?tab=${t.key}`, label: t.key === "docs" && files ? `${t.label} · ${files}` : t.label }))}
      />

      {tab === "main" && (
        <ActionForm action={updateEmployeeAction.bind(null, e.id)} className="flex max-w-4xl flex-col gap-4">
          <Card title="Работа">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Должность">
                <Input name="position" defaultValue={e.position ?? ""} className="w-56" />
              </Field>
              <Field label="Дата приёма на работу">
                <Input name="hiredAt" type="date" defaultValue={day(e.hiredAt)} />
              </Field>
              <Field label="Дата увольнения">
                <Input name="firedAt" type="date" defaultValue={day(e.firedAt)} />
              </Field>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              С даты увольнения сотрудника нельзя выбрать в новых документах. В старых заказ-нарядах и в зарплате он остаётся.
            </p>
          </Card>
          <Card title="Справочная информация">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="ФИО" className="min-w-72 flex-1">
                <Input name="name" defaultValue={e.name} required />
              </Field>
              <Field label="Номер телефона">
                <Input name="phone" type="tel" defaultValue={e.phone ?? ""} className="w-48" />
              </Field>
              <Field label="Адрес проживания" className="w-full">
                <Input name="address" defaultValue={e.address ?? ""} placeholder="город, улица, дом, квартира" />
              </Field>
              <Field label="Серия паспорта">
                <Input name="passportSeries" defaultValue={e.passportSeries ?? ""} placeholder="0000" maxLength={5} inputMode="numeric" className="w-28" />
              </Field>
              <Field label="Номер паспорта">
                <Input name="passportNumber" defaultValue={e.passportNumber ?? ""} placeholder="000000" maxLength={7} inputMode="numeric" className="w-32" />
              </Field>
            </div>
            {manager && (
              <p className="mt-3 text-sm text-slate-600">
                Вход в программу:{" "}
                {e.user ? <b>{e.user.email}</b> : <span className="text-slate-500">не связан с логином</span>}. Логин и роль задаются в{" "}
                <Link href="/app/settings/users" className="text-blue-600 hover:underline">
                  Управление → Пользователи и доступ
                </Link>
                .
              </p>
            )}
            <p className="mt-2 text-xs text-slate-500">Паспорт, адрес и документы видят только пользователи с правом на раздел «Сотрудники».</p>
          </Card>
          {edit && (
            <div>
              <Submit>Сохранить</Submit>
            </div>
          )}
        </ActionForm>
      )}

      {tab === "pay" && (
        <ActionForm action={updatePaySchemeAction.bind(null, e.id)} className="flex max-w-4xl flex-col gap-4">
          {/* проценты другой роли сохраняются как есть */}
          {manager ? (
            <>
              <input type="hidden" name="workPercent" value={e.workPercent} />
              <input type="hidden" name="workBase" value={e.workBase} />
              <Card title="Расчёт % менеджера">
                <p className="mb-3 text-sm text-slate-600">Начисляется с заказ-нарядов, где сотрудник указан менеджером.</p>
                <div className="flex flex-wrap items-end gap-3">
                  <Field label="% от работ">
                    <Input name="salesPercent" type="number" min={0} max={100} defaultValue={e.salesPercent} className="w-24" />
                  </Field>
                  <Field label="% от товаров">
                    <Input name="itemsPercent" type="number" min={0} max={100} defaultValue={e.itemsPercent ?? ""} placeholder="как от работ" className="w-32" />
                  </Field>
                  <Field label="База для товаров">
                    <Select name="itemsBase" defaultValue={e.itemsBase}>
                      {PAY_BASES.map((b) => (
                        <option key={b.value} value={b.value}>
                          {b.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </Card>
            </>
          ) : (
            <>
              <input type="hidden" name="salesPercent" value={e.salesPercent} />
              <input type="hidden" name="itemsPercent" value={e.itemsPercent ?? ""} />
              <input type="hidden" name="itemsBase" value={e.itemsBase} />
              <Card title="Расчёт % исполнителя">
                <p className="mb-3 text-sm text-slate-600">Начисляется с работ, где сотрудник указан исполнителем.</p>
                <div className="flex flex-wrap items-end gap-3">
                  <Field label="% от работ">
                    <Input name="workPercent" type="number" min={0} max={100} defaultValue={e.workPercent} className="w-24" />
                  </Field>
                  <Field label="База">
                    <Select name="workBase" defaultValue={e.workBase}>
                      {PAY_BASES.filter((b) => b.value !== "PROFIT").map((b) => (
                        <option key={b.value} value={b.value}>
                          {b.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Для отдельных работ можно задать свой процент в{" "}
                  <Link className="text-blue-600" href="/app/catalog/works">
                    справочнике работ
                  </Link>
                  , он заменит процент сотрудника.
                </p>
              </Card>
            </>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="paidOnly" defaultChecked={e.paidOnly} /> начислять только по полностью оплаченным заказ-нарядам
          </label>
          <div className="flex flex-wrap items-center gap-4">
            {edit && <Submit>Сохранить</Submit>}
            <Link className="text-sm text-blue-600 hover:underline" href={`/app/staff/payroll/${e.id}`}>
              Расчётный листок за текущий месяц
            </Link>
          </div>
        </ActionForm>
      )}

      {tab === "docs" && (
        <div className="max-w-4xl">
          <Attachments
            companyId={s.companyId}
            kind="EMPLOYEE"
            docId={e.id}
            path={path}
            title="Документы"
            accept={EMPLOYEE_MIME.join(",")}
            hint="JPG, PNG, WEBP или PDF · до 30 МБ на файл"
          />
          <p className="mt-2 text-xs text-slate-500">
            Скан паспорта, трудовой договор и другие документы. Файлы хранятся закрыто: открыть их можно только из программы и только с правом на раздел
            «Сотрудники».
          </p>
        </div>
      )}
    </div>
  );
}
