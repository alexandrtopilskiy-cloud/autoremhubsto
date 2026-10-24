import Link from "next/link";
import { IconLink } from "@/components/icon-button";
import { ActionForm, Submit } from "@/components/form";
import { Allowed } from "@/components/manager-only";
import { Badge, Card, Field, Input, NewPanel, PageTitle, Select, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { FilterSelect, ListFilters, Pager, PreviewHint, PreviewLines, PreviewRow, PreviewTitle, SortTh } from "@/components/list-view";
import { ListRow, PreviewPane } from "@/components/preview-pane";
import { listHref, parseListQuery } from "@/lib/list-query";
import { formatDate, formatQty, saleNo } from "@/lib/format";
import { formatRub } from "@/lib/money";
import { listClients } from "@/lib/services/clients";
import { getSale } from "@/lib/services/warehouse";
import { SALE_FILTERS, SALE_SORTS, searchSales } from "@/lib/services/lists";
import { getCompany } from "@/lib/services/settings";
import { docStatus } from "../product-select";
import { StockTabs } from "../tabs";
import { createSaleAction } from "../warehouse-actions";
import { previewSession } from "@/lib/preview";

const PATH = "/app/stock/sales";

async function Preview({ companyId, id }: { companyId: string; id: string }) {
  const x = await getSale(companyId, id).catch(() => null);
  if (!x) return <p className="text-sm text-slate-500">Продажа не найдена.</p>;
  return (
    <>
      <PreviewTitle title={`${saleNo(x.number, x.numberPrefix)} от ${formatDate(x.date)}`} href={`${PATH}/${x.id}`} />
      <PreviewRow label="Статус">{docStatus(x.status === "POSTED")}</PreviewRow>
      <PreviewRow label="Покупатель">
        {x.client ? (
          <Link href={`/app/clients/${x.client.id}`} className="text-blue-600 hover:underline">
            {x.client.name}
          </Link>
        ) : (
          "Розничный покупатель"
        )}
      </PreviewRow>
      <PreviewRow label="Комментарий">{x.comment}</PreviewRow>
      <PreviewRow label="Сумма">{formatRub(x.totals.total)}</PreviewRow>
      <PreviewRow label="Оплачено">{formatRub(x.totals.paid)}</PreviewRow>
      <PreviewRow label="Долг">{x.totals.due > 0 ? <span className="text-red-600">{formatRub(x.totals.due)}</span> : "нет"}</PreviewRow>
      <PreviewLines
        title="Товары"
        lines={x.lines.map((l) => ({ key: l.id, name: l.product.name, right: `${formatQty(Number(l.qty))} ${l.product.unit} × ${formatRub(l.price)}` }))}
      />
    </>
  );
}

/** Панель просмотра по клику на строку: загружается отдельно, список не пересчитывается. */
async function loadPreview(id: string) {
  "use server";
  const s = await previewSession("stock");
  return s ? <Preview companyId={s.companyId} id={id} /> : null;
}

export default async function SalesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireSession();
  const query = parseListQuery(await searchParams, { sorts: SALE_SORTS, sort: "number", filters: SALE_FILTERS });
  const preview = query.preview;
  const [list, clients] = await Promise.all([
    getCompany(s.companyId).then((c) => searchSales(s.companyId, query, c.utcOffset)),
    listClients(s.companyId),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <PageTitle create="#new" createLabel="Новая продажа без ремонта">Склад</PageTitle>
      <StockTabs active="sales" />
      <Allowed perms={s.perms} section="stock">
        <NewPanel>
          <Card title="Новая продажа без ремонта">
            <ActionForm action={createSaleAction} className="flex flex-wrap items-end gap-3">
              <Field label="Покупатель">
                <Select name="clientId" defaultValue="">
                  <option value="">Розничный покупатель</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.phone && `, ${c.phone}`}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Комментарий">
                <Input name="comment" />
              </Field>
              <Submit>Создать</Submit>
            </ActionForm>
          </Card>
        </NewPanel>
        <PreviewPane
          load={loadPreview}
          selected={preview}
          panel={preview ? <Preview companyId={s.companyId} id={preview} /> : <PreviewHint what="продажу" open="документ" />}
          list={
            <Card>
              <ListFilters path={PATH} query={query} placeholder="Номер, покупатель, телефон, госномер или комментарий">
                <FilterSelect
                  name="status"
                  label="Статус"
                  value={query.f.status}
                  options={[
                    { value: "DRAFT", label: "Черновик" },
                    { value: "POSTED", label: "Проведена" },
                  ]}
                />
                <FilterSelect name="debt" label="Долг" value={query.f.debt} options={[{ value: "1", label: "Только с долгом" }]} />
              </ListFilters>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <SortTh path={PATH} query={query} sort="number">
                        Номер
                      </SortTh>
                      <SortTh path={PATH} query={query} sort="date">
                        Дата
                      </SortTh>
                      <SortTh path={PATH} query={query} sort="client">
                        Покупатель
                      </SortTh>
                      <th className={th}>Статус</th>
                      <SortTh path={PATH} query={query} sort="total" right>
                        Сумма
                      </SortTh>
                      <SortTh path={PATH} query={query} sort="due" right>
                        Долг
                      </SortTh>
                      <th className={th} />
                    </tr>
                  </thead>
                  <tbody>
                    {list.rows.map((x) => (
                      <ListRow key={x.id} previewHref={listHref(PATH, query, { preview: x.id })} openHref={`${PATH}/${x.id}`} selected={preview === x.id}>
                        <td className={td}>
                          <span className="text-blue-600">{saleNo(x.number, x.numberPrefix)}</span>
                        </td>
                        <td className={td}>{formatDate(x.date)}</td>
                        <td className={td}>{x.client?.name ?? "Розничный покупатель"}</td>
                        <td className={td}>
                          <Badge tone={x.status === "POSTED" ? "green" : "amber"}>{docStatus(x.status === "POSTED")}</Badge>
                        </td>
                        <td className={`${td} text-right whitespace-nowrap`}>{formatRub(x.totals.total)}</td>
                        <td className={`${td} text-right whitespace-nowrap ${x.totals.due > 0 ? "text-red-600" : ""}`}>
                          {x.totals.due !== 0 && formatRub(x.totals.due)}
                        </td>
                        <td className={`${td} py-1.5`}>
                          <div className="flex justify-end">
                            <IconLink small newTab icon="print" label="Печать" href={`${PATH}/${x.id}/print`} />
                          </div>
                        </td>
                      </ListRow>
                    ))}
                    {list.rows.length === 0 && (
                      <tr>
                        <td colSpan={7} className={`${td} text-slate-500`}>
                          Продаж не найдено
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {list.total > 0 && (
                    <tfoot>
                      <tr className="border-t font-medium">
                        <td className={td} colSpan={4}>
                          Итого по отбору
                        </td>
                        <td className={`${td} text-right whitespace-nowrap`}>{formatRub(list.sums.total)}</td>
                        <td className={`${td} text-right whitespace-nowrap`}>{list.sums.due !== 0 ? formatRub(list.sums.due) : ""}</td>
                        <td className={td} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              <Pager path={PATH} query={query} total={list.total} page={list.page} pages={list.pages} />
            </Card>
          }
        />
      </Allowed>
    </div>
  );
}
