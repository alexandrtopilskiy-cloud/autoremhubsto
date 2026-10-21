import Link from "next/link";

export function ScheduleTabs({ active, date }: { active: "day" | "week" | "month" | "list"; date: string }) {
  const tabs = [
    { key: "day", href: `/app/schedule?date=${date}`, label: "День" },
    { key: "week", href: `/app/schedule?date=${date}&view=week`, label: "Неделя" },
    { key: "month", href: `/app/schedule?date=${date}&view=month`, label: "Месяц" },
    { key: "list", href: `/app/schedule/list?from=${date}`, label: "Список записей" },
  ];
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
