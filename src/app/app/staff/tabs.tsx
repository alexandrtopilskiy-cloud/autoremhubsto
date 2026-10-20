import Link from "next/link";

const tabs = [
  { key: "staff", href: "/app/staff", label: "Сотрудники и доступ" },
  { key: "payroll", href: "/app/staff/payroll", label: "Зарплата" },
];

export function StaffTabs({ active }: { active: string }) {
  return (
    <div className="flex gap-2">
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
