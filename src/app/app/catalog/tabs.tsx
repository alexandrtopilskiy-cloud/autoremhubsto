import Link from "next/link";

const tabs = [
  { key: "works", href: "/app/catalog/works", label: "Работы" },
  { key: "products", href: "/app/catalog/products", label: "Товары и материалы" },
  { key: "prices", href: "/app/catalog/prices", label: "Категории цен" },
  { key: "dictionaries", href: "/app/catalog/dictionaries", label: "Общие справочники" },
  { key: "excel", href: "/app/excel", label: "Загрузка из Excel" },
];

export function CatalogTabs({ active }: { active: string }) {
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
