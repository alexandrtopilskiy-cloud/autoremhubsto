import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { Card, Input, PageTitle, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { listClients } from "@/lib/services/clients";
import { createClientAction } from "./actions";
import { ClientFields } from "./client-fields";
import { listCategories } from "@/lib/services/prices";
import { dicts } from "@/lib/services/dictionaries";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; archived?: string }> }) {
  const s = await requireSession();
  const lists = await dicts(s.companyId, ["CLIENT_SOURCE"]);
  const categories = await listCategories(s.companyId);
  const { q, archived } = await searchParams;
  const clients = await listClients(s.companyId, q, { archived: archived === "1" });
  return (
    <div className="flex flex-col gap-4">
      <PageTitle
        actions={
          <Link href="/app/recommendations" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50">
            Рекомендации клиентам
          </Link>
        }
      >
        Клиенты
      </PageTitle>
      <Card title="Новый клиент">
        <ActionForm action={createClientAction} className="flex flex-wrap items-end gap-3">
          <ClientFields categories={categories} sources={lists.CLIENT_SOURCE} />
          <Submit>Добавить</Submit>
        </ActionForm>
      </Card>
      <Card>
        <form className="mb-3 flex flex-wrap items-center gap-2">
          <Input name="q" defaultValue={q} placeholder="Имя, телефон, госномер или VIN" className="min-w-72" />
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" name="archived" value="1" defaultChecked={archived === "1"} /> архив
          </label>
          <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Найти</button>
        </form>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className={th}>Клиент</th>
              <th className={th}>Телефон</th>
              <th className={th}>Автомобили</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} className="border-b last:border-0 hover:bg-slate-50">
                <td className={td}>
                  <Link href={`/app/clients/${c.id}`} className="text-blue-600 hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td className={td}>{c.phone}</td>
                <td className={td}>{c.vehicles.map((v) => [v.make, v.model, v.plate].filter(Boolean).join(" ")).join(", ")}</td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr>
                <td className={`${td} text-slate-500`} colSpan={3}>
                  Клиентов не найдено
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
