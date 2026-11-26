import { currentSession } from "@/lib/auth";
import { replicaRequestSchema, requestReplica } from "@/lib/services/offline-replica";

const noStore = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  const session = await currentSession();
  if (!session) return Response.json({ error: "Войдите в кабинет" }, { status: 401, headers: noStore });
  if (!session.isOfflineMaster || session.role !== "OWNER") {
    return Response.json({ error: "Доступно владельцу, назначенному мастером резерва" }, { status: 403, headers: noStore });
  }
  const length = Number(request.headers.get("content-length"));
  if (!Number.isSafeInteger(length) || length < 1 || length > 2048) {
    return Response.json({ error: "Неверный размер запроса" }, { status: 400, headers: noStore });
  }
  const input = replicaRequestSchema.safeParse(await request.json().catch(() => null));
  if (!input.success || input.data.companyId !== session.companyId) {
    return Response.json({ error: "Неверный запрос сверки" }, { status: 400, headers: noStore });
  }
  const result = await requestReplica(session.userId, input.data);
  const error = result.status === 409 ? "Снимок устарел или СТО уже в резервном режиме" : "Не удалось подтвердить привязанный ПК";
  return Response.json(result.status === 200 ? result.body : { error }, { status: result.status, headers: noStore });
}
