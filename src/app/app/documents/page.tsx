import Link from "next/link";
import { Badge, Card, Field, Input, PageTitle, Select, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { formatRub } from "@/lib/money";
import { reportPeriod } from "@/lib/report-period";
import { DOC_TYPES, documentJournal, type DocType } from "@/lib/services/documents";
import { getCompany } from "@/lib/services/settings";

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; type?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const company = await getCompany(s.companyId);
  const { from, to, period } = reportPeriod(sp, company.utcOffset);
  const type = DOC_TYPES.some((t) => t.value === sp.type) ? (sp.type as DocType) : undefined;
  const rows = await documentJournal(s.companyId, period, type);
  const label = (t: DocType) => DOC_TYPES.find((x) => x.value === t)!.label;
  return (
    <div className="flex flex-col gap-4">
      <PageTitle
        actions={
          <Link href="/app/documents/trash" className="text-sm text-blue-600 hover:underline">
            Корзина
          </Link>
        }
      >
        Все документы
      </PageTitle>
      <Card>
        <form className="mb-3 flex flex-wrap items-end gap-2">
          <Field label="С">
            <Input type="date" name="from" defaultValue={from} />
          </Field>
          <Field label="По">
            <Input type="date" name="to" defaultValue={to} />
          </Field>
          <Field label="Вид">
            <Select name="type" defaultValue={type ?? ""}>
              <option value="">Все</option>
              {DOC_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Показать</button>
          <span className="ml-auto text-sm text-slate-600">Документов: {rows.length}</span>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className={th}>Дата</th>
                <th className={th}>Вид</th>
                <th className={th}>Номер</th>
                <th className={th}>Контрагент</th>
                <th className={th}>Статус</th>
                <th className={`${th} text-right`}>Сумма</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.type}-${r.id}`} className="border-b last:border-0 hover:bg-slate-50">
                  <td className={`${td} whitespace-nowrap`}>{formatDate(r.date, true)}</td>
                  <td className={td}>{label(r.type)}</td>
                  <td className={td}>
                    <Link href={r.href} className="text-blue-600 hover:underline">
                      {r.number}
                    </Link>
                  </td>
                  <td className={td}>{r.party}</td>
                  <td className={td}>
                    <Badge tone={r.posted ? "green" : "slate"}>{r.status}</Badge>
                  </td>
                  <td className={`${td} text-right whitespace-nowrap`}>{r.total === null ? "" : formatRub(r.total)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className={`${td} text-slate-500`}>
                    За период документов нет
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
