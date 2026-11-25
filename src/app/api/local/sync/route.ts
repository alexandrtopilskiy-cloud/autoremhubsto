import { timingSafeEqual } from "node:crypto";
import { isLocalRuntime } from "@/lib/local-runtime";
import { pollDesktop } from "@/lib/services/local-desktop-sync";

export async function POST(request: Request) {
  if (!isLocalRuntime()) return new Response(null, { status: 404 });
  const expected = Buffer.from(process.env.STO_LOCAL_ACCESS ?? "");
  const provided = Buffer.from(request.headers.get("x-sto-desktop") ?? "");
  if (!expected.length || provided.length !== expected.length || !timingSafeEqual(expected, provided)) {
    return new Response(null, { status: 403 });
  }
  return Response.json(await pollDesktop(), { headers: { "Cache-Control": "private, no-store" } });
}
