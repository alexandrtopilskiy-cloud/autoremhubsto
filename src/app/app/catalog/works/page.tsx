import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { Pager, PreviewRow, SortTh } from "@/components/list-view";
import { Allowed } from "@/components/manager-only";
import { FilterCheck, ListRow, PreviewPane, SearchBox } from "@/components/preview-pane";
import { Card, Field, Input, NewPanel, PageTitle, Select, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatDate, formatQty, orderNo } from "@/lib/format";
import { listHref, parseListQuery, PER_PAGE } from "@/lib/list-query";
import { formatRub } from "@/lib/money";
import { can } from "@/lib/permissions";
import { listWorkGroups, workPreview } from "@/lib/services/catalog";
import { searchWorks, WORK_FILTERS, WORK_SORTS } from "@/lib/services/lists";
import { getCompany } from "@/lib/services/settings";
import { createWorkAction } from "../../manage-actions";
import { CatalogTabs } from "../tabs";
import { CheckAll, GroupList, MoveBar, WorkCheck } from "./client";
import { workPrice } from "./price";
import { previewSession } from "@/lib/preview";
import { LiveForm } from "@/components/busy";

const PATH = "/app/catalog/works";
const FORM = "work-filters";

async function Preview({ companyId, id, hourPrice }: { companyId: string; id: string; hourPrice: number }) {
  const w = await workPreview(companyId, id);
  if (!w) return <p className="text-sm text-slate-500">Работа не найдена.</p>;
  return (
    <>
      <div className="mb-3 flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{w.name}</h2>
        <Link href={`${PATH}/${w.id}`} className="mt-1 self-start rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">
          Открыть карточку
        </Link>
      </div>
      <PreviewRow label="Группа">{w.group?.name ?? <span className="text-amber-700">не указана</span>}</PreviewRow>
      <PreviewRow label="Нормочасы">{w.normHours === null ? "—" : formatQty(Number(w.normHours))}</PreviewRow>
      <PreviewRow label="Цена">{workPrice(w, hourPrice)}</PreviewRow>
      <PreviewRow label="% исполнителю">{w.executorPercent !== null ? `${w.executorPercent}%` : "как в карточке сотрудника"}</PreviewRow>
      <PreviewRow label="В заказ-нарядах">{w.used ? `${w.used} раз` : "ещё не было"}</PreviewRow>
      <PreviewRow label="Последний раз">
        {w.lastOrder ? (
          <Link href={`/app/orders/${w.lastOrder.id}`} className="text-blue-600 hover:underline">
            {orderNo(w.lastOrder.number, w.lastOrder.numberPrefix)} от {formatDate(w.lastOrder.acceptedAt)}
          </Link>
        ) : null}
      </PreviewRow>
    </>
  );
}

/** Панель просмотра по клику на строку: загружается отдельно, список не пересчитывается. */
async function loadPreview(id: string) {
  "use server";
  const s = await previewSession("catalog");
  return s ? <Preview companyId={s.companyId} id={id} hourPrice={(await getCompany(s.companyId)).hourPrice} /> : null;
}

