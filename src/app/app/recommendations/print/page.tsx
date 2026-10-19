import { PrintButton } from "@/app/app/orders/[id]/print/print-button";
import { requireSession } from "@/lib/auth";
import { formatDate, formatQty, vehicleTitle } from "@/lib/format";
import { formatRub } from "@/lib/money";
import { listRecommendations } from "@/lib/services/recommendations";

/** Список открытых рекомендаций для обзвона клиентов. */
export default async function PrintRecommendations() {
  const s = await requireSession();
  const list = await listRecommendations(s.companyId, { status: "OPEN" });
  const byClient = new Map<string, typeof list>();
  for (const r of list) byClient.set(r.clientId, [...(byClient.get(r.clientId) ?? []), r]);
  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-sm print:p-0">
      <div className="mb-4 flex justify-between print:hidden">
        <span className="text-slate-500">Предпросмотр печати</span>
        <PrintButton />
      </div>
      <h1 className="mb-4 text-lg font-bold">Невыполненные рекомендации на {formatDate(new Date())}</h1>
      {[...byClient.values()].map((recs) => (
        <div key={recs[0].clientId} className="mb-4 break-inside-avoid">
          <p className="font-semibold">
            {recs[0].client.name} {recs[0].client.phone}
          </p>
          <ul className="list-disc pl-5">
            {recs.map((r) => (
              <li key={r.id}>
                {formatDate(r.createdAt)} · {r.vehicle ? `${vehicleTitle(r.vehicle)} · ` : ""}
                {r.name}
                {Number(r.qty) !== 1 && ` × ${formatQty(Number(r.qty))}`}
                {r.price > 0 && `, ${formatRub(Math.round(Number(r.qty) * r.price))}`}
                {r.comment && ` (${r.comment})`}
              </li>
            ))}
          </ul>
        </div>
      ))}
      {list.length === 0 && <p>Открытых рекомендаций нет.</p>}
    </div>
  );
}
