import { desktopReplicaRequestSchema, requestDesktopReplica } from "@/lib/services/offline-replica";

const noStore = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length"));
  const body = Number.isSafeInteger(length) && length >= 1 && length <= 2048
    ? await request.json().catch(() => null) : null;
  const input = desktopReplicaRequestSchema.safeParse(body);
  if (!input.success) {
    return Response.json({ error: "Неверный запрос сверки" }, { status: 400, headers: noStore });
  }

  const result = await requestDesktopReplica(input.data);
  const error = result.status === 409
    ? "Снимок устарел или СТО уже в резервном режиме"
    : "Код недействителен либо ПК не привязан к этой СТО";
  return Response.json(result.status === 200 ? result.body : { error }, { status: result.status, headers: noStore });
}
