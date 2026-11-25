import { gunzipSync } from "node:zlib";
import { desktopSyncRequest, requestDesktopSync, syncError } from "@/lib/services/desktop-sync";
import { UserError } from "@/lib/errors";

const noStore = { "Cache-Control": "private, no-store" };
const maxWire = 64 * 1024 * 1024;
const maxBody = 256 * 1024 * 1024;

export async function POST(request: Request) {
  const size = Number(request.headers.get("content-length"));
  if (!Number.isSafeInteger(size) || size < 1 || size > maxWire) {
    return Response.json({ error: "Пакет синхронизации слишком большой." }, { status: 413, headers: noStore });
  }
  let input: unknown;
  try {
    const bytes = Buffer.from(await request.arrayBuffer());
    if (bytes.length !== size) return new Response(null, { status: 400, headers: noStore });
    const raw = request.headers.get("content-encoding") === "gzip"
      ? gunzipSync(bytes, { maxOutputLength: maxBody }) : bytes;
    input = JSON.parse(raw.toString("utf8"));
  } catch {
    return new Response(null, { status: 400, headers: noStore });
  }
  const parsed = desktopSyncRequest.safeParse(input);
  if (!parsed.success) return new Response(null, { status: 400, headers: noStore });
  try {
    const reply = await requestDesktopSync(parsed.data);
    return Response.json("body" in reply ? reply.body : { error: "Сервер отклонил запрос синхронизации." },
      { status: reply.status, headers: noStore });
  } catch (error) {
    if (!(error instanceof UserError)) console.error("Desktop sync failed", error);
    return Response.json({ error: syncError(error) }, { status: error instanceof UserError ? 409 : 500, headers: noStore });
  }
}
