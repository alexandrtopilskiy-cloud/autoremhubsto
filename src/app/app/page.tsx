import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { allowedNav } from "@/lib/nav";

/** Стартовая страница — первый доступный раздел: заказ-наряды, если они есть в правах. */
export default async function AppHome() {
  const s = await requireSession();
  const nav = allowedNav(s.perms);
  redirect((nav.find((n) => n.href === "/app/orders") ?? nav[0])?.href ?? "/app/settings");
}
