import Link from "next/link";

const tabs = [
  { key: "balances", href: "/app/stock", label: "Остатки" },
  { key: "receipts", href: "/app/stock/receipts", label: "Приход товара" },
  { key: "suppliers", href: "/app/stock/suppliers", label: "Поставщики" },
];

export function StockTabs({ active }: { active: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`rounded-full px-3 py-1 text-sm ${t.key === active ? "bg-blue-600 text-white" : "border border-slate-300 bg-white"}`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
