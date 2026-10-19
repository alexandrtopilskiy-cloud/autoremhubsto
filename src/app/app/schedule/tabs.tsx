import Link from "next/link";

export function ScheduleTabs({ active, date }: { active: "day" | "week" | "list"; date: string }) {
  const tabs = [
    { key: "day", href: `/app/schedule?date=${date}`, label: "День" },
    { key: "week", href: `/app/schedule?date=${date}&view=week`, label: "Неделя" },
    { key: "list", href: `/app/schedule/list?from=${date}`, label: "Список записей" },
  ];
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