export default async function WorksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireSession();
  const query = parseListQuery(await searchParams, { sorts: WORK_SORTS, sort: "name", dir: "asc", filters: WORK_FILTERS });
  const [list, g, company] = await Promise.all([searchWorks(s.companyId, query), listWorkGroups(s.companyId), getCompany(s.companyId)]);
  const group = query.f.group ?? "";
  const current = g.groups.find((x) => x.id === group);
  const everywhere = query.f.all === "1" && !!query.q;
  const showGroup = !group || everywhere;
  const title = everywhere ? "Поиск во всех группах" : group === "none" ? "Без группы" : (current?.name ?? "Все работы");
  const btn = "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50";
  const cols = showGroup ? 6 : 5;
  return (
    <div className="flex flex-col gap-4">
      <PageTitle create="#new" createLabel="Новая работа">
        Справочники
      </PageTitle>
      <CatalogTabs active="works" />
      <Allowed perms={s.perms} section="catalog" level="CREATE" quiet>
        <NewPanel>
          <Card title="Новая работа">
            <p className="mb-3 text-sm text-slate-600">
              Если цена не указана, работа считается по нормочасам: нормочасы × цена нормочаса СТО ({formatRub(company.hourPrice)}, меняется в{" "}
              <Link className="text-blue-600" href="/app/settings">
                настройках
              </Link>
              ).
            </p>
            {g.groups.length === 0 ? (
              <p className="text-sm text-amber-700">Сначала добавьте группу работ: слева «+ Добавить группу». Работа без группы не сохраняется.</p>
            ) : (
              <ActionForm action={createWorkAction} reset className="flex flex-wrap items-end gap-3">
                <Field label="Название" className="min-w-64 flex-1">
                  <Input name="name" required />
                </Field>
                <Field label="Группа *">
                  <Select name="groupId" required defaultValue={current?.id ?? ""} className="w-52">
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
            )}
          </Card>
        </NewPanel>
      </Allowed>
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-0">
          <GroupList
            groups={g.groups}
            ungrouped={g.ungrouped}
            total={g.total}
            current={group}
            canCreate={can(s.perms, "catalog", "CREATE")}
            canEdit={can(s.perms, "catalog", "EDIT")}
            canDelete={can(s.perms, "catalog", "FULL")}
          />
        </div>
        <PreviewPane
          load={loadPreview}
          selected={query.preview}
          panel={
            query.preview ? (
              <Preview companyId={s.companyId} id={query.preview} hourPrice={company.hourPrice} />
            ) : (
              <p className="text-sm text-slate-500">Нажмите на работу в списке, и здесь появятся её группа, нормочасы и цена. Двойной клик откроет карточку.</p>
            )
          }
          list={
            <>
              <LiveForm id={FORM} action={PATH} className="mb-3 flex flex-wrap items-center gap-2">
                <h2 className="w-full text-lg font-semibold">{title}</h2>
                {group && <input type="hidden" name="group" value={group} />}
                <input type="hidden" name="sort" value={query.sort} />
                <input type="hidden" name="dir" value={query.dir} />
                <SearchBox form={FORM} defaultValue={query.q} label="Поиск работы" placeholder="Поиск по названию, можно несколько слов" />
                {group && <FilterCheck form={FORM} name="all" checked={query.f.all === "1"} label="во всех группах" />}
                <Select name="per" defaultValue={String(query.per)} aria-label="Строк на странице">
                  {PER_PAGE.map((p) => (
                    <option key={p} value={p}>
                      {p} строк
                    </option>
                  ))}
                </Select>
                <button className={btn}>Найти</button>
              </LiveForm>
              <Allowed perms={s.perms} section="catalog" level="EDIT" quiet>
                <MoveBar groups={g.groups} />
              </Allowed>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className={`${th} w-8`}>
                        <CheckAll />
                      </th>
                      <SortTh path={PATH} query={query} sort="name">
                        Наименование
                      </SortTh>
                      {showGroup && <th className={th}>Группа</th>}
                      <SortTh path={PATH} query={query} sort="hours" right>
                        Н/ч
                      </SortTh>
                      <SortTh path={PATH} query={query} sort="price" right>
                        Цена
                      </SortTh>
                      <th className={`${th} text-right whitespace-nowrap`}>% исп.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.rows.map((w) => (
                      <ListRow key={w.id} previewHref={listHref(PATH, query, { preview: w.id })} openHref={`${PATH}/${w.id}`} selected={query.preview === w.id}>
                        <td className={td}>
                          <WorkCheck id={w.id} label={w.name} />
                        </td>
                        <td className={td}>{w.name}</td>
                        {showGroup && <td className={`${td} text-slate-500`}>{w.group?.name ?? "—"}</td>}
                        <td className={`${td} text-right tabular-nums`}>{w.normHours === null ? "—" : formatQty(Number(w.normHours))}</td>
                        <td className={`${td} text-right whitespace-nowrap tabular-nums`}>{w.price ? formatRub(w.price) : <span className="text-slate-500">по н/ч</span>}</td>
                        <td className={`${td} text-right tabular-nums`}>{w.executorPercent !== null ? `${w.executorPercent}%` : "—"}</td>
                      </ListRow>
                    ))}
                    {list.rows.length === 0 && (
                      <tr>
                        <td className={`${td} text-slate-500`} colSpan={cols}>
                          {query.q ? "Ничего не найдено" : "В этой группе пока нет работ"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-slate-500">Один клик — просмотр справа, двойной клик — карточка работы в новой вкладке. Галочки — перенос в другую группу.</p>
              <Pager path={PATH} query={query} total={list.total} page={list.page} pages={list.pages} />
            </>
          }
        />
      </div>
    </div>
  );
}
