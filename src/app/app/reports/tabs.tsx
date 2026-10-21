"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ReportTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="flex flex-wrap gap-x-6 gap-y-1 border-b border-slate-200 print:hidden">
      {tabs.map((t) => {
        const active = path === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px border-b-2 py-2 text-[15px] ${active ? "border-blue-500 font-medium text-blue-600" : "border-transparent text-slate-600 hover:text-blue-600"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
