import { ActionForm, Submit } from "@/components/form";
import { Allowed } from "@/components/manager-only";
import { Badge, Card, Field, Input, NewPanel, PageTitle, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { PreviewHint, PreviewLines, PreviewRow, PreviewTitle } from "@/components/list-view";
import { ListRow, PreviewPane } from "@/components/preview-pane";
import { previewHref, previewId } from "@/lib/list-query";
import { formatDate, formatQty } from "@/lib/format";
import { formatRub } from "@/lib/money";
import { getWriteOff, listWriteOffs } from "@/lib/services/warehouse";
import { docStatus } from "../product-select";
import { StockTabs } from "../tabs";
import { createWriteOffAction } from "../warehouse-actions";
import { dicts } from "@/lib/services/dictionaries";
import { DictList } from "@/components/dict-list";

const PATH = "/app/stock/writeoffs";

async function Preview({ companyId, id }: { companyId: string; id: string }) {
  const w = await getWriteOff(companyId, id).catch(() => null);
  if (!w) return <p className="text-sm text-slate-500">Списание не найдено.</p>;
  return (
    <>
      <PreviewTitle title={`СП-${w.number} от ${formatDate(w.date)}`} href={`${PATH}/${w.id}`} />
      <PreviewRow label="Статус">{docStatus(w.status === "POSTED")}</PreviewRow>
      <PreviewRow label="Причина">{w.reason}</PreviewRow>
      <PreviewRow label="Себестоимость">{formatRub(w.cost)}</PreviewRow>
      <PreviewLines title="Товары" lines={w.lines.map((l) => ({ key: l.id, name: l.product.name, right: `${formatQty(Number(l.qty))} ${l.product.unit}` }))} />
    </>
  );
}

export default async function WriteOffsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const preview = previewId(sp);
  const lists = await dicts(s.companyId, ["WRITE_OFF_REASON"]);
  const list = await listWriteOffs(s.companyId);
  return (
    <div className="flex flex-col gap-4">
      <PageTitle create="#new" createLabel="Новое списание">Склад</PageTitle>
      <StockTabs active="writeoffs" />
      <Allowed perms={s.perms} section="stock">
        <NewPanel>
          <Card title="Новое списание">
            <ActionForm action={createWriteOffAction} className="flex flex-wrap items-end gap-3">
              <Field label="Причина">
                <Input name="reason" list="writeoff-reasons" className="w-64" />
              </Field>
              <DictList id="writeoff-reasons" items={lists.WRITE_OFF_REASON} />
              <Submit>Создать</Submit>
            </ActionForm>
          </Card>
        </NewPanel>
        <PreviewPane
          selected={preview}
          panel={preview ? <Preview companyId={s.companyId} id={preview} /> : <PreviewHint what="списание" open="документ" />}
          list={
            <Card>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className={th}>Номер</th>
                    <th className={th}>Дата</th>
                    <th className={th}>Причина</th>
                    <th className={th}>Статус</th>
                    <th className={`${th} text-right`}>Себестоимость</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((w) => (
                    <ListRow key={w.id} previewHref={previewHref(PATH, sp, w.id)} openHref={`${PATH}/${w.id}`} selected={preview === w.id}>
                      <td className={td}>
                        <span className="text-blue-600">
                          СП-{w.number}
                        </span>
                      </td>
                      <td className={td}>{formatDate(w.date)}</td>
                      <td className={td}>{w.reason}</td>
                      <td className={td}>
                        <Badge tone={w.status === "POSTED" ? "green" : "amber"}>{docStatus(w.status === "POSTED")}</Badge>
                      </td>
                      <td className={`${td} text-right whitespace-nowrap`}>{formatRub(w.cost)}</td>
                    </ListRow>
                  ))}
                  {list.length === 0 && (
                    <tr>
                      <td colSpan={5} className={`${td} text-slate-500`}>
                        Списаний пока нет
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>
          }
        />
      </Allowed>
    </div>
  );
}
