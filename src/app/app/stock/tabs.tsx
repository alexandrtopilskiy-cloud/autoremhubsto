import Link from "next/link";

const tabs = [
  { key: "balances", href: "/app/stock", label: "Остатки" },
  { key: "receipts", href: "/app/stock/receipts", label: "Приход товара" },
  { key: "orders", href: "/app/stock/orders", label: "Заказы поставщикам" },
  { key: "sales", href: "/app/stock/sales", label: "Продажи" },
  { key: "writeoffs", href: "/app/stock/writeoffs", label: "Списания" },
  { key: "inventory", href: "/app/stock/inventory", label: "Инвентаризация" },
  { key: "requests", href: "/app/stock/requests", label: "Требования" },
  { key: "suppliers", href: "/app/stock/suppliers", label: "Поставщики" },
];

export function StockTabs({ active }: { active: string }) {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1 border-b border-slate-200">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`-mb-px border-b-2 py-2 text-[15px] ${t.key === active ? "border-blue-500 font-medium text-blue-600" : "border-transparent text-slate-600 hover:text-blue-600"}`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
