import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/form";
import { Card, Field, Input, PageTitle, Select, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate, formatQty, orderNo } from "@/lib/format";
import { formatRub } from "@/lib/money";
import { can } from "@/lib/permissions";
import { getWork, listWorkGroups } from "@/lib/services/catalog";
import { getCompany } from "@/lib/services/settings";
import { deleteWorkAction, updateWorkCardAction } from "../../../manage-actions";
import { workPrice } from "../price";

const rubInput = (kop: number) => (kop ? (kop / 100).toFixed(2).replace(".", ",") : "");

/** Карточка работы из справочника: правка, группа и в каких заказ-нарядах она была. */
export default async function WorkPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const w = await getWork(s.companyId, id);
  if (!w) notFound();
  const [g, company, used] = await Promise.all([
    listWorkGroups(s.companyId),
    getCompany(s.companyId),
    prisma.workOrderWork.findMany({
      where: { workId: w.id, order: { companyId: s.companyId } },
      include: { order: { include: { client: { select: { name: true } } } } },
      orderBy: { order: { acceptedAt: "desc" } },
      take: 20,
    }),
  ]);
  const edit = can(s.perms, "catalog", "EDIT");
  return (
    <div className="flex flex-col gap-4">
      <PageTitle tab={`Работа: ${w.name}`}>{w.name}</PageTitle>
      <p className="-mt-2 text-sm text-slate-500">
        <Link href={`/app/catalog/works${w.groupId ? `?group=${w.groupId}` : ""}`} className="text-blue-600 hover:underline">
          {w.group?.name ?? "Без группы"}
        </Link>
        {" · "}
        {workPrice(w, company.hourPrice)}
      </p>
      <Card title="Основное">
        <ActionForm action={updateWorkCardAction.bind(null, w.id)} className="flex max-w-4xl flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Название" className="min-w-64 flex-1">
              <Input name="name" defaultValue={w.name} required disabled={!edit} />
            </Field>
            <Field label="Группа *">
              <Select name="groupId" required defaultValue={w.groupId ?? ""} className="w-56" disabled={!edit}>
                <option value="" disabled>
                  — выберите группу —
                </option>
                {g.groups.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Нормочасы">
              <Input name="normHours" defaultValue={w.normHours === null ? "" : formatQty(Number(w.normHours))} inputMode="decimal" className="w-24" disabled={!edit} />
            </Field>
            <Field label="Фикс. цена, ₽">
              <Input name="price" defaultValue={rubInput(w.price)} placeholder="по н/ч" inputMode="decimal" className="w-28" disabled={!edit} />
            </Field>
            <Field label="% исполнителю">
              <Input
                name="executorPercent"
                type="number"
                min={0}
                max={100}
                defaultValue={w.executorPercent ?? ""}
                placeholder="как у сотрудника"
                className="w-36"
                disabled={!edit}
              />
            </Field>
          </div>
          <p className="text-xs text-slate-500">
            Если цена не указана, работа считается по нормочасам: нормочасы × цена нормочаса СТО ({formatRub(company.hourPrice)}). Пустой % исполнителю — процент из
            карточки сотрудника.
          </p>
          {edit && (
            <div>
              <Submit>Сохранить</Submit>
            </div>
          )}
        </ActionForm>
        {can(s.perms, "catalog", "FULL") && (
          <ActionForm action={deleteWorkAction.bind(null, w.id)} className="mt-4 border-t border-slate-100 pt-3">
            <Submit variant="danger">Удалить работу</Submit>
            <p className="mt-1 text-xs text-slate-500">В уже оформленных заказ-нарядах работа останется с прежним названием и ценой.</p>
          </ActionForm>
        )}
      </Card>
      <Card title="В заказ-нарядах">
        {used.length === 0 ? (
          <p className="text-sm text-slate-500">Работа ещё не попадала в заказ-наряды.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className={th}>Наряд</th>
                  <th className={th}>Дата</th>
                  <th className={th}>Клиент</th>
                  <th className={`${th} text-right`}>Н/ч</th>
                </tr>
              </thead>
              <tbody>
                {used.map((u) => (
                  <tr key={u.id} className="border-b last:border-0">
                    <td className={td}>
                      <Link href={`/app/orders/${u.order.id}`} className="text-blue-600 hover:underline">
                        {orderNo(u.order.number)}
                      </Link>
                    </td>
                    <td className={td}>{formatDate(u.order.acceptedAt)}</td>
                    <td className={td}>{u.order.client.name}</td>
                    <td className={`${td} text-right tabular-nums`}>{formatQty(Number(u.normHours))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {used.length === 20 && <p className="mt-2 text-xs text-slate-500">Показаны последние 20 нарядов.</p>}
          </div>
        )}
      </Card>
    </div>
  );
}
