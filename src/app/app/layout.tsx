import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { logoutAction } from "./actions";

const nav = [
  { href: "/app/orders", label: "Заказ-наряды" },
  { href: "/app/clients", label: "Клиенты" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/app/orders" className="font-bold">
            AutoRemHub
          </Link>
          <nav className="flex gap-4 text-sm">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="text-slate-700 hover:text-blue-600">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-slate-600">
            <span>
              {s.companyName} · {s.userName}
            </span>
            <form action={logoutAction}>
              <button className="text-blue-600 hover:underline">Выйти</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
