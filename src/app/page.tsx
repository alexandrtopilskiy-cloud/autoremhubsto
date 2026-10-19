import Link from "next/link";
import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth";

export default async function Home() {
  if (await currentSession()) redirect("/app/orders");
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-4">
      <h1 className="text-3xl font-bold">AutoRemHub</h1>
      <p className="text-lg text-slate-600">
        Учёт для автосервиса: клиенты и автомобили, заказ-наряды с работами, запчастями и оплатами. Каждая СТО работает в
        своём отдельном кабинете.
      </p>
      <div className="flex gap-3">
        <Link href="/register" className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700">
          Зарегистрировать СТО
        </Link>
        <Link href="/login" className="rounded-md border border-slate-300 bg-white px-4 py-2 font-medium hover:bg-slate-50">
          Войти
        </Link>
      </div>
    </main>
  );
}
