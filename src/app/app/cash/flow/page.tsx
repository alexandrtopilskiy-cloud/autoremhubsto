import Link from "next/link";
import { Card, Field, Input, PageTitle, Select, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { formatRub } from "@/lib/money";
import { can } from "@/lib/permissions";
import { cashFlowReport, drillEntries } from "@/lib/services/cash-flow";
import { listCashboxes } from "@/lib/services/cash";
import { getCompany } from "@/lib/services/settings";
import { flowQuery, flowParams, flowPresets } from "./params";
import { FlowTable, type FlowRow } from "./flow-table";
import { LiveForm } from "@/components/busy";

const PATH = "/app/cash/flow";
const seg = (on: boolean) => `px-3 py-1.5 text-sm ${on ? "bg-blue-600 text-white" : "bg-white hover:bg-slate-50"}`;

type SP = { from?: string; to?: string; by?: string; split?: string; box?: string; d?: string; col?: string };

export default async function CashFlowPage({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const company = await getCompany(s.companyId);
  const tz = company.utcOffset;
  const p = flowParams(sp, tz);
  const r = await cashFlowReport(s.companyId, p);
  const boxes = r.accounts.flatMap((g) => g.rows).filter((b) => b.id);
  const allBoxes = await listCashboxes(s.companyId);
  const q = (over: Partial<typeof p>) => `${PATH}?${flowQuery({ ...p, ...over })}`;
  const href = q({});
  const n = r.columns.length;
  const sumLast = n > 1;

  let head: string[];
  const rows: FlowRow[] = [];
  if (p.by === "category") {
    head = ["Статья", ...r.columns.map((c) => c.label)];
    rows.push({ key: "open", kind: "total", label: "Остаток на начало периода", values: r.opening });
    for (const sec of r.sections) {
      const sk = sec.income ? "in" : "out";
      rows.push({ key: sk, kind: "sec", label: sec.income ? "Поступления" : "Выплаты", values: sec.values });
      for (const g of sec.groups) {
        const gk = `${sk}:${g.name ?? ""}`;
        if (g.name) rows.push({ key: gk, kind: "grp", label: g.name, values: g.values });
        for (const it of g.items)
          rows.push({
            key: it.id,
            kind: g.name ? "item" : "grp",
            label: it.name,
            values: it.values,
            drill: it.values.map(() => `c:${it.id}`),
            parent: g.name ? gk : undefined,
          });
      }
      if (!sec.groups.length) rows.push({ key: `${sk}:empty`, kind: "sub", label: "Нет движений", values: [], bare: true });
    }
    rows.push({ key: "net", kind: "total", label: "Чистый денежный поток", values: r.net });
    if (r.transfers.some((v) => v)) rows.push({ key: "tr", kind: "item", label: "Переводы между счетами", values: r.transfers });
    rows.push({ key: "close", kind: "total", label: "Остаток на конец периода", values: r.closing });
  } else {
    head = ["Счёт", "Остаток на начало", "Приход", "Расход", "Перевод сюда", "Перевод отсюда", "Остаток на конец"];
    const vals = (v: { open: number; in: number; out: number; tin: number; tout: number; close: number }) => [v.open, v.in, v.out, v.tin, v.tout, v.close];
    const drill = (id: string) => [null, `a:${id}:in`, `a:${id}:out`, `a:${id}:tin`, `a:${id}:tout`, null];
    for (const g of r.accounts) {
      rows.push({ key: `k:${g.kind}`, kind: "sec", label: g.label, values: [], bare: true });
      for (const a of g.rows) {
        rows.push({
          key: `a:${a.id}`,
          kind: "grp",
          label: a.hidden ? `${a.name} (скрыт)` : a.name,
          values: vals(a.total),
          drill: drill(a.id),
          col: Array(6).fill(n - 1),
        });
        if (a.months.length > 1)
          a.months.forEach((m, i) =>
            rows.push({ key: `a:${a.id}:${i}`, kind: "sub", label: m.label, values: vals(m), drill: drill(a.id), col: Array(6).fill(i), parent: `a:${a.id}` }),
          );
      }
    }
    rows.push({ key: "total", kind: "total", label: "Итого по всем счетам", values: vals(r.accountTotal) });
  }

  const col = Number(sp.col);
  const drill = sp.d ? drillEntries(r, sp.d, Number.isInteger(col) ? col : n - 1, tz) : null;
  const drillName = (() => {
    if (!sp.d) return "";
    const [k, id, what] = sp.d.split(":");
    if (k === "c") return r.sections.flatMap((x) => x.groups.flatMap((g) => g.items)).find((x) => x.id === id)?.name ?? "Статья";
    const box = boxes.find((b) => b.id === id)?.name ?? "Счёт";
    return `${box}, ${{ in: "приход", out: "расход", tin: "переводы сюда", tout: "переводы отсюда" }[what] ?? ""}`;
  })();
  const drillCol = r.columns[Number.isInteger(col) ? col : n - 1] ?? r.columns[n - 1];

  return (
    <div className="flex flex-col gap-4">
      <PageTitle
        actions={
          can(s.perms, "settings") ? (
            <Link href="/app/settings/money" className="text-sm text-blue-600 hover:underline">
              Статьи и счета
            </Link>
          ) : undefined
        }
      >
        Движение денежных средств
      </PageTitle>

      <Card>
        <LiveForm className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <input type="hidden" name="by" value={p.by} />
          <input type="hidden" name="split" value={p.split} />
          <Field label="С">
            <Input type="date" name="from" defaultValue={p.from} />
          </Field>
          <Field label="По">
            <Input type="date" name="to" defaultValue={p.to} />
          </Field>
          <Field label="Счета">
            <Select name="box" defaultValue={p.cashboxId ?? ""}>
              <option value="">Все счета</option>
              {allBoxes.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Показать</button>
          <a href={`${PATH}/export?${flowQuery(p)}`} className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50">
            Скачать для Excel
          </a>
        </LiveForm>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex flex-wrap gap-1.5">
            {flowPresets(tz).map((x) => (
              <Link
                key={x.label}
                href={q({ from: x.from, to: x.to })}
                className={`rounded-full border px-3 py-1 text-xs ${x.from === p.from && x.to === p.to ? "border-blue-500 text-blue-600" : "border-slate-300 hover:border-blue-500"}`}
              >
                {x.label}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Учёт</span>
            <span className="inline-flex overflow-hidden rounded-md border border-slate-300">
              <Link href={q({ by: "category" })} className={seg(p.by === "category")}>
                По статьям
              </Link>
              <Link href={q({ by: "account" })} className={`${seg(p.by === "account")} border-l border-slate-300`}>
                По счетам
              </Link>
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Разбивка</span>
            <span className="inline-flex overflow-hidden rounded-md border border-slate-300">
              <Link href={q({ split: "month" })} className={seg(p.split === "month")}>
                По месяцам
              </Link>
              <Link href={q({ split: "none" })} className={`${seg(p.split === "none")} border-l border-slate-300`}>
                Итог за период
              </Link>
            </span>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {p.by === "category"
            ? "Переводы между своими счетами не доход и не расход: в статьи они не входят, их видно в учёте по счетам."
            : "Учёт по счетам показывает, где лежат деньги. Перевод между счетами виден с обеих сторон и в итоге даёт ноль."}{" "}
          Щёлкните по сумме, чтобы увидеть операции.
        </p>
      </Card>

      <Card>
        <FlowTable head={head} rows={rows} href={href} sumLast={p.by === "category" && sumLast} />
      </Card>

      {drill && (
        <div id="drill">
          <Card
            title={`${drillName} · ${formatDate(new Date(`${drillCol.from}T12:00:00Z`))} — ${formatDate(new Date(`${drillCol.to}T12:00:00Z`))}`}
            actions={
              <Link href={href} className="text-sm text-blue-600 hover:underline">
                Закрыть
              </Link>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className={th}>Дата</th>
                    <th className={th}>Счёт</th>
                    <th className={th}>Операция</th>
                    <th className={th}>Комментарий</th>
                    <th className={`${th} text-right`}>Сумма</th>
                  </tr>
                </thead>
                <tbody>
                  {drill.map((e) => (
                    <tr key={e.id} className="border-b last:border-0">
                      <td className={`${td} whitespace-nowrap`}>{formatDate(e.date, true)}</td>
                      <td className={td}>{e.cashbox}</td>
                      <td className={td}>
                        {e.href ? (
                          <Link href={e.href} className="text-blue-600 hover:underline">
                            {e.title}
                          </Link>
                        ) : (
                          e.title
                        )}
                      </td>
                      <td className={`${td} text-slate-600`}>{e.comment}</td>
                      <td className={`${td} text-right whitespace-nowrap ${e.amount < 0 ? "text-red-600" : "text-green-700"}`}>{formatRub(e.amount)}</td>
                    </tr>
                  ))}
                  {drill.length === 0 && (
                    <tr>
                      <td colSpan={5} className={`${td} text-slate-500`}>
                        Операций нет
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-right text-sm">
              Всего {drill.length} на <b>{formatRub(drill.reduce((a, e) => a + e.amount, 0))}</b>
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
