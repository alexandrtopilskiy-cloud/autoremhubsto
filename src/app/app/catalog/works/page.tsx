import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { ManagerOnly } from "@/components/manager-only";
import { Card, Field, Input, PageTitle } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatRub } from "@/lib/money";
import { listWorks } from "@/lib/services/catalog";
import { getCompany } from "@/lib/services/settings";
import { createWorkAction, deleteWorkAction, updateWorkAction } from "../../manage-actions";
import { CatalogTabs } from "../tabs";

const rubInput = (kop: number) => (kop ? (kop / 100).toFixed(2).replace(".", ",") : "");

export default async function WorksPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const s = await requireSession();
  const { q } = await searchParams;
  const [works, company] = await Promise.all([listWorks(s.companyId, q), getCompany(s.companyId)]);
  return (
    <div className="flex flex-col gap-4">
      <PageTitle>Справочники</PageTitle>
      <CatalogTabs active="works" />
      <ManagerOnly role={s.role}>
        <Card title="Новая работа">
          <p className="mb-3 text-sm text-slate-600">
            Если цена не указана, работа считается по нормочасам: нормочасы × цена нормочаса СТО (
            {formatRub(company.hourPrice)}, меняется в <Link className="text-blue-600" href="/app/settings">настройках</Link>).
          </p>
          <ActionForm action={createWorkAction} reset className="flex flex-wrap items-end gap-3">
            <Field label="Название" className="min-w-64 flex-1">
              <Input name="name" required />
            </Field>
            <Field label="Нормочасы">
              <Input name="normHours" inputMode="decimal" className="w-24" />
            </Field>
            <Field label="Фикс. цена, ₽">
              <Input name="price" inputMode="decimal" className="w-28" />
            </Field>
            <Field label="% исполнителю">
              <Input name="executorPercent" type="number" min={0} max={100} placeholder="как у сотрудника" className="w-36" />
            </Field>
            <Submit>Добавить</Submit>
          </ActionForm>
        </Card>
      </ManagerOnly>
      <Card>
        <form className="mb-3 flex gap-2">
          <Input name="q" defaultValue={q} placeholder="Поиск по названию" className="min-w-72" />
          <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Найти</button>
        </form>
        <div className="flex flex-col divide-y">
          {works.map((w) => (
            <div key={w.id} className="flex flex-wrap items-end gap-3 py-2">
              <ActionForm action={updateWorkAction.bind(null, w.id)} className="flex flex-1 flex-wrap items-end gap-3">
                <Input name="name" defaultValue={w.name} className="min-w-64 flex-1" aria-label="Название" />
                <Input name="normHours" defaultValue={w.normHours ? String(w.normHours).replace(".", ",") : ""} placeholder="н/ч" inputMode="decimal" className="w-24" aria-label="Нормочасы" />
                <Input name="price" defaultValue={rubInput(w.price)} placeholder="по н/ч" inputMode="decimal" className="w-28" aria-label="Цена" />
                <Input
                  name="executorPercent"
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={w.executorPercent ?? ""}
                  placeholder="% исп."
                  className="w-24"
                  aria-label="Процент исполнителю"
                  title="Свой процент исполнителю за эту работу; пусто — процент из карточки сотрудника"
                />
                <Submit variant="ghost">Сохранить</Submit>
              </ActionForm>
              <ActionForm action={deleteWorkAction.bind(null, w.id)}>
                <Submit variant="danger">Удалить</Submit>
              </ActionForm>
            </div>
          ))}
          {works.length === 0 && <p className="py-2 text-sm text-slate-500">Работ пока нет</p>}
        </div>
      </Card>
    </div>
  );
}
