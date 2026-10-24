import { ActionForm, Submit } from "@/components/form";
import { Allowed } from "@/components/manager-only";
import { Badge, Card, Field, Input, NewPanel, PageTitle, Select, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { FilterSelect, ListFilters, Pager, PreviewHint, PreviewLines, PreviewRow, PreviewTitle, SortTh } from "@/components/list-view";
import { ListRow, PreviewPane } from "@/components/preview-pane";
import { formatDate, formatQty, receiptNo } from "@/lib/format";
import { listHref, parseListQuery } from "@/lib/list-query";
import { formatRub } from "@/lib/money";
import { getReceipt, listSuppliers } from "@/lib/services/stock";
import { RECEIPT_FILTERS, RECEIPT_SORTS, searchReceipts } from "@/lib/services/lists";
import { getCompany } from "@/lib/services/settings";
import { createReceiptAction } from "../actions";
import { StockTabs } from "../tabs";
import { previewSession } from "@/lib/preview";

const PATH = "/app/stock/receipts";

async function Preview({ companyId, id }: { companyId: string; id: string }) {
  const r = await getReceipt(companyId, id).catch(() => null);
  if (!r) return <p className="text-sm text-slate-500">Приход не найден.</p>;
  return (
    <>
      <PreviewTitle title={`${receiptNo(r.number, r.numberPrefix)} от ${formatDate(r.date)}`} href={`${PATH}/${r.id}`} />
      <PreviewRow label="Статус">{r.status === "POSTED" ? "Проведён" : "Черновик"}</PreviewRow>
      <PreviewRow label="Поставщик">{r.supplier?.name}</PreviewRow>
      <PreviewRow label="Документ поставщика">{r.supplierDoc}</PreviewRow>
      <PreviewRow label="Сумма">{formatRub(r.total)}</PreviewRow>
      <PreviewLines
        title="Товары"
        lines={r.lines.map((l) => ({ key: l.id, name: l.product.name, right: `${formatQty(Number(l.qty))} ${l.product.unit} × ${formatRub(l.cost)}` }))}
      />
    </>
  );
}

/** Панель просмотра по клику на строку: загружается отдельно, список не пересчитывается. */
async function loadPreview(id: string) {
  "use server";
  const s = await previewSession("stock", "costs");
  return s ? <Preview companyId={s.companyId} id={id} /> : null;
}

export default async function ReceiptsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireSession();
  const query = parseListQuery(await searchParams, { sorts: RECEIPT_SORTS, sort: "number", filters: RECEIPT_FILTERS });
  const preview = query.preview;
  const [list, suppliers] = await Promise.all([
    getCompany(s.companyId).then((c) => searchReceipts(s.companyId, query, c.utcOffset)),
    listSuppliers(s.companyId),
  ]);
  return (
    <div className="flex flex-col gap-4">
      <PageTitle create="#new" createLabel="Новый приход">Склад</PageTitle>
      <StockTabs active="receipts" />
      <Allowed perms={s.perms} section="stock" flag="costs">
        <NewPanel>
          <Card title="Новый приход">
            <ActionForm action={createReceiptAction} className="flex flex-wrap items-end gap-3">
              <Field label="Поставщик">
                <Select name="supplierId" defaultValue="">
                  <option value="">Не указан</option>
                  {suppliers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Номер документа поставщика">
                <Input name="supplierDoc" />
              </Field>
              <Submit>Создать</Submit>
            </ActionForm>
          </Card>
        </NewPanel>
        <PreviewPane
          load={loadPreview}
          selected={preview}
          panel={preview ? <Preview companyId={s.companyId} id={preview} /> : <PreviewHint what="приход" open="накладную" />}
          list={
            <Card>
              <ListFilters path={PATH} query={query} placeholder="Номер, номер поставщика, поставщик или комментарий">
                <FilterSelect
                  name="status"
                  label="Статус"
                  value={query.f.status}
                  options={[
                    { value: "DRAFT", label: "Черновик" },
                    { value: "POSTED", label: "Проведён" },
                  ]}
                />
                <FilterSelect
                  name="supplier"
                  label="Поставщик"
                  value={query.f.supplier}
                  options={[...suppliers.map((p) => ({ value: p.id, label: p.name })), { value: "none", label: "Не указан" }]}
                />
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
                      <SortTh path={PATH} query={query} sort="supplier">
                        Поставщик
                      </SortTh>
                      <th className={th}>Статус</th>
                      <SortTh path={PATH} query={query} sort="total" right>
                        Сумма
                      </SortTh>
                    </tr>
                  </thead>
                  <tbody>
                    {list.rows.map((r) => (
                      <ListRow key={r.id} previewHref={listHref(PATH, query, { preview: r.id })} openHref={`${PATH}/${r.id}`} selected={preview === r.id}>
                        <td className={td}>
                          <span className="text-blue-600">{receiptNo(r.number, r.numberPrefix)}</span>
                          {r.supplierDoc && <span className="text-slate-500"> ({r.supplierDoc})</span>}
                        </td>
                        <td className={td}>{formatDate(r.date)}</td>
                        <td className={td}>{r.supplier?.name}</td>
                        <td className={td}>
                          <Badge tone={r.status === "POSTED" ? "green" : "amber"}>{r.status === "POSTED" ? "Проведён" : "Черновик"}</Badge>
                        </td>
                        <td className={`${td} text-right whitespace-nowrap`}>{formatRub(r.total)}</td>
                      </ListRow>
                    ))}
                    {list.rows.length === 0 && (
                      <tr>
                        <td colSpan={5} className={`${td} text-slate-500`}>
                          Приходов не найдено
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
