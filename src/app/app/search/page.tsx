import Link from "next/link";
import type { ReactNode } from "react";
import { Card, Input, PageTitle } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatDate, orderNo, vehicleTitle, saleNo } from "@/lib/format";
import { formatRub } from "@/lib/money";
import { can } from "@/lib/permissions";
import { searchEverywhere } from "@/lib/services/lists";
import { stageLabel } from "@/lib/services/orders";

function Group({ title, all, children, empty }: { title: string; all?: string; children: ReactNode; empty: boolean }) {
  if (empty) return null;
  return (
    <Card
      title={title}
      actions={
        all && (
          <Link href={all} className="text-sm text-blue-600 hover:underline">
            Все в списке →
          </Link>
        )
      }
    >
      <ul className="flex flex-col divide-y text-sm">{children}</ul>
    </Card>
  );
}

const Item = ({ href, title, note }: { href: string; title: string; note?: string }) => (
  <li className="flex flex-wrap justify-between gap-2 py-1.5">
    <Link href={href} className="text-blue-600 hover:underline">
      {title}
    </Link>
    {note && <span className="text-slate-500">{note}</span>}
  </li>
);

/** Поиск «Везде»: клиенты, автомобили, заказ-наряды, калькуляции, продажи и товары по одной строке. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const s = await requireSession();
  const q = ((await searchParams).q ?? "").trim();
  const found = q
    ? await searchEverywhere(s.companyId, q, {
        clients: can(s.perms, "clients"),
        orders: can(s.perms, "orders"),
        stock: can(s.perms, "stock"),
        catalog: can(s.perms, "catalog"),
      })
    : null;
  const enc = encodeURIComponent(q);
  // товар открывается в справочнике, а без доступа к нему — в остатках склада
  const productList = can(s.perms, "catalog") ? "/app/catalog/products" : "/app/stock";
  const nothing = found && Object.values(found).every((x) => x.length === 0);
  return (
    <div className="flex flex-col gap-4">
      <PageTitle>Поиск</PageTitle>
      <Card>
        <form className="flex gap-2">
          <Input
            name="q"
            defaultValue={q}
            placeholder="Номер документа, клиент, телефон, госномер, VIN, товар или артикул"
            className="flex-1"
            autoFocus
          />
          <button className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">Найти</button>
        </form>
        {q && !found && <p className="mt-3 text-sm text-slate-500">Введите хотя бы два символа или номер документа.</p>}
        {nothing && <p className="mt-3 text-sm text-slate-500">Ничего не найдено.</p>}
      </Card>
      {found && (
        <>
          <Group title="Клиенты и автомобили" all={`/app/clients?q=${enc}`} empty={found.clients.length === 0}>
            {found.clients.map((c) => (
              <Item
                key={c.id}
                href={`/app/clients/${c.id}`}
                title={c.name}
                note={[c.phone, ...c.vehicles.map(vehicleTitle)].filter(Boolean).join(" · ")}
              />
            ))}
          </Group>
          <Group title="Заказ-наряды" all={`/app/orders?q=${enc}`} empty={found.orders.length === 0}>
            {found.orders.map((o) => (
              <Item
                key={o.id}
                href={`/app/orders/${o.id}`}
                title={`${orderNo(o.number, o.numberPrefix)} от ${formatDate(o.acceptedAt)}`}
                note={[o.client.name, o.vehicle ? vehicleTitle(o.vehicle) : "", stageLabel(o.stage)].filter(Boolean).join(" · ")}
              />
            ))}
          </Group>
          <Group title="Калькуляции" all={`/app/estimates?q=${enc}`} empty={found.estimates.length === 0}>
            {found.estimates.map((e) => (
              <Item key={e.id} href={`/app/estimates/${e.id}`} title={`К-${e.number} от ${formatDate(e.createdAt)}`} note={e.client.name} />
            ))}
          </Group>
          <Group title="Продажи" empty={found.sales.length === 0}>
            {found.sales.map((x) => (
              <Item
                key={x.id}
                href={`/app/stock/sales/${x.id}`}
                title={`${saleNo(x.number, x.numberPrefix)} от ${formatDate(x.date)}`}
                note={x.client?.name ?? "Без клиента"}
              />
            ))}
          </Group>
          <Group title="Товары" all={`${productList}?q=${enc}`} empty={found.products.length === 0}>
            {found.products.map((p) => (
              <Item
                key={p.id}
                href={`${productList}?q=${encodeURIComponent(p.article || p.name)}`}
                title={p.name}
                note={[p.article, p.brand, formatRub(p.price)].filter(Boolean).join(" · ")}
              />
            ))}
          </Group>
        </>
      )}
    </div>
  );
}
