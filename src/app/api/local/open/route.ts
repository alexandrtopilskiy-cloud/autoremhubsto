import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { isLocalRuntime, LOCAL_ACCESS_COOKIE } from "@/lib/local-runtime";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  if (!isLocalRuntime()) return new Response(null, { status: 404 });
  const expected = Buffer.from(process.env.STO_LOCAL_ACCESS ?? "");
  const provided = Buffer.from(new URL(request.url).searchParams.get("key") ?? "");
  if (!expected.length || provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return new Response(null, { status: 403 });
  }
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: "/login", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
  response.cookies.set(LOCAL_ACCESS_COOKIE, expected.toString(), { httpOnly: true, sameSite: "strict", path: "/" });
  return response;
}
