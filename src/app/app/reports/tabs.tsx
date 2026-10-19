"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ReportTabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <nav className="mb-4 flex flex-wrap gap-1 border-b border-slate-200 print:hidden">
      {tabs.map((t) => {
        const active = path === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${active ? "border-blue-600 font-medium text-blue-700" : "border-transparent text-slate-600 hover:text-blue-600"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
