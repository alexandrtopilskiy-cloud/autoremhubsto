import { gunzip as decompress } from "node:zlib";
import { promisify } from "node:util";
import { authorizeSyncEnvelope, desktopSyncEnvelope, hashSyncPayload, requestDesktopSync, syncError } from "@/lib/services/desktop-sync";
import { UserError } from "@/lib/errors";

const gunzip = promisify(decompress);
const noStore = { "Cache-Control": "private, no-store" };
const maxWire = 64 * 1024 * 1024;
const maxBody = 256 * 1024 * 1024;

export async function POST(request: Request) {
  const size = Number(request.headers.get("content-length"));
  if (!Number.isSafeInteger(size) || size < 1 || size > maxWire) {
    return Response.json({ error: "Пакет синхронизации слишком большой." }, { status: 413, headers: noStore });
  }
  const envelope = desktopSyncEnvelope.safeParse({
    companyId: request.headers.get("x-sto-company"),
    deviceId: request.headers.get("x-sto-device"),
    at: Number(request.headers.get("x-sto-at")),
    publicKey: request.headers.get("x-sto-key"),
    signature: request.headers.get("x-sto-proof"),
    payloadHash: request.headers.get("x-sto-payload-hash"),
  });
  if (!envelope.success) return new Response(null, { status: 400, headers: noStore });
  try {
    const status = await authorizeSyncEnvelope(envelope.data);
    if (status !== 200) return new Response(null, { status, headers: noStore });
    let payload: string;
    try {
      const bytes = Buffer.from(await request.arrayBuffer());
      if (bytes.length !== size) return new Response(null, { status: 400, headers: noStore });
      const raw = request.headers.get("content-encoding") === "gzip"
        ? await gunzip(bytes, { maxOutputLength: maxBody }) : bytes;
      payload = raw.toString("utf8");
    } catch {
      return new Response(null, { status: 400, headers: noStore });
    }
    if (hashSyncPayload(payload) !== envelope.data.payloadHash) {
      return new Response(null, { status: 400, headers: noStore });
    }
    const reply = await requestDesktopSync({ ...envelope.data, payload });
    return Response.json("body" in reply ? reply.body : { error: "Сервер отклонил запрос синхронизации." },
      { status: reply.status, headers: noStore });
  } catch (error) {
    if (!(error instanceof UserError)) console.error("Desktop sync failed", error);
    return Response.json({ error: syncError(error) }, { status: error instanceof UserError ? 409 : 500, headers: noStore });
  }
}
