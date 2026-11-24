import { pairWorkstation, workstationPairingSchema } from "@/lib/services/offline-reserve";

function reply(body: object, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length"));
  if (!Number.isSafeInteger(length) || length < 1 || length > 2048) {
    return reply({ error: "Неверный размер запроса" }, 400);
  }

  const input = workstationPairingSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return reply({ error: "Проверьте код и имя компьютера" }, 400);
  if (!await pairWorkstation(input.data)) {
    return reply({ error: "Не удалось привязать ПК. Проверьте статус в кабинете или получите новый код." }, 409);
  }
  return reply({ paired: true }, 200);
}
