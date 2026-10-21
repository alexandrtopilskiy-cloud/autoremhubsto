import Link from "next/link";

const tabs = [
  { key: "staff", href: "/app/staff", label: "Сотрудники и доступ" },
  { key: "payroll", href: "/app/staff/payroll", label: "Зарплата" },
];

export function StaffTabs({ active }: { active: string }) {
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
