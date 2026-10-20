import Link from "next/link";

const tabs = [
  { key: "works", href: "/app/catalog/works", label: "Работы" },
  { key: "products", href: "/app/catalog/products", label: "Товары и материалы" },
  { key: "prices", href: "/app/catalog/prices", label: "Категории цен" },
  { key: "dictionaries", href: "/app/catalog/dictionaries", label: "Общие справочники" },
];

export function CatalogTabs({ active }: { active: string }) {
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
