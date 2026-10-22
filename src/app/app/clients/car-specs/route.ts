import { currentSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { carModifications } from "@/lib/services/car-catalog";

/** Модификации модели из справочника автомобилей — для подсказок в карточке автомобиля клиента. */
export async function GET(req: Request) {
  const s = await currentSession();
  if (!s) return new Response("Нужно войти", { status: 401 });
  if (!can(s.perms, "clients") && !can(s.perms, "catalog")) return new Response("Недостаточно прав", { status: 403 });
  const q = new URL(req.url).searchParams;
  const make = q.get("make") ?? "";
  const model = q.get("model") ?? "";
  const rows = make && model ? await carModifications(s.companyId, make, model) : [];
  return Response.json(rows, { headers: { "Cache-Control": "no-store" } });
}
